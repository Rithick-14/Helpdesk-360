import { db } from '../db.js';
import { ACTIVE, PRIORITY_ORDER, SLA_HOURS, NEXT_STATUS } from '../constants.js';

const selectColumns = `t.id, t.title, t.category, t.priority, t.status,
  reporter.username AS reported_by, assignee.username AS assigned_to,
  t.created_at, t.updated_at`;
const joins = `FROM tickets t JOIN users reporter ON reporter.id=t.reported_by_id
  LEFT JOIN users assignee ON assignee.id=t.assigned_to_id`;

export function ticketFilterWhere(filters = {}, user = null) {
  const where = [];
  const args = [];
  if (user?.role === 'employee') { where.push('t.reported_by_id = ?'); args.push(user.id); }
  const statuses = filters.status ? (Array.isArray(filters.status) ? filters.status : String(filters.status).split(',')) : [];
  if (statuses.length) { where.push(`t.status IN (${statuses.map(()=>'?').join(',')})`); args.push(...statuses); }
  if (filters.active) where.push("t.status IN ('open','in-progress')");
  if (filters.priority) { where.push('t.priority = ?'); args.push(filters.priority); }
  if (filters.category) { where.push('t.category = ?'); args.push(filters.category); }
  if (filters.assigned === 'unassigned') where.push('t.assigned_to_id IS NULL');
  else if (filters.assigned === 'me') { where.push('t.assigned_to_id = ?'); args.push(user?.id); }
  else if (filters.assigned && /^\d+$/.test(String(filters.assigned))) { where.push('t.assigned_to_id = ?'); args.push(Number(filters.assigned)); }
  else if (filters.assigned) { where.push('t.assigned_to_id = (SELECT id FROM users WHERE username=?)'); args.push(filters.assigned); }
  if (filters.q) { where.push('instr(lower(t.title),lower(?)) > 0'); args.push(filters.q); }
  if (filters.overdue) where.push(`t.status IN ('open','in-progress') AND julianday('now') > julianday(t.created_at) +
    CASE t.priority WHEN 'urgent' THEN 1.0/24 WHEN 'high' THEN 4.0/24 WHEN 'medium' THEN 1.0 WHEN 'low' THEN 3.0 END`);
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

export function countTickets(filters = {}, user = null) {
  const where = ticketFilterWhere(filters, user);
  return db.prepare(`SELECT COUNT(*) AS count FROM tickets t ${where.sql}`).get(...where.args).count;
}

export function listTickets(user, filters = {}) {
  const where = ticketFilterWhere(filters, user);
  // Queue contract: active rows, then priority urgency, then oldest first; all filtering is parameterized SQL.
  const sql = `SELECT ${selectColumns} ${joins} ${where.sql}
    ORDER BY CASE WHEN t.status IN ('open','in-progress') THEN 0 ELSE 1 END, ${PRIORITY_ORDER}, t.created_at ASC, t.id ASC`;
  return db.prepare(sql).all(...where.args).map((ticket) => ({ ...ticket, ...slaFlags(ticket) }));
}

export function slaFlags(ticket) {
  const createdMs = Date.parse(ticket.created_at);
  const due = new Date(createdMs + SLA_HOURS[ticket.priority] * 3600000);
  const active = ACTIVE.includes(ticket.status);
  return {
    sla_due_at: due.toISOString(),
    sla_overdue: active && Date.now() > due.getTime(),
    is_stale: active && Date.now() - Date.parse(ticket.updated_at) > 48 * 3600000,
  };
}

export function getTicket(id) {
  return db.prepare(`SELECT ${selectColumns}, t.description, t.rating, t.rating_comment, t.rated_at,
      reporter.display_name AS reported_by_name, assignee.display_name AS assigned_to_name
    ${joins} WHERE t.id=?`).get(id);
}

export function getHistory(id) {
  return db.prepare(`SELECT h.id,h.event,h.from_value,h.to_value,h.changed_at,u.username AS changed_by,u.display_name AS changed_by_name,
      old_assignee.username AS from_assignee,new_assignee.username AS to_assignee
    FROM status_history h JOIN users u ON u.id=h.changed_by_id
    LEFT JOIN users old_assignee ON h.event='assignment' AND old_assignee.id=CAST(h.from_value AS INTEGER)
    LEFT JOIN users new_assignee ON h.event='assignment' AND (new_assignee.id=CAST(h.to_value AS INTEGER) OR new_assignee.username=h.to_value)
    WHERE h.ticket_id=? ORDER BY h.id`).all(id);
}

export function getComments(id, viewerRole='technician') {
  const visibility = viewerRole === 'employee' ? " AND c.kind<>'internal_note'" : '';
  return db.prepare(`SELECT c.id,c.body,c.kind,c.created_at,u.username AS author,u.display_name AS author_name,u.role AS author_role
    FROM comments c JOIN users u ON u.id=c.author_id WHERE c.ticket_id=?${visibility} ORDER BY c.id`).all(id);
}

export function changeTicket(id, actor, input) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
  if (!ticket) return { error: 'Ticket not found.', status: 404 };
  if (!('status' in input) && !('assigned_to' in input)) return { error: 'Provide a status or assigned_to change.', status: 400 };
  // Status can advance by exactly one state; the backend rejects same-state and impossible jumps.
  if ('status' in input) {
    const allowed = NEXT_STATUS[ticket.status];
    if (input.status === ticket.status) return { error: 'The ticket already has that status.', status: 400 };
    if (input.status !== allowed) return { error: `The next allowed status is ${allowed ?? 'none; this ticket is closed'}.`, status: 400 };
  }
  let assigneeId = ticket.assigned_to_id;
  // Assignment changes ownership only; it never modifies ticket status.
  if ('assigned_to' in input) {
    assigneeId = input.assigned_to;
    if (assigneeId !== null) {
      const technician = db.prepare("SELECT id FROM users WHERE id=? AND role='technician'").get(assigneeId);
      if (!technician) return { error: 'assigned_to must identify an existing technician.', status: 400 };
    }
  }
  // Ticket update, history event, updated_at, and reporter notification are atomic in this transaction.
  const tx = db.transaction(() => {
    const now = new Date().toISOString().replace('.000Z','Z');
    if ('status' in input) {
      db.prepare('UPDATE tickets SET status=?,updated_at=? WHERE id=?').run(input.status, now, id);
      db.prepare("INSERT INTO status_history(ticket_id,event,from_value,to_value,changed_by_id,changed_at) VALUES(?,'status_change',?,?,?,?)")
        .run(id, ticket.status, input.status, actor.id, now);
      db.prepare('INSERT INTO notifications(user_id,ticket_id,message,created_at) VALUES(?,?,?,?)')
        .run(ticket.reported_by_id,id,`Ticket #${id} status changed to ${input.status}.`,now);
      if (input.status === 'resolved' && input.resolution_note) {
        db.prepare("INSERT INTO comments(ticket_id,author_id,body,kind,created_at) VALUES(?,?,?,'resolution',?)")
          .run(id,actor.id,input.resolution_note,now);
      }
    }
    if ('assigned_to' in input && assigneeId !== ticket.assigned_to_id) {
      db.prepare('UPDATE tickets SET assigned_to_id=?,updated_at=? WHERE id=?').run(assigneeId, now, id);
      db.prepare("INSERT INTO status_history(ticket_id,event,from_value,to_value,changed_by_id,changed_at) VALUES(?,'assignment',?,?,?,?)")
        .run(id, ticket.assigned_to_id == null ? null : String(ticket.assigned_to_id), assigneeId == null ? null : String(assigneeId), actor.id, now);
      db.prepare('INSERT INTO notifications(user_id,ticket_id,message,created_at) VALUES(?,?,?,?)')
        .run(ticket.reported_by_id,id,`Ticket #${id} assignment was updated.`,now);
    }
  });
  tx();
  return { ticket: getTicket(id) };
}

