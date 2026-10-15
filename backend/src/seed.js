import { db } from './db.js';

const accounts=[
  ['priya.nair','Priya Nair','employee'],['rahul.verma','Rahul Verma','employee'],['sana.khan','Sana Khan','employee'],
  ['arjun.mehta','Arjun Mehta','technician'],['meera.iyer','Meera Iyer','technician'],
];
const titleSets=[
  ['Laptop will not start after update','hardware','urgent'],['Wi-Fi drops in meeting room','network','high'],['VPN disconnects during calls','network','high'],['Account locked after password reset','account-access','medium'],
  ['Design software license expired','software','medium'],['External monitor is not detected','hardware','low'],['Shared drive unavailable','network','urgent'],['Request access to finance folder','account-access','low'],
  ['Printer queue stuck on floor two','hardware','medium'],['Email client closes at launch','software','high'],['MFA prompt does not arrive','account-access','high'],['Conference room display has no signal','hardware','urgent'],
  ['New starter needs project access','account-access','medium'],['Laptop battery drains quickly','hardware','low'],['Internal site returns gateway error','network','urgent'],['Spreadsheet add-in fails to load','software','medium'],
  ['Cannot connect to office Wi-Fi','network','low'],['Need access to source repository','account-access','medium'],['Operating system update is blocked','software','high'],['Docking station disconnects keyboard','hardware','low'],
  ['File sync is delayed','software','medium'],['Shared mailbox permission missing','account-access','high'],['Meeting room network is unavailable','network','urgent'],['Security client update fails','software','low'],
];
const descriptions=[
  'The issue started this morning and is blocking normal work. I have restarted the device and confirmed the problem is still present.',
  'This happens intermittently during the workday. Other services appear to be available, and the issue is repeatable.',
  'Please review the request and let me know if you need any additional details to reproduce it.',
  'I have attached the relevant context in this description. The problem affects my current work and needs investigation.',
];

export async function seed({large=false,reset=false}={}){
  if(reset)db.exec('DELETE FROM notifications; DELETE FROM comments; DELETE FROM status_history; DELETE FROM tickets; DELETE FROM users;');
  const createUser=db.prepare('INSERT OR IGNORE INTO users(username,display_name,password_hash,role) VALUES(?,?,?,?)');
  const demoPasswordHash='$2a$10$3.liHwkYYn8lR7.ZtbeidOV9V7uYNLjr2LZIZjU3VPongrHKdh02O';
  for(const [username,name,role] of accounts)createUser.run(username,name,demoPasswordHash,role);
  const employees=db.prepare("SELECT id FROM users WHERE role='employee' ORDER BY id").all().map(x=>x.id);
  const techs=db.prepare("SELECT id FROM users WHERE role='technician' ORDER BY id").all().map(x=>x.id);
  const count=db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n;
  const target=large?500:24;
  if(count>=target)return;
  const insert=db.prepare(`INSERT INTO tickets(title,description,category,priority,status,reported_by_id,assigned_to_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)`);
  const history=db.prepare('INSERT INTO status_history(ticket_id,event,from_value,to_value,changed_by_id,changed_at) VALUES(?,?,?,?,?,?)');
  const rating=db.prepare("UPDATE tickets SET rating=?,rating_comment=?,rated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?");
  const tx=db.transaction(()=>{
    for(let i=count;i<target;i++){
      const [baseTitle,cat,basePriority]=titleSets[i%titleSets.length];
      const title=i<titleSets.length?baseTitle:`${baseTitle} (${Math.floor(i/titleSets.length)+1})`;
      const p=basePriority;const status=['open','in-progress','resolved','closed'][i%4];
      const reporter=employees[i%employees.length];
      const assignee=(i%5===0||status==='open'&&i%3===0)?null:techs[i%techs.length];
      const hoursAgo=(i%10)*24+((i*7)%20);
      const created=new Date(Date.now()-hoursAgo*3600000).toISOString().replace('.000Z','Z');
      const finished=status==='resolved'||status==='closed';
      const updated=new Date(Date.parse(created)+(finished?Math.min(hoursAgo*0.4,8):status==='in-progress'?Math.min(hoursAgo*0.1,2):0)*3600000).toISOString().replace('.000Z','Z');
      const result=insert.run(title,descriptions[i%descriptions.length],cat,p,status,reporter,assignee,created,updated);const id=Number(result.lastInsertRowid);
      history.run(id,'created',null,'open',reporter,created);
      const transitions=[];if(['in-progress','resolved','closed'].includes(status))transitions.push(['open','in-progress']);if(['resolved','closed'].includes(status))transitions.push(['in-progress','resolved']);if(status==='closed')transitions.push(['resolved','closed']);
      for(let n=0;n<transitions.length;n++)history.run(id,'status_change',transitions[n][0],transitions[n][1],assignee??techs[0],new Date(Date.parse(created)+(n+1)*Math.max(1,(Date.parse(updated)-Date.parse(created))/(transitions.length+1))).toISOString().replace('.000Z','Z'));
      if(assignee)history.run(id,'assignment',null,String(assignee),techs[0],updated);
      if(i%8===2&&finished)rating.run(4+(i%2),'',id);
    }
  });tx();
  console.log(`Seeded ${target-count} demo tickets${large?' (large dataset)':''}.`);
}

if(process.argv[1] && process.argv[1].endsWith('seed.js')){
  const args=process.argv.slice(2);await seed({large:args.includes('--large'),reset:args.includes('--reset')});db.close();
}
