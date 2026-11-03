import {getStore} from '@netlify/blobs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
const json=(status,obj)=>({statusCode:status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'},body:JSON.stringify(obj)});
const safe=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y)};
const token=()=>randomBytes(32).toString('base64url');
const validName=x=>typeof x==='string'&&x.trim().length>0&&x.length<=120;
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Método no permitido'});
 let b;try{b=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON inválido'})}
 const store=getStore('familia-2026');
 try{
  if(b.action==='admin-publish'||b.action==='admin-status'){
   if(!process.env.ADMIN_PASSWORD||!safe(b.password,process.env.ADMIN_PASSWORD))return json(403,{error:'Contraseña del organizador incorrecta'});
   let db=await store.get('event',{type:'json'});
   if(b.action==='admin-status'){
    if(!db)return json(200,{published:false});
    const wishes={};for(const p of db.people){wishes[p.id]=(await store.get('wish-'+p.id,{type:'text'}))||''}
    return json(200,{published:true,people:db.people.map(p=>({id:p.id,name:p.name,phone:p.phone,linkToken:p.linkToken,recipient:db.people.find(t=>t.id===db.assignments[p.id])?.name||'',wish:wishes[p.id]})),config:db.config});
   }
   if(db)return json(409,{error:'Ya existe un sorteo publicado. Para proteger los enlaces enviados no se permite sobrescribirlo. Consulta Estado del sorteo.'});
   const people=b.people,assignments=b.assignments,config=b.config;
   if(!Array.isArray(people)||people.length<3||people.length>50||!assignments||typeof assignments!=='object')return json(400,{error:'Datos del sorteo incompletos'});
   const ids=new Set(people.map(p=>p.id));if(ids.size!==people.length||people.some(p=>!validName(p.name)||typeof p.id!=='string'||p.id.length>100)||Object.keys(assignments).length!==people.length)return json(400,{error:'Participantes inválidos'});
   const targets=people.map(p=>assignments[p.id]);if(new Set(targets).size!==people.length||targets.some((id,i)=>!ids.has(id)||id===people[i].id))return json(400,{error:'Asignaciones inválidas'});
   const clean=people.map(p=>({id:p.id,name:p.name.trim(),phone:String(p.phone||'').slice(0,35),linkToken:token()}));
   db={people:clean,assignments,config:{budget:String(config?.budget||'').slice(0,30),date:String(config?.date||'').slice(0,40),event:String(config?.event||'Familia 2026').slice(0,100)}};
   await store.setJSON('event',db);
   return json(200,{published:true,people:clean.map(p=>({id:p.id,name:p.name,phone:p.phone,linkToken:p.linkToken}))});
  }
  if(b.action==='participant-read'||b.action==='participant-save'){
   const db=await store.get('event',{type:'json'});if(!db)return json(404,{error:'El sorteo todavía no está publicado'});
   const p=db.people.find(x=>safe(x.linkToken,b.token));if(!p)return json(403,{error:'Enlace privado inválido'});
   const recipient=db.people.find(x=>x.id===db.assignments[p.id]);if(!recipient)return json(500,{error:'Sorteo incompleto'});
   if(b.action==='participant-save'){
    if(typeof b.wish!=='string'||b.wish.length>2500)return json(400,{error:'La lista debe tener máximo 2500 caracteres'});
    await store.set('wish-'+p.id,b.wish);
   }
   const ownWish=(await store.get('wish-'+p.id,{type:'text'}))||'';
   const recipientWish=(await store.get('wish-'+recipient.id,{type:'text'}))||'';
   return json(200,{name:p.name,recipient:recipient.name,ownWish,recipientWish,config:db.config});
  }
  return json(400,{error:'Operación no reconocida'});
 }catch(e){console.error(e);return json(500,{error:'No se pudo acceder al almacenamiento. Revisa el despliegue y Netlify Blobs.'})}
}
