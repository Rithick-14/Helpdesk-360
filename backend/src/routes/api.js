import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db.js';
import { CATEGORIES, PRIORITIES, STATUSES, ACTIVE } from '../constants.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { dashboardData } from '../services/dashboard.js';
import { changeTicket, claimTicket, getComments, getHistory, getTicket, listTickets, rateTicket, slaFlags } from '../services/tickets.js';

export const api = Router();
const asyncRoute = (fn) => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const schema = (shape) => z.object(shape).strict();
const parse = (s, value) => { const result=s.safeParse(value); if(!result.success) { const e=new Error(result.error.issues.map((x)=>`${x.path.join('.') || 'request'}: ${x.message}`).join('; ')); e.status=400; throw e; } return result.data; };
const positiveId = z.coerce.number().int().positive().refine(Number.isSafeInteger,'must be a safe integer');
const idParam = z.object({id:positiveId});
const category = z.enum(CATEGORIES), priority=z.enum(PRIORITIES), status=z.enum(STATUSES);
const loginLimiter = rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false,message:{error:'Too many sign-in attempts. Please try again shortly.'}});

api.get('/health', (req,res)=>res.json({status:'ok'}));
api.post('/auth/login', loginLimiter, asyncRoute(async (req,res)=>{
  const input=parse(schema({username:z.string().trim().min(1).max(80),password:z.string().min(1).max(200)}),req.body);
  const user=db.prepare('SELECT id,username,display_name,role,password_hash FROM users WHERE username=?').get(input.username);
  // Same response for an unknown username and an incorrect password.
  if(!user || !(await bcrypt.compare(input.password,user.password_hash))) return res.status(401).json({error:'Username or password is incorrect.'});
  const token=jwt.sign({},process.env.JWT_SECRET,{subject:String(user.id),expiresIn:'12h'});
  res.cookie('helpdesk_session',token,{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',maxAge:12*60*60*1000,path:'/'});
  return res.json({user:{id:user.id,username:user.username,display_name:user.display_name,role:user.role}});
}));
api.post('/auth/logout',(req,res)=>{res.clearCookie('helpdesk_session',{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',path:'/'});res.json({ok:true});});
api.get('/auth/me',requireAuth,(req,res)=>res.json({user:req.user}));

api.get('/me/stats',requireAuth,(req,res)=>{
  const userId=req.user.id;
  if(req.user.role==='technician'){
    const active=db.prepare("SELECT COUNT(*) AS count FROM tickets WHERE assigned_to_id=? AND status IN ('open','in-progress')").get(userId).count;
    const urgent=db.prepare("SELECT COUNT(*) AS count FROM tickets WHERE assigned_to_id=? AND priority='urgent' AND status IN ('open','in-progress')").get(userId).count;
    const resolved=db.prepare("SELECT COUNT(DISTINCT ticket_id) AS count FROM status_history WHERE event='status_change' AND to_value='resolved' AND changed_by_id=? AND changed_at>=strftime('%Y-%m-%dT%H:%M:%SZ','now','weekday 0','-6 days')").get(userId).count;
    return res.json({active,urgent,resolved_this_week:resolved});
  }
  const open=db.prepare("SELECT COUNT(*) AS count FROM tickets WHERE reported_by_id=? AND status='open'").get(userId).count;
  const waiting=db.prepare("SELECT COUNT(*) AS count FROM tickets WHERE reported_by_id=? AND status='in-progress'").get(userId).count;
  const resolved=db.prepare("SELECT COUNT(*) AS count FROM tickets WHERE reported_by_id=? AND status IN ('resolved','closed')").get(userId).count;
  return res.json({open,waiting_on_it:waiting,resolved});
});

api.post('/tickets',requireAuth,requireRole('employee'),(req,res)=>{
  const input=parse(schema({title:z.string().trim().min(1).max(150),description:z.string().trim().min(1).max(5000),category,priority,client_token:z.string().uuid().optional()}),req.body);
  // Idempotency key lets a double-click or retry return the already-persisted ticket.
  if(input.client_token){const existing=db.prepare('SELECT id FROM tickets WHERE client_token=?').get(input.client_token);if(existing)return res.status(200).json(getTicket(existing.id));}
  const create=db.transaction(()=>{
    const result=db.prepare(`INSERT INTO tickets(title,description,category,priority,status,reported_by_id,client_token) VALUES(?,?,?,?,'open',?,?)`)
      .run(input.title,input.description,input.category,input.priority,req.user.id,input.client_token??null);
    const id=Number(result.lastInsertRowid);
    db.prepare("INSERT INTO status_history(ticket_id,event,from_value,to_value,changed_by_id) VALUES(?,'created',NULL,'open',?)").run(id,req.user.id);
    return id;
  });
  const id=create();return res.status(201).json(getTicket(id));
});

api.get('/tickets/similar',requireAuth,requireRole('employee'),(req,res)=>{
  const input=parse(z.object({title:z.string().trim().min(1).max(150)}),req.query);
  const words=input.title.toLowerCase().split(/\W+/).filter((w)=>w.length>=4);
  if(!words.length)return res.json({items:[]});
  const rows=db.prepare("SELECT id,title,status,created_at FROM tickets WHERE reported_by_id=? AND status IN ('open','in-progress') ORDER BY created_at DESC LIMIT 100").all(req.user.id);
  const items=rows.filter((row)=>words.some((w)=>row.title.toLowerCase().includes(w))).slice(0,5);
  res.json({items});
});

api.get('/tickets',requireAuth,(req,res)=>{
  const statusFilter=z.string().refine(v=>v.split(',').every(s=>STATUSES.includes(s)),'must be a comma-separated list of valid statuses');
  const assignee=z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/).refine(v=>!/^\d+$/.test(v)||Number.isSafeInteger(Number(v)),'must be a username or safe user ID');
  const input=parse(z.object({status:statusFilter.optional(),active:z.enum(['1']).optional(),overdue:z.enum(['1']).optional(),priority:priority.optional(),category:category.optional(),assigned:z.union([z.literal('unassigned'),z.literal('me'),assignee]).optional(),q:z.string().trim().max(150).optional(),sort:z.enum(['queue','newest','oldest']).optional()}),req.query);
  let items=listTickets(req.user,input);
  if(input.sort==='newest')items.sort((a,b)=>b.created_at.localeCompare(a.created_at));
  if(input.sort==='oldest')items.sort((a,b)=>a.created_at.localeCompare(b.created_at));
  res.json({items});
});

api.get('/tickets/:id',requireAuth,(req,res)=>{
  const {id}=parse(idParam,req.params);const ticket=getTicket(id);
  if(!ticket)return res.status(404).json({error:'Ticket not found.'});
  if(req.user.role==='employee' && ticket.reported_by!==req.user.username)return res.status(403).json({error:'You may only view tickets you reported.'});
  res.json({...ticket,...slaFlags(ticket),history:getHistory(id),comments:getComments(id,req.user.role)});
});

api.patch('/tickets/:id',requireAuth,requireRole('technician'),(req,res)=>{
  const {id}=parse(idParam,req.params);
  const input=parse(schema({status:status.optional(),assigned_to:z.union([positiveId,z.null()]).optional(),resolution_note:z.string().trim().min(10).max(1000).optional()}),req.body);
  const result=changeTicket(id,req.user,input);if(result.error)return res.status(result.status).json({error:result.error});
  res.json(result.ticket);
});

api.post('/tickets/:id/claim',requireAuth,requireRole('technician'),(req,res)=>{
  const {id}=parse(idParam,req.params);parse(schema({}),req.body||{});
  const result=claimTicket(id,req.user);if(result.error)return res.status(result.status).json({error:result.error});
  res.json({...result.ticket,...slaFlags(result.ticket),history:getHistory(id),comments:getComments(id,'technician')});
});

api.post('/tickets/:id/rating',requireAuth,(req,res)=>{
  const {id}=parse(idParam,req.params);const input=parse(schema({rating:z.coerce.number().int().min(1).max(5),comment:z.string().trim().max(500).optional()}),req.body);
  const result=rateTicket(id,req.user,input.rating,input.comment);if(result.error)return res.status(result.status).json({error:result.error});res.json(result.ticket);
});

api.post('/tickets/:id/comments',requireAuth,(req,res)=>{
  const {id}=parse(idParam,req.params);const input=parse(schema({body:z.string().trim().min(1).max(2000),kind:z.enum(['reply','internal_note']).optional()}),req.body);
  const ticket=getTicket(id);if(!ticket)return res.status(404).json({error:'Ticket not found.'});
  if(req.user.role==='employee'&&ticket.reported_by!==req.user.username)return res.status(403).json({error:'You may only comment on tickets you reported.'});
  const kind=input.kind||'reply';
  if(req.user.role==='employee'&&kind!=='reply')return res.status(403).json({error:'Employees may only send replies.'});
  const tx=db.transaction(()=>{
    const result=db.prepare('INSERT INTO comments(ticket_id,author_id,body,kind) VALUES(?,?,?,?)').run(id,req.user.id,input.body,kind);
    const recipientRow=db.prepare('SELECT reported_by_id,assigned_to_id FROM tickets WHERE id=?').get(id);
    const recipient=req.user.role==='technician'?recipientRow.reported_by_id:recipientRow.assigned_to_id;
    if(recipient&&kind==='reply')db.prepare('INSERT INTO notifications(user_id,ticket_id,message) VALUES(?,?,?)').run(recipient,id,`New reply on ticket #${id}.`);
    return Number(result.lastInsertRowid);
  });
  const comment=db.prepare(`SELECT c.id,c.body,c.kind,c.created_at,u.username AS author,u.display_name AS author_name,u.role AS author_role FROM comments c JOIN users u ON u.id=c.author_id WHERE c.id=?`).get(tx());
  res.status(201).json(comment);
});

api.get('/users',requireAuth,requireRole('technician'),(req,res)=>{
  const input=parse(z.object({role:z.literal('technician')}),req.query);
  res.json({items:db.prepare('SELECT id,username,display_name,role FROM users WHERE role=? ORDER BY display_name').all(input.role)});
});
api.get('/dashboard',requireAuth,requireRole('technician'),(req,res)=>res.json(dashboardData()));
api.get('/notifications',requireAuth,(req,res)=>res.json({items:db.prepare(`SELECT n.id,n.ticket_id,n.message,n.read_at,n.created_at,t.title FROM notifications n JOIN tickets t ON t.id=n.ticket_id WHERE n.user_id=? ORDER BY n.created_at DESC,n.id DESC LIMIT 50`).all(req.user.id)}));
api.post('/notifications/read',requireAuth,(req,res)=>{
  const input=parse(schema({ids:z.array(z.coerce.number().int().positive()).max(50).optional(),all:z.boolean().optional()}),req.body);
  const tx=db.transaction(()=>{
    if(input.all)db.prepare("UPDATE notifications SET read_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE user_id=? AND read_at IS NULL").run(req.user.id);
    else for(const id of input.ids||[])db.prepare("UPDATE notifications SET read_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=? AND user_id=?").run(id,req.user.id);
  });tx();res.json({ok:true});
});
