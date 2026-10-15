import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

const testDir=fs.mkdtempSync(path.join(os.tmpdir(),'helpdesk360-'));
process.env.DB_PATH=path.join(testDir,'test.sqlite');
process.env.JWT_SECRET='test-only-secret-that-is-not-for-production';
process.env.SEED_DEMO='false';
process.env.NODE_ENV='test';
const {app}=await import('../src/server.js');
const {db}=await import('../src/db.js');
let employee, otherEmployee, technician, noTicketsTech, ticketId;
const employeeAgent=request.agent(app), otherAgent=request.agent(app), techAgent=request.agent(app), emptyTechAgent=request.agent(app);
const creds=[['employee.test','Employee Test','employee'],['other.test','Other Employee','employee'],['tech.test','Tech Test','technician'],['empty.tech','Empty Tech','technician']];

before(async()=>{
  const insert=db.prepare('INSERT INTO users(username,display_name,password_hash,role) VALUES(?,?,?,?)');
  const ids={};for(const [username,name,role] of creds)ids[username]=Number(insert.run(username,name,await bcrypt.hash('TestOnly!123',10),role).lastInsertRowid);
  employee={id:ids['employee.test'],username:'employee.test',role:'employee'};
  otherEmployee={id:ids['other.test'],username:'other.test',role:'employee'};
  technician={id:ids['tech.test'],username:'tech.test',role:'technician'};
  noTicketsTech={id:ids['empty.tech'],username:'empty.tech',role:'technician'};
  for(const [agent,username] of [[employeeAgent,'employee.test'],[otherAgent,'other.test'],[techAgent,'tech.test'],[emptyTechAgent,'empty.tech']]){
    const res=await agent.post('/api/auth/login').send({username,password:'TestOnly!123'});assert.equal(res.status,200);
  }
});
after(()=>{db.close();fs.rmSync(testDir,{recursive:true,force:true});});

async function create(agent=employeeAgent,extra={}){return agent.post('/api/tickets').send({title:'Laptop support request',description:'Laptop is not starting after this morning update.',category:'hardware',priority:'high',...extra});}

