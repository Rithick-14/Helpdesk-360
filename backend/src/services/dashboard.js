import { db } from '../db.js';
import { countTickets } from './tickets.js';
const how = (filter, endpoint = 'GET /api/tickets; shared tickets SQL filter') => ({ how: `${filter} Source: ${endpoint}.` });

export function dashboardData() {
  const statuses=['open','in-progress','resolved','closed'];
  const status = Object.fromEntries(statuses.map((s) => [s, countTickets({status:s})]));
  const statusFilters=Object.fromEntries(statuses.map(s=>[s,{status:s}]));
  const urgentFilter={priority:'urgent',active:'1'};
  const unassignedFilter={assigned:'unassigned',active:'1'};
  const completedFilter={status:['resolved','closed']};
  const overdueFilter={overdue:'1'};
  const urgentActive=countTickets(urgentFilter);
  const unassignedActive=countTickets(unassignedFilter);
  const byTechnician = db.prepare("SELECT id,username,display_name FROM users WHERE role='technician' ORDER BY display_name").all().map((t)=>{
    const activeFilter={assigned:t.username,active:'1'};
    const doneFilter={assigned:t.username,status:['resolved','closed']};
    return {...t,active:countTickets(activeFilter),completed:countTickets(doneFilter),active_filter:activeFilter,completed_filter:doneFilter};
  });
  const byPriority=['urgent','high','medium','low'].map(priority=>({priority,count:countTickets({priority}),filter:{priority}}));
  const byCategory=['hardware','network','software','account-access'].map(category=>({category,count:countTickets({category}),filter:{category}}));
  const overdue=countTickets(overdueFilter);
  const avg = db.prepare(`SELECT AVG((julianday(r.resolved_at)-julianday(t.created_at))*86400) AS seconds,COUNT(*) AS count
    FROM tickets t JOIN (SELECT ticket_id,MIN(changed_at) AS resolved_at FROM status_history
      WHERE event='status_change' AND to_value='resolved' GROUP BY ticket_id) r ON r.ticket_id=t.id
    WHERE t.status IN ('resolved','closed')`).get();
  const avgSeconds=avg.seconds;
  const createdDaily = db.prepare(`SELECT date(created_at) AS day,COUNT(*) AS count FROM tickets
    WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-6 days') GROUP BY date(created_at) ORDER BY day`).all();
  const rating = db.prepare('SELECT AVG(rating) AS average,COUNT(rating) AS count FROM tickets WHERE rating IS NOT NULL').get();
  const ratingsByTechnician = db.prepare(`SELECT u.id,AVG(t.rating) AS average,COUNT(t.rating) AS count
    FROM users u LEFT JOIN tickets t ON t.assigned_to_id=u.id WHERE u.role='technician' GROUP BY u.id`).all();
  return {
    status: { ...status, filters:statusFilters, how:how('Each status is counted by the shared ticket filter builder.') },
    urgent_active: { count: urgentActive, filter:urgentFilter, ...how("priority='urgent' AND status IN ('open','in-progress').") },
    unassigned_active: { count: unassignedActive, filter:unassignedFilter, ...how("assigned_to IS NULL AND status IN ('open','in-progress').") },
    completed: { resolved: status.resolved, closed: status.closed, filter:completedFilter, resolved_filter:{status:'resolved'}, closed_filter:{status:'closed'}, ...how("status IN ('resolved','closed'), split by status.") },
    by_technician: { items: byTechnician, how: "Each row uses the shared ticket filter builder for the technician username; completed is resolved or closed." },
    by_priority: { items: byPriority, how:how('One shared-filter count per fixed priority.') },
    by_category: { items: byCategory, how:how('One shared-filter count per fixed category.') },
    overdue: { count: overdue, filter:overdueFilter, how: 'Active tickets whose created_at plus the priority SLA (urgent 1h, high 4h, medium 24h, low 72h) is in the past.' },
    average_resolution_hours: { value: avgSeconds == null ? null : Math.round(avgSeconds/3600*10)/10, count:avg.count, ...how("Resolved and closed tickets with a first resolved history event; elapsed from created_at to first resolution.", 'tickets + status_history') },
    created_last_7_days: { items: createdDaily, ...how("Tickets created in the last seven calendar days, grouped by UTC date.") },
    ratings: { average: rating.average == null ? null : Math.round(rating.average*10)/10, count: rating.count, ...how('Average and count of non-null tickets.rating values.') },
    empty: db.prepare('SELECT COUNT(*) AS count FROM tickets').get().count === 0,
  };
}