export function claimTicket(id, actor) {
  const tx=db.transaction(()=>{
    let ticket=db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
    if(!ticket)return {error:'Ticket not found.',status:404};
    if(!ACTIVE.includes(ticket.status))return {error:'Resolved or closed tickets cannot be claimed.',status:400};
    if(ticket.assigned_to_id===actor.id)return {ticket:getTicket(id),claimed:false};
    if(ticket.assigned_to_id!==null){
      const owner=db.prepare('SELECT display_name FROM users WHERE id=?').get(ticket.assigned_to_id);
      return {error:`Already assigned to ${owner?.display_name||'another technician'}.`,status:409};
    }
    const now=new Date().toISOString().replace('.000Z','Z');
    const update=db.prepare("UPDATE tickets SET assigned_to_id=?,updated_at=? WHERE id=? AND assigned_to_id IS NULL AND status IN ('open','in-progress')").run(actor.id,now,id);
    if(!update.changes){
      ticket=db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
      if(ticket?.assigned_to_id===actor.id)return {ticket:getTicket(id),claimed:false};
      if(ticket?.assigned_to_id!==null){const owner=db.prepare('SELECT display_name FROM users WHERE id=?').get(ticket.assigned_to_id);return {error:`Already assigned to ${owner?.display_name||'another technician'}.`,status:409};}
      return {error:'Resolved or closed tickets cannot be claimed.',status:400};
    }
    db.prepare("INSERT INTO status_history(ticket_id,event,from_value,to_value,changed_by_id,changed_at) VALUES(?,'assignment',NULL,?,?,?)").run(id,actor.username,actor.id,now);
    db.prepare('INSERT INTO notifications(user_id,ticket_id,message,created_at) VALUES(?,?,?,?)').run(ticket.reported_by_id,id,`Ticket #${id} was assigned to ${actor.display_name}.`,now);
    return {ticket:getTicket(id),claimed:true};
  });
  return tx.immediate();
}

export function rateTicket(id, actor, rating, comment) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
  if (!ticket) return { error: 'Ticket not found.', status: 404 };
  if (ticket.reported_by_id !== actor.id) return { error: 'Only the employee who reported this ticket may rate it.', status: 403 };
  if (!['resolved','closed'].includes(ticket.status)) return { error: 'A ticket can be rated after it is resolved or closed.', status: 400 };
  // Rating is reporter-only and deliberately does not touch updated_at or status_history.
  const result = db.prepare('UPDATE tickets SET rating=?,rating_comment=?,rated_at=strftime(\'%Y-%m-%dT%H:%M:%SZ\',\'now\') WHERE id=? AND rating IS NULL')
    .run(rating, comment ?? null, id);
  if (!result.changes) return { error: 'This ticket has already been rated.', status: 400 };
  return { ticket: getTicket(id) };
}

export const ticketSql = { selectColumns, joins };
