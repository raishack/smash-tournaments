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
      const value=await response.json();if(!response.ok)throw Error(value.message||'Could not complete the operation');return value;
    } catch(error){if(error.name==='AbortError')throw Error('The server did not respond in time. Refresh to check whether it saved; your local draft is preserved.');throw error;}
    finally{clearTimeout(timeout);}
  }
  function rowsFromForm(){return [...$('scores').children].map(row=>({participantId:row.dataset.id,placement:Number(row.querySelector('[data-placement]').value),kills:Number(row.querySelector('[data-kills]').value),vipKill:row.querySelector('[data-vip]').checked,absent:row.querySelector('[data-absent]').checked}));}
  function rememberDraft(){if(!editable())return;dirty=true;storage.set(draftKey(),JSON.stringify({revision:draftRevision,vipName:$('vip').value.trim()||'VIP',rows:rowsFromForm()}));$('draft-note').hidden=false;$('draft-note').textContent='Unsaved changes. The local draft is kept in this tab.';$('discard').hidden=false;}
  function hasDrafts(){const current=data?.state?.rounds.at(-1);return Boolean(current?.groups.some(g=>g.games.some(p=>storage.get(`fortnite-draft:${id}:${g.id}:${p.number}`))));}
  function render() {
    $('title').textContent=data.tournament.title;$('subtitle').textContent=`Fortnite · ${data.config.lobbySize} seats · ${data.config.gamesPerRound} games per round · ${data.participants.length}/${data.tournament.maxParticipants} registered`;
    $('panel').hidden=false;$('generate').hidden=Boolean(data.state)||data.tournament.status==='ARCHIVED';$('generate').disabled=busy||data.participants.length<2;
    $('selectors').hidden=!data.state;$('group-panel').hidden=!data.state;$('jump-links').hidden=!data.state;
    if(!data.state){$('progress').textContent='The draw balances groups, assigns random seats and closes registration.';return;}
    roundIndex=Math.min(roundIndex,data.state.rounds.length-1);
    $('round').innerHTML=data.state.rounds.map((r,i)=>`<option value="${i}">${r.final?'Final':'Round '+r.number}${r.closed?' · closed':''}</option>`).join('');$('round').value=String(roundIndex);
    const r=round();if(!r.groups.some(g=>g.id===groupId))groupId=r.groups[0].id;
    $('group').innerHTML=r.groups.map(g=>`<option value="${g.id}">Group ${g.number} · ${g.slots.length} players</option>`).join('');$('group').value=groupId;
    const g=group();if(!g.games.some(p=>p.number===gameNumber))gameNumber=1;
    $('game').innerHTML=g.games.map(p=>`<option value="${p.number}">${p.number} · ${{PENDING:'pending',PLAYING:'playing / draft',COMPLETED:'confirmada'}[p.status]}</option>`).join('');$('game').value=String(gameNumber);
    const completed=r.groups.reduce((n,g)=>n+g.games.filter(p=>p.status==='COMPLETED').length,0),total=r.groups.length*data.config.gamesPerRound;
    $('progress').textContent=data.tournament.status==='ARCHIVED'?'Tournament archived · read-only. Unarchive it from management to make changes.':data.tournament.status==='COMPLETED'?'Tournament completed. Final standings are locked.':`${r.final?'Final':'Round '+r.number}: ${completed}/${total} actas confirmadas. ${r.closed?'Round closed: results are read-only.':'You can correct score sheets before closing the round.'}`;
    $('advance').hidden=!editable();$('advance').disabled=busy||completed!==total;$('advance').textContent=r.final?'Close final and declare winner':'Close round and qualify players';
    $('group-title').textContent=`${r.final?'Final':'Round '+r.number} · Group ${g.number}`;
    $('quota').textContent=r.final?'The player with the most points in the final wins.':`Top ${g.qualifyCount} qualify from this group. Occupied seats: ${g.slots.length}/${data.config.lobbySize}.`;
    const name=names(),standing=data.summary.rounds[roundIndex].groups.find(x=>x.id===groupId).standings;
    $('standings').innerHTML=standing.map(row=>`<tr class="${row.qualifies?'qualified':''}"><td>${row.rank}${row.qualifies?' ↑':''}${row.excluded?' '+row.excluded:''}</td><td>${escape(name.get(row.participantId))}</td><td>${row.seat}</td><td><b>${row.points}</b></td><td>${row.kills}</td><td>${row.vips}</td></tr>`).join('');
    $('exclusion-player').innerHTML=g.slots.map(slot=>`<option value="${slot.participantId}">${escape(name.get(slot.participantId))}${g.excluded?.[slot.participantId]?' · '+g.excluded[slot.participantId]:''}</option>`).join('');
    $('exclusion').hidden=!editable();
    $('annul').disabled=busy||!editable();
    const last=data.state.rounds.at(-1);
    $('reopen').hidden=data.tournament.status==='ARCHIVED'||!(last.closed||(data.state.rounds.length>1&&last.groups.every(g=>g.games.every(p=>p.status==='PENDING'&&!p.rows.length))));
    $('tie-note').textContent=standing.some(row=>row.cutTie)?'Tie at the cutoff: published tiebreakers will apply (last criterion: assigned seat). Confirm when closing the round.':'';
    const p=game();$('game-title').textContent=`Game ${p.number} of ${data.config.gamesPerRound}`;$('game-status').textContent={PENDING:'Pending',PLAYING:'Playing / draft score sheet',COMPLETED:'Score sheet confirmed'}[p.status];
    let draft;try{draft=JSON.parse(storage.get(draftKey())||'null');}catch{}
    dirty=Boolean(draft)&&editable();draftRevision=draft?.revision||p.revision;
    const results=editable()&&draft?draft.rows:p.rows,vip=editable()&&draft?draft.vipName:p.vipName;
    $('vip').value=vip||'VIP';$('vip').disabled=!editable()||busy;
    $('scores').innerHTML=[...g.slots].sort((a,b)=>a.seat-b.seat).map(slot=>{
      const row=results.find(v=>v.participantId===slot.participantId)||{placement:0,kills:0,vipKill:false};
      return `<div class="score-row" data-id="${slot.participantId}"><div class="score-name"><span class="seat">Seat ${slot.seat}</span><b>${escape(name.get(slot.participantId))}</b></div><label>Podium<select data-placement aria-label="Placement for ${escape(name.get(slot.participantId))}">${[0,1,2,3].map(n=>`<option value="${n}" ${row.placement===n?'selected':''}>${n?'#'+n:'No podium'}</option>`).join('')}</select></label><label>Kills<input data-kills type="number" min="0" max="${g.slots.length}" step="1" value="${row.kills}" aria-label="Kills for ${escape(name.get(slot.participantId))}"></label><label>Kill VIP<input data-vip type="checkbox" ${row.vipKill?'checked':''} aria-label="${escape(name.get(slot.participantId))} eliminated the VIP"></label><label>Absent<input data-absent type="checkbox" ${row.absent?'checked':''} aria-label="${escape(name.get(slot.participantId))} absent"></label></div>`;
    }).join('');
    $('scores').querySelectorAll('input,select').forEach(node=>node.disabled=!editable()||busy);
    filterPlayers();
    $('start').disabled=busy||!editable()||p.status!=='PENDING';$('draft').disabled=busy||!editable()||p.status==='COMPLETED';$('confirm').disabled=busy||!editable();
    $('draft-note').hidden=!draft;$('discard').hidden=!draft;
    if(draft&&!editable())$('draft-note').textContent='A local draft exists for this closed score sheet. Only official results are shown. Reopen the round to review it.';
    if(dirty)$('draft-note').textContent=draftRevision===p.revision?'Local draft restored. Review it before saving.':'The server has changed since this draft. Copy any data you need, then discard it to review the new score sheet; it will not be overwritten automatically.';
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
      message('Saved on the server.');
    }catch(error){message(error.message,true);}finally{busy=false;document.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);render();}
  }
  $('refresh').onclick=refresh;
  $('generate').onclick=()=>{if(confirm('Groups and seats will be drawn and registration will close. Continue?'))void action({action:'GENERATE'});};
  $('advance').onclick=()=>{
    if(hasDrafts()){message('There are unsaved local drafts. Review games and save or discard changes before closing.',true);return;}
    const tied=data.summary.rounds[roundIndex].groups.some(g=>g.standings.some(r=>r.cutTie));
    if(confirm((tied?'Tie at the cutoff; the published tiebreaker will apply. ':'')+'The score sheets for this round will be closed. Continue?'))void action({action:'ADVANCE',revision:data.state.revision,acceptTies:tied});
  };
  const reason=()=>prompt('Correction reason (at least 3 characters):')?.trim();
  $('annul').onclick=()=>{if(hasDrafts()){message('Save or discard drafts before annulling.',true);return;}const why=reason();if(why?.length>=3)void action({action:'ANNUL',revision:game().revision,groupId,gameNumber,reason:why});};
  $('reopen').onclick=()=>{const why=reason();if(why?.length>=3)void action({action:'REOPEN',revision:data.state.revision,reason:why});};
  $('exclude').onclick=()=>{const why=reason();if(why?.length>=3)void action({action:'EXCLUDE',revision:data.state.revision,participantId:$('exclusion-player').value,status:$('exclusion-status').value,reason:why});};
  $('start').onclick=()=>action({action:'START',revision:draftRevision,groupId,gameNumber,vipName:$('vip').value.trim()||'VIP'});
  function save(complete){if($('scores').querySelector('input:invalid')){message('Check kills: use whole numbers within the limit.',true);return;}void action({action:'GAME',revision:draftRevision,groupId,gameNumber,vipName:$('vip').value.trim()||'VIP',rows:rowsFromForm(),complete});}
  $('draft').onclick=()=>save(false);$('confirm').onclick=()=>save(true);
  $('scores').oninput=event=>{const row=event.target.closest('.score-row');if(event.target.matches('[data-absent]')&&event.target.checked){row.querySelector('[data-placement]').value='0';row.querySelector('[data-kills]').value='0';row.querySelector('[data-vip]').checked=false;}rememberDraft();};$('vip').oninput=rememberDraft;
  function filterPlayers(){const value=$('player-filter').value.trim().toLocaleLowerCase();for(const row of $('scores').children)row.hidden=Boolean(value&&!row.querySelector('.score-name').textContent.toLocaleLowerCase().includes(value));}
  $('player-filter').oninput=filterPlayers;
  $('jump-score').onclick=()=>$('game-title').scrollIntoView({behavior:'smooth'});
  $('jump-standing').onclick=()=>$('group-title').scrollIntoView({behavior:'smooth'});
  $('round').onchange=()=>{roundIndex=Number($('round').value);groupId='';gameNumber=1;render();};
  $('group').onchange=()=>{groupId=$('group').value;gameNumber=1;render();};
  $('game').onchange=()=>{gameNumber=Number($('game').value);render();};
  $('discard').onclick=()=>{if(confirm('Discard local changes to this game?')){storage.remove(draftKey());dirty=false;render();}};
  window.addEventListener('beforeunload',event=>{if(hasDrafts()){event.preventDefault();event.returnValue='';}});
  (async()=>{
    try{
      if(ticket){const session=await api('session',{token:ticket});if(session.tournamentId!==id)throw Error('The link does not belong to this tournament');token=session.token;storage.set(authKey,token);history.replaceState(null,'',location.pathname+location.search);}
      else token=storage.get(authKey)||'';
      if(!token)throw Error('Open this panel using the Fortnite button in the management app.');
      data=await api('view');roundIndex=Math.max(0,(data.state?.rounds.length||1)-1);render();
      setInterval(()=>{if(!busy&&!dirty&&!document.hidden&&!$('player-filter').value&&!document.activeElement?.matches('input,select'))void refresh();},15000);
    }catch(error){message(error.message,true);$('subtitle').textContent='Could not open management.';}
  })();
})();
