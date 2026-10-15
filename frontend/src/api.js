export async function api(path, options={}) {
  let response;
  try {
    response=await fetch(`/api${path}`,{credentials:'include',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  } catch { const e=new Error("Couldn't reach the server. Please try again.");e.status=0;throw e; }
  const data=await response.json().catch(()=>({error:'The server returned an unreadable response.'}));
  if(!response.ok){const e=new Error(data.error||`Request failed (${response.status}).`);e.status=response.status;throw e;}
  return data;
}
export const send=(path,method,body)=>api(path,{method,body:body===undefined?undefined:JSON.stringify(body)});
