(() => {
  const $=id=>document.getElementById(id),id=new URLSearchParams(location.search).get('tournamentId');
  const ticket=new URLSearchParams(location.hash.slice(1)).get('session'),key='registration-admin:'+id;
  let token='',data,busy=false,optionsDirty=false;
  const message=(s,error=false)=>{$('message').textContent=s;$('message').className=error?'error':'success';};
  async function api(path,body){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);try{const r=await fetch('/api/registration-admin/'+path,{method:body?'POST':'GET',cache:'no-store',credentials:'omit',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined,signal:controller.signal});const value=await r.json();if(!r.ok)throw Error(value.message||'No se pudo guardar');return value;}finally{clearTimeout(timeout);}}
  function element(tag,text,parent){const e=document.createElement(tag);e.textContent=text;parent?.append(e);return e;}
  function button(parent,label,fn,enabled=true){const b=element('button',label,parent);b.className='secondary';b.disabled=busy||!enabled;b.onclick=fn;return b;}
  async function action(path,body){
    if(busy)return;busy=true;
    document.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);
    try{
      data=await api(path,body);
      if(path==='options'&&Object.hasOwn(body||{},'registrationClosesAt'))optionsDirty=false;
      message(path==='view'?'Datos actualizados.':'Guardado. Los avisos se enviarán en segundo plano.');
    }catch(e){message(e.name==='AbortError'?'El servidor tardó demasiado. Tus opciones sin guardar se conservan.':e.message,true);}
    finally{busy=false;document.querySelectorAll('input,select').forEach(b=>b.disabled=false);if(data)render();}
  }
  const team=body=>action('team',body);
  function render(){
    $('title').textContent=data.title;$('panel').hidden=false;
    $('open-state').textContent=data.readOnly?'Torneo archivado · solo lectura':data.settings.registrationEnabled?'Inscripciones abiertas':'Inscripciones cerradas';
    const date=data.settings.registrationClosesAt?new Date(data.settings.registrationClosesAt):null;
    if(!optionsDirty){
      $('deadline').value=date?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):'';
      $('waitlist').checked=data.settings.registrationWaitlist;
    }
    $('options-note').hidden=!optionsDirty;
    $('toggle').textContent=data.settings.registrationEnabled?'Cerrar inscripción ahora':'Abrir inscripción';
    for(const id of ['save','toggle','refresh'])$(id).disabled=busy;
    $('toggle').disabled=busy||data.readOnly||(!data.settings.registrationEnabled&&data.canOpen===false);
    for(const id of ['save','deadline','waitlist'])$(id).disabled=busy||data.readOnly;
    $('waiting').replaceChildren();if(!data.waiting.length)element('p','Sin inscripciones en espera.',$('waiting'));
    data.waiting.forEach(r=>element('p',r.nickname+(r.teamName?' · '+r.teamName:'')+' · '+new Date(r.since).toLocaleString('es-ES'),$('waiting')));
    const roster=data.roster;$('teams').hidden=!roster;if(!roster)return;
    const expanded=new Set([...$('rosters').querySelectorAll('details[open]')].map(card=>card.dataset.teamId));
    $('rosters').replaceChildren();$('unassigned').replaceChildren();
    roster.teams.forEach(t=>{
      const card=element('details','',$('rosters'));card.dataset.teamId=t.id;card.open=expanded.has(t.id);element('summary',t.name+' · '+(t.complete?'Completo':'Incompleto')+' · '+(t.checkedIn?'Asistencia confirmada':'Sin check-in'),card);
      element('p','Código de invitación: '+t.code,card);
      button(card,'Regenerar código',()=>{if(confirm('El código anterior dejará de admitir solicitudes nuevas. ¿Continuar?'))team({action:'ROTATE_CODE',teamId:t.id,code:t.code});},roster.canSubstitute);
      button(card,t.checkedIn?'Quitar check-in':'Confirmar asistencia',()=>team({action:'CHECK_IN',teamId:t.id,checkedIn:!t.checkedIn}),roster.canEdit);
      for(const m of t.members){
        element('p',m.nickname+' · '+(m.role==='PLAYER'?'Titular':'Reserva')+(m.meta?.captain?' · Capitán':'')+(m.meta?.gameId?' · '+m.meta.gameId:'')+(m.meta?.preferredRole?' · '+m.meta.preferredRole:''),card);
        if(!m.meta?.captain)button(card,'Hacer capitán a '+m.nickname,()=>team({action:'CAPTAIN',id:m.id,revision:m.revision}),roster.canSubstitute);
      }
      const starters=t.members.filter(m=>m.role==='PLAYER'),reserves=t.members.filter(m=>m.role==='RESERVE');
      if(starters.length&&reserves.length&&roster.canSubstitute){
        const labelA=element('label','Sale titular',card),a=element('select','',labelA),labelB=element('label','Entra reserva',card),b=element('select','',labelB);
        starters.forEach(m=>a.add(new Option(m.nickname,m.id)));reserves.forEach(m=>b.add(new Option(m.nickname,m.id)));
        button(card,'Realizar sustitución',()=>{const s=starters.find(m=>m.id===a.value),r=reserves.find(m=>m.id===b.value);if(confirm('¿Sustituir a '+s.nickname+' por '+r.nickname+'?'))team({action:'SUBSTITUTE',starterId:s.id,reserveId:r.id,starterRevision:s.revision,reserveRevision:r.revision});});
      }
    });
    if(!roster.unassigned.length)element('p','No hay jugadores pendientes de equipo.',$('unassigned'));
    roster.unassigned.forEach(m=>element('p',m.nickname+(m.meta?.gameId?' · '+m.meta.gameId:'')+(m.meta?.preferredRole?' · '+m.meta.preferredRole:''),$('unassigned')));
    element('p','Puedes formar equipos y asignar estos jugadores desde las plantillas de la aplicación.',$('unassigned'));
  }
  for(const id of ['deadline','waitlist'])$(id).addEventListener('input',()=>{optionsDirty=true;$('options-note').hidden=false;});
  window.addEventListener('beforeunload',event=>{if(optionsDirty){event.preventDefault();event.returnValue='';}});
  $('save').onclick=()=>{const value=$('deadline').value,date=value?new Date(value):null;if(!$('deadline').reportValidity()||(date&&!Number.isFinite(date.getTime()))){message('Revisa la fecha y la hora de cierre.',true);return;}void action('options',{registrationWaitlist:$('waitlist').checked,registrationClosesAt:date?date.toISOString():null});};
  $('toggle').onclick=()=>action('options',{registrationEnabled:!data.settings.registrationEnabled});
  $('refresh').onclick=()=>action('view');
  (async()=>{try{if(ticket){const s=await api('session',{token:ticket});if(s.tournamentId!==id)throw Error('Torneo incorrecto');token=s.token;try{sessionStorage.setItem(key,token);}catch{}history.replaceState(null,'',location.pathname+location.search);}else try{token=sessionStorage.getItem(key)||'';}catch{}data=await api('view');render();}catch(e){message(e.message,true);}})();
})();