test('login accepts a correct password and uses a generic failed-login message',async()=>{
  const good=await request(app).post('/api/auth/login').send({username:'employee.test',password:'TestOnly!123'});assert.equal(good.status,200);assert.match(good.headers['set-cookie'][0],/HttpOnly/i);assert.match(good.headers['set-cookie'][0],/SameSite=Lax/i);
  const bad=await request(app).post('/api/auth/login').send({username:'missing',password:'wrong'});assert.equal(bad.status,401);assert.deepEqual(bad.body,{error:'Username or password is incorrect.'});
});
test('unauthenticated reads return 401 JSON',async()=>{const r=await request(app).get('/api/tickets');assert.equal(r.status,401);assert.equal(typeof r.body.error,'string');});
test('employee ticket submission persists and duplicate client tokens are idempotent',async()=>{
  const client_token='fe2c8bb5-2778-45b6-aef4-976ed893113b';const first=await create(employeeAgent,{client_token});assert.equal(first.status,201);ticketId=first.body.id;
  const second=await create(employeeAgent,{client_token});assert.equal(second.status,200);assert.equal(second.body.id,ticketId);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE client_token=?').get(client_token).n,1);
});
test('employee sees only own tickets and cannot read a coworker ticket',async()=>{
  const own=await employeeAgent.get('/api/tickets');assert.equal(own.status,200);assert.ok(own.body.items.some(t=>t.id===ticketId));
  const created=await create(otherAgent,{title:'Other employee ticket'});assert.equal(created.status,201);
  const forbidden=await employeeAgent.get(`/api/tickets/${created.body.id}`);assert.equal(forbidden.status,403);assert.equal(typeof forbidden.body.error,'string');
});
test('only technicians can change status or assignment',async()=>{const r=await employeeAgent.patch(`/api/tickets/${ticketId}`).send({status:'in-progress'});assert.equal(r.status,403);});
test('invalid category and priority are rejected with 400',async()=>{
  assert.equal((await create(employeeAgent,{category:'other'})).status,400);
  assert.equal((await create(employeeAgent,{priority:'critical'})).status,400);
});
test('empty, whitespace and oversized fields return 400',async()=>{
  assert.equal((await create(employeeAgent,{title:'  '})).status,400);
  assert.equal((await create(employeeAgent,{description:'  '})).status,400);
  assert.equal((await create(employeeAgent,{description:'x'.repeat(10000)})).status,400);
});
test('script tags and SQL-looking input round trip as plain text',async()=>{
  const title="<script>alert('x')</script> SELECT * FROM tickets;";const desc="User supplied text: <script>alert('safe')</script> OR 1=1";
  const saved=await create(employeeAgent,{title,description:desc});assert.equal(saved.status,201);assert.equal(saved.body.title,title);assert.equal(saved.body.description,desc);
});
test('assignment accepts a technician and rejects missing or employee accounts',async()=>{
  const assigned=await techAgent.patch(`/api/tickets/${ticketId}`).send({assigned_to:technician.id});assert.equal(assigned.status,200);assert.equal(assigned.body.assigned_to,technician.username);
  for(const id of [999999,employee.id,Number.MAX_SAFE_INTEGER+1]){const r=await techAgent.patch(`/api/tickets/${ticketId}`).send({assigned_to:id});assert.equal(r.status,400);}
});
test('status moves one step at a time and records UTC history',async()=>{
  const impossible=await techAgent.patch(`/api/tickets/${ticketId}`).send({status:'resolved'});assert.equal(impossible.status,400);assert.match(impossible.body.error,/in-progress/);
  const changed=await techAgent.patch(`/api/tickets/${ticketId}`).send({status:'in-progress'});assert.equal(changed.status,200);assert.equal(changed.body.status,'in-progress');
  const hist=db.prepare("SELECT event,to_value,changed_at FROM status_history WHERE ticket_id=? ORDER BY id DESC LIMIT 1").get(ticketId);assert.equal(hist.event,'status_change');assert.equal(hist.to_value,'in-progress');assert.match(hist.changed_at,/Z$/);
});
test('queue filters and orders active tickets with urgent first',async()=>{
  const urgent=await create(employeeAgent,{title:'Urgent network issue',category:'network',priority:'urgent'});assert.equal(urgent.status,201);
  const list=await techAgent.get('/api/tickets?priority=urgent');assert.equal(list.status,200);assert.ok(list.body.items.every(t=>t.priority==='urgent'));
  assert.ok(list.body.items.findIndex(t=>t.id===urgent.body.id)>=0);
  const all=await techAgent.get('/api/tickets');const active=all.body.items.filter(t=>['open','in-progress'].includes(t.status));const done=all.body.items.findIndex(t=>['resolved','closed'].includes(t.status));const activeLast=all.body.items.findIndex(t=>['open','in-progress'].includes(t.status));assert.ok(done===-1||activeLast<done);
});
test('rating is reporter-only, requires a resolved ticket and can be submitted once',async()=>{
  const owned=await create(employeeAgent,{title:'Rating flow'});const id=owned.body.id;
  assert.equal((await employeeAgent.post(`/api/tickets/${id}/rating`).send({rating:5})).status,400);
  for(const status of ['in-progress','resolved'])assert.equal((await techAgent.patch(`/api/tickets/${id}`).send({status})).status,200);
  assert.equal((await otherAgent.post(`/api/tickets/${id}/rating`).send({rating:5})).status,403);
  assert.equal((await employeeAgent.post(`/api/tickets/${id}/rating`).send({rating:6})).status,400);
  const rated=await employeeAgent.post(`/api/tickets/${id}/rating`).send({rating:5,comment:'Resolved quickly'});assert.equal(rated.status,200);
  assert.equal((await employeeAgent.post(`/api/tickets/${id}/rating`).send({rating:4})).status,400);
});
test('dashboard aggregates equal direct SQL values and explain their filters',async()=>{
  const response=await techAgent.get('/api/dashboard');assert.equal(response.status,200);
  const sql=db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE status=\'open\'').get().n;assert.equal(response.body.status.open,sql);
  const urgent=db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE priority='urgent' AND status IN ('open','in-progress')").get().n;assert.equal(response.body.urgent_active.count,urgent);assert.match(response.body.urgent_active.how,/priority='urgent'/);
  const avg=db.prepare(`SELECT AVG((julianday(r.resolved_at)-julianday(t.created_at))*86400) AS seconds,COUNT(*) AS n FROM tickets t JOIN (SELECT ticket_id,MIN(changed_at) resolved_at FROM status_history WHERE event='status_change' AND to_value='resolved' GROUP BY ticket_id) r ON r.ticket_id=t.id WHERE t.status IN ('resolved','closed')`).get();
  assert.equal(response.body.average_resolution_hours.count,avg.n);assert.equal(response.body.average_resolution_hours.value,avg.seconds==null?null:Math.round(avg.seconds/3600*10)/10);
  const overdue=db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE status IN ('open','in-progress') AND julianday('now')>julianday(created_at)+CASE priority WHEN 'urgent' THEN 1.0/24 WHEN 'high' THEN 4.0/24 WHEN 'medium' THEN 1.0 WHEN 'low' THEN 3.0 END`).get().n;assert.equal(response.body.overdue.count,overdue);
});
test('dashboard drill-down filters return exactly the same rows as each count',async()=>{
  const dashboard=(await techAgent.get('/api/dashboard')).body;
  const sameCount=async(filter,count)=>{const query=new URLSearchParams(Object.entries(filter).map(([k,v])=>[k,Array.isArray(v)?v.join(','):String(v)]));const list=await techAgent.get(`/api/tickets?${query}`);assert.equal(list.status,200);assert.equal(list.body.items.length,count,query.toString());};
  for(const s of ['open','in-progress','resolved','closed'])await sameCount(dashboard.status.filters[s],dashboard.status[s]);
  await sameCount(dashboard.urgent_active.filter,dashboard.urgent_active.count);
  await sameCount(dashboard.unassigned_active.filter,dashboard.unassigned_active.count);
  await sameCount(dashboard.completed.resolved_filter,dashboard.completed.resolved);
  await sameCount(dashboard.completed.closed_filter,dashboard.completed.closed);
  await sameCount(dashboard.overdue.filter,dashboard.overdue.count);
  for(const item of dashboard.by_priority.items)await sameCount(item.filter,item.count);
  for(const item of dashboard.by_category.items)await sameCount(item.filter,item.count);
  for(const tech of dashboard.by_technician.items){await sameCount(tech.active_filter,tech.active);await sameCount(tech.completed_filter,tech.completed);}
});
test('dashboard list filters accept multiple statuses, active, overdue, and assignee username',async()=>{
  const done=await techAgent.get('/api/tickets?status=resolved,closed');assert.equal(done.status,200);assert.ok(done.body.items.every(t=>['resolved','closed'].includes(t.status)));
  const active=await techAgent.get('/api/tickets?active=1');assert.equal(active.status,200);assert.ok(active.body.items.every(t=>['open','in-progress'].includes(t.status)));
  const overdue=await techAgent.get('/api/tickets?overdue=1');assert.equal(overdue.status,200);assert.ok(overdue.body.items.every(t=>['open','in-progress'].includes(t.status)));
  await techAgent.patch(`/api/tickets/${ticketId}`).send({assigned_to:technician.id});
  const mine=await techAgent.get('/api/tickets?assigned=tech.test');assert.equal(mine.status,200);assert.ok(mine.body.items.every(t=>t.assigned_to==='tech.test'));
});
test('technicians cannot create tickets through the API',async()=>{const r=await create(techAgent);assert.equal(r.status,403);});
test('role menu stats match direct ticket and history queries',async()=>{
  const created=await create(employeeAgent,{title:'Menu stat urgent',priority:'urgent'});const id=created.body.id;
  await techAgent.patch(`/api/tickets/${id}`).send({assigned_to:technician.id});await techAgent.patch(`/api/tickets/${id}`).send({status:'in-progress'});
  const techStats=(await techAgent.get('/api/me/stats')).body;
  assert.equal(techStats.active,db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE assigned_to_id=? AND status IN ('open','in-progress')").get(technician.id).n);
  assert.equal(techStats.urgent,db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE assigned_to_id=? AND priority='urgent' AND status IN ('open','in-progress')").get(technician.id).n);
  await techAgent.patch(`/api/tickets/${id}`).send({status:'resolved'});
  const resolvedThisWeek=db.prepare("SELECT COUNT(DISTINCT ticket_id) AS n FROM status_history WHERE event='status_change' AND to_value='resolved' AND changed_by_id=? AND changed_at>=strftime('%Y-%m-%dT%H:%M:%SZ','now','weekday 0','-6 days')").get(technician.id).n;
  assert.equal((await techAgent.get('/api/me/stats')).body.resolved_this_week,resolvedThisWeek);
  const employeeStats=(await employeeAgent.get('/api/me/stats')).body;
  assert.equal(employeeStats.open,db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE reported_by_id=? AND status='open'").get(employee.id).n);
  assert.equal(employeeStats.waiting_on_it,db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE reported_by_id=? AND status='in-progress'").get(employee.id).n);
});
test('claim assigns once without advancing status and rejects other roles or owners',async()=>{
  const created=await create(employeeAgent,{title:'Claim flow'});const id=created.body.id;
  const claimed=await techAgent.post(`/api/tickets/${id}/claim`).send({});assert.equal(claimed.status,200);assert.equal(claimed.body.status,'open');assert.equal(claimed.body.assigned_to,technician.username);
  const historyCount=()=>db.prepare("SELECT COUNT(*) AS n FROM status_history WHERE ticket_id=? AND event='assignment'").get(id).n;
  assert.equal(historyCount(),1);const again=await techAgent.post(`/api/tickets/${id}/claim`).send({});assert.equal(again.status,200);assert.equal(historyCount(),1);
  assert.equal(db.prepare("SELECT to_value FROM status_history WHERE ticket_id=? AND event='assignment'").get(id).to_value,technician.username);
  const other=await create(employeeAgent,{title:'Claim conflict'});assert.equal((await techAgent.post(`/api/tickets/${other.body.id}/claim`).send({})).status,200);
  const conflict=await emptyTechAgent.post(`/api/tickets/${other.body.id}/claim`).send({});assert.equal(conflict.status,409);assert.match(conflict.body.error,/Tech Test/);
  assert.equal((await employeeAgent.post(`/api/tickets/${other.body.id}/claim`).send({})).status,403);
  const resolved=await create(employeeAgent,{title:'Claim resolved'});await techAgent.patch(`/api/tickets/${resolved.body.id}`).send({status:'in-progress'});await techAgent.patch(`/api/tickets/${resolved.body.id}`).send({status:'resolved'});
  assert.equal((await techAgent.post(`/api/tickets/${resolved.body.id}/claim`).send({})).status,400);
  const race=await create(employeeAgent,{title:'Claim race'});const results=await Promise.all([techAgent.post(`/api/tickets/${race.body.id}/claim`).send({}),emptyTechAgent.post(`/api/tickets/${race.body.id}/claim`).send({})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM status_history WHERE ticket_id=? AND event='assignment'").get(race.body.id).n,1);
});
test('internal notes stay out of employee detail JSON and replies notify the other participant',async()=>{
  const created=await create(employeeAgent,{title:'Conversation visibility'});const id=created.body.id;
  await techAgent.patch(`/api/tickets/${id}`).send({assigned_to:technician.id});
  const note=await techAgent.post(`/api/tickets/${id}/comments`).send({kind:'internal_note',body:'SECRET SUPPORT NOTE'});assert.equal(note.status,201);
  const hidden=await employeeAgent.get(`/api/tickets/${id}`);assert.equal(hidden.status,200);assert.equal(JSON.stringify(hidden.body).includes('SECRET SUPPORT NOTE'),false);
  const visible=await techAgent.get(`/api/tickets/${id}`);assert.ok(visible.body.comments.some(c=>c.body==='SECRET SUPPORT NOTE'&&c.kind==='internal_note'));
  const reply=await techAgent.post(`/api/tickets/${id}/comments`).send({body:'We are checking this now.'});assert.equal(reply.status,201);
  const employeeNotices=(await employeeAgent.get('/api/notifications')).body.items;assert.ok(employeeNotices.some(n=>n.ticket_id===id&&n.message.includes('reply')));
  const employeeReply=await employeeAgent.post(`/api/tickets/${id}/comments`).send({body:'Thanks for the update.'});assert.equal(employeeReply.status,201);
  const techNotices=(await techAgent.get('/api/notifications')).body.items;assert.ok(techNotices.some(n=>n.ticket_id===id&&n.message.includes('reply')));
});
test('resolution notes are stored as comments in the status transaction',async()=>{
  const created=await create(employeeAgent,{title:'Resolution note'});const id=created.body.id;
  await techAgent.patch(`/api/tickets/${id}`).send({status:'in-progress'});
  const done=await techAgent.patch(`/api/tickets/${id}`).send({status:'resolved',resolution_note:'Reinstalled the VPN client and verified access.'});assert.equal(done.status,200);
  const detail=await employeeAgent.get(`/api/tickets/${id}`);assert.ok(detail.body.comments.some(c=>c.kind==='resolution'&&c.body.includes('Reinstalled')));
});
test('database constraints reject missing required values without crashing',async()=>{
  assert.throws(()=>db.prepare("INSERT INTO tickets(title,description,category,priority,reported_by_id) VALUES('','','software','low',?)").run(employee.id));
  assert.equal((await request(app).post('/api/tickets').set('Content-Type','application/json').send('{')).status,400);
});
test('empty database returns zeros and empty lists',async()=>{
  db.exec('DELETE FROM notifications; DELETE FROM comments; DELETE FROM status_history; DELETE FROM tickets;');
  const queue=await techAgent.get('/api/tickets');assert.equal(queue.status,200);assert.deepEqual(queue.body.items,[]);
  const dashboard=await emptyTechAgent.get('/api/dashboard');assert.equal(dashboard.status,200);assert.equal(dashboard.body.empty,true);assert.equal(dashboard.body.status.open,0);assert.equal(dashboard.body.urgent_active.count,0);assert.equal(dashboard.body.unassigned_active.count,0);assert.equal(dashboard.body.ratings.average,null);
});
