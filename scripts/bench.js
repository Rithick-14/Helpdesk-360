const base=process.env.BASE_URL||'http://localhost:4000';
const username=process.env.BENCH_USERNAME||'arjun.mehta';
const password=process.env.BENCH_PASSWORD;
if(!password)throw new Error('Set BENCH_PASSWORD to a demo account password listed in README.md.');
const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});
if(!login.ok)throw new Error(`Login failed with HTTP ${login.status}. Set BENCH_USERNAME and BENCH_PASSWORD.`);
const cookie=login.headers.get('set-cookie')?.split(';')[0];const times=[];
for(let i=0;i<50;i++){const start=performance.now();const res=await fetch(`${base}/api/tickets`,{headers:{cookie}});if(!res.ok)throw new Error(`GET /api/tickets failed with HTTP ${res.status}`);await res.arrayBuffer();times.push(performance.now()-start);}
times.sort((a,b)=>a-b);const p95=times[Math.ceil(times.length*.95)-1];console.log(JSON.stringify({requests:times.length,p95_ms:Math.round(p95*100)/100,median_ms:Math.round(times[Math.floor(times.length/2)]*100)/100},null,2));
