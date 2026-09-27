(() => {
  const $=id=>document.getElementById(id),escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const id=new URLSearchParams(location.search).get('tournamentId'),ticket=new URLSearchParams(location.hash.slice(1)).get('session');
  let token='',data,roundIndex=0,groupId='',gameNumber=1,busy=false,dirty=false,draftRevision='',requestGeneration=0;
  const memory=new Map();
  const storage={get(key){try{return sessionStorage.getItem(key)??memory.get(key)??null;}catch{return memory.get(key)??null;}},set(key,value){memory.set(key,value);try{sessionStorage.setItem(key,value);}catch{}},remove(key){memory.delete(key);try{sessionStorage.removeItem(key);}catch{}}};
  const authKey='fortnite-session:'+id;
  const message=(text,error=false)=>{$('message').textContent=text;$('message').className=error?'error':'success';};
  const round=()=>data?.state?.rounds[roundIndex];
  const group=()=>round()?.groups.find(g=>g.id===groupId);
  const game=()=>group()?.games.find(g=>g.number===gameNumber);
  const names=()=>new Map(data.participants.map(p=>[p.id,p.name]));
  const draftKey=()=>`fortnite-draft:${id}:${groupId}:${gameNumber}`;
  const editable=()=>Boolean(data?.state&&roundIndex===data.state.rounds.length-1&&!round()?.closed&&['READY','IN_PROGRESS'].includes(data.tournament.status));
  async function api(path,body) {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
    try {
      const response=await fetch('/api/fortnite/'+path,{method:body?'POST':'GET',cache:'no-store',credentials:'omit',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal});
      const value=await response.json();if(!response.ok)throw Error(value.message||'No se pudo completar la operación');return value;
    } catch(error){if(error.name==='AbortError')throw Error('El servidor no respondió a tiempo. Actualiza para comprobar si se guardó; tu borrador local se conserva.');throw error;}
    finally{clearTimeout(timeout);}
  }
  function rowsFromForm(){return [...$('scores').children].map(row=>({participantId:row.dataset.id,placement:Number(row.querySelector('[data-placement]').value),kills:Number(row.querySelector('[data-kills]').value),vipKill:row.querySelector('[data-vip]').checked,absent:row.querySelector('[data-absent]').checked}));}
  function rememberDraft(){if(!editable())return;dirty=true;storage.set(draftKey(),JSON.stringify({revision:draftRevision,vipName:$('vip').value.trim()||'VIP',rows:rowsFromForm()}));$('draft-note').hidden=false;$('draft-note').textContent='Cambios sin guardar. El borrador local se conserva en esta pestaña.';$('discard').hidden=false;}
  function hasDrafts(){const current=data?.state?.rounds.at(-1);return Boolean(current?.groups.some(g=>g.games.some(p=>storage.get(`fortnite-draft:${id}:${g.id}:${p.number}`))));}
  function render() {
    $('title').textContent=data.tournament.title;$('subtitle').textContent=`Fortnite · ${data.config.lobbySize} puestos · ${data.config.gamesPerRound} partidas por ronda · ${data.participants.length}/${data.tournament.maxParticipants} inscritos`;
    $('panel').hidden=false;$('generate').hidden=Boolean(data.state)||data.tournament.status==='ARCHIVED';$('generate').disabled=busy||data.participants.length<2;
    $('selectors').hidden=!data.state;$('group-panel').hidden=!data.state;$('jump-links').hidden=!data.state;
    if(!data.state){$('progress').textContent='El sorteo equilibra los grupos, asigna puestos aleatorios y cierra inscripciones.';return;}
    roundIndex=Math.min(roundIndex,data.state.rounds.length-1);
    $('round').innerHTML=data.state.rounds.map((r,i)=>`<option value="${i}">${r.final?'Final':'Ronda '+r.number}${r.closed?' · cerrada':''}</option>`).join('');$('round').value=String(roundIndex);
    const r=round();if(!r.groups.some(g=>g.id===groupId))groupId=r.groups[0].id;
    $('group').innerHTML=r.groups.map(g=>`<option value="${g.id}">Grupo ${g.number} · ${g.slots.length} jugadores</option>`).join('');$('group').value=groupId;
    const g=group();if(!g.games.some(p=>p.number===gameNumber))gameNumber=1;
    $('game').innerHTML=g.games.map(p=>`<option value="${p.number}">${p.number} · ${{PENDING:'pendiente',PLAYING:'en juego / borrador',COMPLETED:'confirmada'}[p.status]}</option>`).join('');$('game').value=String(gameNumber);
    const completed=r.groups.reduce((n,g)=>n+g.games.filter(p=>p.status==='COMPLETED').length,0),total=r.groups.length*data.config.gamesPerRound;
    $('progress').textContent=data.tournament.status==='ARCHIVED'?'Torneo archivado · solo lectura. Desarchívalo desde gestión para hacer cambios.':data.tournament.status==='COMPLETED'?'Torneo completado. La clasificación final está cerrada.':`${r.final?'Final':'Ronda '+r.number}: ${completed}/${total} actas confirmadas. ${r.closed?'Ronda cerrada: consulta de resultados.':'Puedes corregir actas antes de cerrar la ronda.'}`;
    $('advance').hidden=!editable();$('advance').disabled=busy||completed!==total;$('advance').textContent=r.final?'Cerrar final y proclamar ganador':'Cerrar ronda y clasificar';
    $('group-title').textContent=`${r.final?'Final':'Ronda '+r.number} · Grupo ${g.number}`;
    $('quota').textContent=r.final?'Gana quien más puntos acumule en la final.':`Pasan los ${g.qualifyCount} primeros de este grupo. Puestos ocupados: ${g.slots.length}/${data.config.lobbySize}.`;
    const name=names(),standing=data.summary.rounds[roundIndex].groups.find(x=>x.id===groupId).standings;
    $('standings').innerHTML=standing.map(row=>`<tr class="${row.qualifies?'qualified':''}"><td>${row.rank}${row.qualifies?' ↑':''}${row.excluded?' '+row.excluded:''}</td><td>${escape(name.get(row.participantId))}</td><td>${row.seat}</td><td><b>${row.points}</b></td><td>${row.kills}</td><td>${row.vips}</td></tr>`).join('');
    $('exclusion-player').innerHTML=g.slots.map(slot=>`<option value="${slot.participantId}">${escape(name.get(slot.participantId))}${g.excluded?.[slot.participantId]?' · '+g.excluded[slot.participantId]:''}</option>`).join('');
    $('exclusion').hidden=!editable();
    $('annul').disabled=busy||!editable();
    const last=data.state.rounds.at(-1);
    $('reopen').hidden=data.tournament.status==='ARCHIVED'||!(last.closed||(data.state.rounds.length>1&&last.groups.every(g=>g.games.every(p=>p.status==='PENDING'&&!p.rows.length))));
    $('tie-note').textContent=standing.some(row=>row.cutTie)?'Empate en el corte: se aplicará el desempate publicado (último criterio: puesto sorteado). Confírmalo al cerrar.':'';
    const p=game();$('game-title').textContent=`Partida ${p.number} de ${data.config.gamesPerRound}`;$('game-status').textContent={PENDING:'Pendiente',PLAYING:'En juego / acta en borrador',COMPLETED:'Acta confirmada'}[p.status];
    let draft;try{draft=JSON.parse(storage.get(draftKey())||'null');}catch{}
    dirty=Boolean(draft)&&editable();draftRevision=draft?.revision||p.revision;
    const results=editable()&&draft?draft.rows:p.rows,vip=editable()&&draft?draft.vipName:p.vipName;
    $('vip').value=vip||'VIP';$('vip').disabled=!editable()||busy;
    $('scores').innerHTML=[...g.slots].sort((a,b)=>a.seat-b.seat).map(slot=>{
      const row=results.find(v=>v.participantId===slot.participantId)||{placement:0,kills:0,vipKill:false};
      return `<div class="score-row" data-id="${slot.participantId}"><div class="score-name"><span class="seat">Puesto ${slot.seat}</span><b>${escape(name.get(slot.participantId))}</b></div><label>Podio<select data-placement aria-label="Podio de ${escape(name.get(slot.participantId))}">${[0,1,2,3].map(n=>`<option value="${n}" ${row.placement===n?'selected':''}>${n?n+'.º':'Sin podio'}</option>`).join('')}</select></label><label>Kills<input data-kills type="number" min="0" max="${g.slots.length}" step="1" value="${row.kills}" aria-label="Kills de ${escape(name.get(slot.participantId))}"></label><label>Kill VIP<input data-vip type="checkbox" ${row.vipKill?'checked':''} aria-label="${escape(name.get(slot.participantId))} eliminó al VIP"></label><label>Ausente<input data-absent type="checkbox" ${row.absent?'checked':''} aria-label="${escape(name.get(slot.participantId))} ausente"></label></div>`;
    }).join('');
    $('scores').querySelectorAll('input,select').forEach(node=>node.disabled=!editable()||busy);
    filterPlayers();
    $('start').disabled=busy||!editable()||p.status!=='PENDING';$('draft').disabled=busy||!editable()||p.status==='COMPLETED';$('confirm').disabled=busy||!editable();
    $('draft-note').hidden=!draft;$('discard').hidden=!draft;
    if(draft&&!editable())$('draft-note').textContent='Hay un borrador local de esta acta cerrada. Se muestran exclusivamente los resultados oficiales. Reabre la ronda para revisarlo.';
    if(dirty)$('draft-note').textContent=draftRevision===p.revision?'Borrador local recuperado. Revísalo antes de guardar.':'El servidor cambió después de este borrador. Copia tus datos si los necesitas y descártalo para revisar la nueva acta; no se sobrescribirá automáticamente.';
  }
  async function refresh(){if(busy)return;const generation=++requestGeneration;try{const fresh=await api('view');if(generation!==requestGeneration||busy)return;data=fresh;render();}catch(error){if(generation===requestGeneration&&!busy)message(error.message,true);}}
  async function action(input) {
    if(busy)return;requestGeneration++;busy=true;document.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);
    const previousRounds=data?.state?.rounds.length||0;
    try{
      data=await api('action',input);
      if(input.action==='START') {
        const draft=storage.get(draftKey());if(draft){const value=JSON.parse(draft);value.revision=game().revision;storage.set(draftKey(),JSON.stringify(value));}
      }
      if(input.action==='GAME'){storage.remove(draftKey());dirty=false;}
      if((data.state?.rounds.length||0)>previousRounds){roundIndex=data.state.rounds.length-1;groupId='';gameNumber=1;}
      message('Guardado en el servidor.');
    }catch(error){message(error.message,true);}finally{busy=false;document.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);render();}
  }
  $('refresh').onclick=refresh;
  $('generate').onclick=()=>{if(confirm('Se sortearán grupos y puestos y se cerrarán las inscripciones. ¿Continuar?'))void action({action:'GENERATE'});};
  $('advance').onclick=()=>{
    if(hasDrafts()){message('Hay borradores locales sin guardar. Revisa las partidas y guarda o descarta los cambios antes de cerrar.',true);return;}
    const tied=data.summary.rounds[roundIndex].groups.some(g=>g.standings.some(r=>r.cutTie));
    if(confirm((tied?'Hay empate en el corte; se aplicará el desempate publicado. ':'')+'Se cerrarán las actas de esta ronda. ¿Continuar?'))void action({action:'ADVANCE',revision:data.state.revision,acceptTies:tied});
  };
  const reason=()=>prompt('Motivo de la corrección (mínimo 3 caracteres):')?.trim();
  $('annul').onclick=()=>{if(hasDrafts()){message('Guarda o descarta los borradores antes de anular.',true);return;}const why=reason();if(why?.length>=3)void action({action:'ANNUL',revision:game().revision,groupId,gameNumber,reason:why});};
  $('reopen').onclick=()=>{const why=reason();if(why?.length>=3)void action({action:'REOPEN',revision:data.state.revision,reason:why});};
  $('exclude').onclick=()=>{const why=reason();if(why?.length>=3)void action({action:'EXCLUDE',revision:data.state.revision,participantId:$('exclusion-player').value,status:$('exclusion-status').value,reason:why});};
  $('start').onclick=()=>action({action:'START',revision:draftRevision,groupId,gameNumber,vipName:$('vip').value.trim()||'VIP'});
  function save(complete){if($('scores').querySelector('input:invalid')){message('Revisa las kills: deben ser números enteros dentro del límite.',true);return;}void action({action:'GAME',revision:draftRevision,groupId,gameNumber,vipName:$('vip').value.trim()||'VIP',rows:rowsFromForm(),complete});}
  $('draft').onclick=()=>save(false);$('confirm').onclick=()=>save(true);
  $('scores').oninput=event=>{const row=event.target.closest('.score-row');if(event.target.matches('[data-absent]')&&event.target.checked){row.querySelector('[data-placement]').value='0';row.querySelector('[data-kills]').value='0';row.querySelector('[data-vip]').checked=false;}rememberDraft();};$('vip').oninput=rememberDraft;
  function filterPlayers(){const value=$('player-filter').value.trim().toLocaleLowerCase();for(const row of $('scores').children)row.hidden=Boolean(value&&!row.querySelector('.score-name').textContent.toLocaleLowerCase().includes(value));}
  $('player-filter').oninput=filterPlayers;
  $('jump-score').onclick=()=>$('game-title').scrollIntoView({behavior:'smooth'});
  $('jump-standing').onclick=()=>$('group-title').scrollIntoView({behavior:'smooth'});
  $('round').onchange=()=>{roundIndex=Number($('round').value);groupId='';gameNumber=1;render();};
  $('group').onchange=()=>{groupId=$('group').value;gameNumber=1;render();};
  $('game').onchange=()=>{gameNumber=Number($('game').value);render();};
  $('discard').onclick=()=>{if(confirm('¿Descartar los cambios locales de esta partida?')){storage.remove(draftKey());dirty=false;render();}};
  window.addEventListener('beforeunload',event=>{if(hasDrafts()){event.preventDefault();event.returnValue='';}});
  (async()=>{
    try{
      if(ticket){const session=await api('session',{token:ticket});if(session.tournamentId!==id)throw Error('El enlace no corresponde al torneo');token=session.token;storage.set(authKey,token);history.replaceState(null,'',location.pathname+location.search);}
      else token=storage.get(authKey)||'';
      if(!token)throw Error('Abre este panel desde el botón Fortnite de la aplicación de gestión.');
      data=await api('view');roundIndex=Math.max(0,(data.state?.rounds.length||1)-1);render();
      setInterval(()=>{if(!busy&&!dirty&&!document.hidden&&!$('player-filter').value&&!document.activeElement?.matches('input,select'))void refresh();},15000);
    }catch(error){message(error.message,true);$('subtitle').textContent='No se ha podido abrir la gestión.';}
  })();
})();
