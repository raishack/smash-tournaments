const $=id=>document.getElementById(id),key='gt_display_admin_token';
let token='',user=null,busy=false,resetUser='';
try{token=localStorage.getItem(key)||'';}catch{}
const status=value=>{$('status').textContent=value;if($('reset-dialog').open)$('reset-status').textContent=value;};
function saveToken(value){token=value;try{value?localStorage.setItem(key,value):localStorage.removeItem(key);}catch{}}
async function api(path,method='GET',body){
  const response=await fetch('/api/management-auth/'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const payload=await response.json();
  if(!response.ok){if(response.status===401&&path!=='login'){saveToken('');showLogin();}throw Error(payload.message||'No se pudo completar la operación');}return payload;
}
function showLogin(){user=null;$('login').hidden=false;$('account').hidden=true;$('users-panel').hidden=true;$('users').replaceChildren();}
async function action(work){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);status('Procesando…');try{await work();}catch(error){status(error.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
async function showAccount(){
  const payload=await api('me');user=payload.user;$('login').hidden=true;$('account').hidden=false;$('identity').textContent=user.username;$('role').textContent=user.role==='SUPER_ADMIN'?'Superadministrador':'Gestor';$('users-panel').hidden=user.role!=='SUPER_ADMIN';
  if(user.role==='SUPER_ADMIN')await users();
}
function button(text,handler,danger=false){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=danger?'danger':'secondary';b.onclick=handler;return b;}
async function users(){
  const rows=await api('users');$('users').replaceChildren();
  for(const row of rows){const item=document.createElement('div');item.className='user';const name=document.createElement('strong');name.textContent=row.username+(row.role==='SUPER_ADMIN'?' · Superadministrador':' · Gestor');item.append(name);
    if(row.role!=='SUPER_ADMIN'){const controls=document.createElement('div');controls.className='actions';controls.append(button('Restablecer contraseña',()=>{resetUser=row.id;$('reset-form').reset();$('reset-status').textContent='';$('reset-title').textContent='Contraseña de '+row.username;$('reset-dialog').showModal();}),button('Eliminar',()=>{if(confirm('¿Eliminar el usuario '+row.username+'? Perderá el acceso. Sus torneos se conservan.'))void action(async()=>{await api('users/'+encodeURIComponent(row.id),'DELETE');await users();status('Usuario eliminado; sus sesiones se han cerrado.');});},true));item.append(controls);} $('users').append(item);
  }
}
$('login-form').onsubmit=event=>{event.preventDefault();const form=new FormData(event.currentTarget);void action(async()=>{const session=await api('login','POST',{username:form.get('username'),password:form.get('password')});saveToken(session.token);$('login-form').reset();await showAccount();status('Sesión iniciada.');});};
$('logout').onclick=()=>void action(async()=>{try{await api('logout','POST',{});}finally{saveToken('');showLogin();status('Sesión cerrada.');}});
$('password-form').onsubmit=event=>{event.preventDefault();const form=new FormData(event.currentTarget);void action(async()=>{if(form.get('password')!==form.get('confirmation'))throw Error('Las contraseñas nuevas no coinciden');await api('password','POST',{currentPassword:form.get('currentPassword'),password:form.get('password')});$('password-form').reset();saveToken('');showLogin();status('Contraseña cambiada. Inicia sesión de nuevo.');});};
$('create-form').onsubmit=event=>{event.preventDefault();const form=new FormData(event.currentTarget);void action(async()=>{await api('users','POST',{username:form.get('username'),password:form.get('password')});$('create-form').reset();await users();status('Gestor creado. Ya puede iniciar sesión en las aplicaciones y el display.');});};
$('reset-form').onsubmit=event=>{event.preventDefault();const form=new FormData(event.currentTarget);void action(async()=>{await api('users/'+encodeURIComponent(resetUser)+'/password','POST',{password:form.get('password')});$('reset-form').reset();$('reset-dialog').close();status('Contraseña actualizada y sesiones anteriores cerradas.');});};
$('reset-cancel').onclick=()=>$('reset-dialog').close();
if(token)void action(async()=>{await showAccount();status('');});else showLogin();
