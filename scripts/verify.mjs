import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';

const root=path.resolve(import.meta.dirname,'..');
const temp=await mkdtemp(path.join(os.tmpdir(),'helpdesk360-verify-'));
const dbPath=path.join(temp,'verify.sqlite');
const password='VerifyOnly!123';
const port=43000+Math.floor(Math.random()*15000);
const base=`http://127.0.0.1:${port}`;
const env={...process.env,PORT:String(port),DB_PATH:dbPath,JWT_SECRET:'verification-only-local-secret',SEED_DEMO:'true',NODE_ENV:'test',CORS_ORIGIN:base};
let server;
async function waitForHealth(){for(let i=0;i<60;i++){if(server.exitCode!==null)throw new Error(`Backend exited with ${server.exitCode}`);try{const r=await fetch(`${base}/health`);if(r.ok)return;}catch{}await sleep(250);}throw new Error('Backend did not become healthy within 15 seconds.');}
function start(){server=spawn(process.execPath,[path.join(root,'backend','src','server.js')],{cwd:root,env,stdio:'ignore'});return waitForHealth();}
async function stop(){if(!server||server.exitCode!==null)return;server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),sleep(5000)]);if(server.exitCode===null)server.kill('SIGKILL');}
async function call(route,{method='GET',cookie,body}={}){const r=await fetch(`${base}/api${route}`,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(`${method} ${route}: HTTP ${r.status} ${data.error}`);return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
try{
  const seedDb=new Database(dbPath);seedDb.pragma('foreign_keys=ON');seedDb.exec(await (await import('node:fs/promises')).readFile(path.join(root,'backend','src','schema.sql'),'utf8'));
  const hash=await bcrypt.hash(password,10);seedDb.prepare('INSERT INTO users(username,display_name,password_hash,role) VALUES(?,?,?,?)').run('verify.employee','Verify Employee',hash,'employee');seedDb.prepare('INSERT INTO users(username,display_name,password_hash,role) VALUES(?,?,?,?)').run('verify.tech','Verify Technician',hash,'technician');seedDb.close();
  await start();
  const employee=(await call('/auth/login',{method:'POST',body:{username:'verify.employee',password}})).cookie;
  const technician=(await call('/auth/login',{method:'POST',body:{username:'verify.tech',password}})).cookie;
  const ticket=(await call('/tickets',{method:'POST',cookie:employee,body:{title:'Persistence verification',description:'Confirm the saved request survives backend restart.',category:'software',priority:'urgent',client_token:crypto.randomUUID()}})).data;
  await call(`/tickets/${ticket.id}/claim`,{method:'POST',cookie:technician,body:{}});
  await call(`/tickets/${ticket.id}`,{method:'PATCH',cookie:technician,body:{status:'in-progress'}});
  console.log(`PASS: created ticket #${ticket.id}, claimed it, and advanced status`);
  await stop();await start();
  const after=await call(`/tickets/${ticket.id}`,{cookie:employee});
  if(after.data.status!=='in-progress'||after.data.assigned_to!=='verify.tech')throw new Error('The saved status or assignment did not survive restart.');
  const persisted=new Database(dbPath,{readonly:true});const row=persisted.prepare('SELECT status,assigned_to_id FROM tickets WHERE id=?').get(ticket.id);
  const claimHistory=persisted.prepare("SELECT to_value FROM status_history WHERE ticket_id=? AND event='assignment'").get(ticket.id);persisted.close();
  if(row.status!=='in-progress'||!row.assigned_to_id||claimHistory?.to_value!=='verify.tech')throw new Error('Direct SQL check did not find the persisted ticket state and claim history.');
  console.log('PASS: employee API read and direct SQL confirm assignment and status survived backend restart');
}catch(err){console.error(`FAIL: ${err.message}`);process.exitCode=1;}finally{await stop();await rm(temp,{recursive:true,force:true});}
