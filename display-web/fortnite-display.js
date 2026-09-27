(function(root){
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function scenes(detail,width,height) {
    const round=detail.fortnite?.rounds.at(-1);
    if(!round)return [{key:'waiting',label:'Fortnite · pendientes de sorteo',waiting:true,rows:[]}];
    const columns=width>=1250?2:1,perColumn=Math.max(3,Math.floor((height-150)/52)),capacity=columns*perColumn;
    const names=new Map(detail.participants.map(p=>[p.id,p.displayName]));
    return round.groups.flatMap(group=>{
      const active=group.games.find(g=>g.status==='PLAYING')||group.games.find(g=>g.status==='PENDING')||group.games.at(-1);
      const completed=group.games.filter(g=>g.status==='COMPLETED').length;
      const modes=detail.tournament.status==='COMPLETED'?['standings']:['seats','standings'];
      return modes.flatMap(mode=>{
        const rows=mode==='seats'?[...group.standings].sort((a,b)=>a.seat-b.seat):group.standings;
        const pages=Math.ceil(rows.length/capacity);
        return Array.from({length:pages},(_,page)=>({key:`${round.number}:${group.id}:${mode}:${page}`,label:`${round.final?'Final':'Ronda '+round.number} · Grupo ${group.number} · ${mode==='seats'?'Puestos':'Clasificación'} ${page+1}/${pages}`,
          mode,round:round.number,final:round.final,group:group.number,quota:group.qualifyCount,columns,perColumn,page:page+1,pages,completed,total:group.games.length,
          game:active.number,status:active.status,vipName:active.vipName||'VIP',closed:round.closed,champion:detail.tournament.status==='COMPLETED'?names.get(group.standings[0]?.participantId):null,
          rows:rows.slice(page*capacity,(page+1)*capacity).map(row=>({...row,name:names.get(row.participantId)||'Jugador',vip:false}))}));
      });
    });
  }
  function render(scene) {
    if(scene.waiting)return '<div class="fortnite-waiting">Fortnite · Inscripción de jugadores<br><small>Los grupos y puestos aparecerán al realizar el sorteo.</small></div>';
    const chunks=[];for(let i=0;i<scene.rows.length;i+=scene.perColumn)chunks.push(scene.rows.slice(i,i+scene.perColumn));
    return `<section class="fortnite-board"><div class="fortnite-heading"><div><h2>${scene.final?'Final':'Ronda '+scene.round} · Grupo ${scene.group}</h2><p>${scene.mode==='seats'?'Puestos asignados':'Clasificación acumulada'} · Página ${scene.page}/${scene.pages} · ${scene.closed?'Definitiva':'Provisional'} · Partida ${scene.game}/${scene.total} · ${scene.total-scene.completed} pendientes</p></div><div class="fortnite-badge">${scene.champion?'Ganador: '+esc(scene.champion):scene.final?'Final por puntos':'Pasan los '+scene.quota+' primeros'}</div></div>
      <div class="fortnite-columns ${scene.columns===2?'two':''}">${chunks.map(rows=>`<table class="fortnite-table"><thead><tr><th>${scene.mode==='seats'?'Puesto':'#'}</th><th>Jugador</th><th>${scene.mode==='seats'?'Estado':'Al corte'}</th><th>Puntos</th><th>Kills</th></tr></thead><tbody>${rows.map(row=>`<tr class="${scene.mode==='standings'&&row.qualifies?'qualified':''}"><td>${scene.mode==='seats'?row.seat:row.rank}</td><td class="fortnite-name">${esc(row.name)}${row.vip?'<span class="fortnite-vip">VIP</span>':''}</td><td>${row.excluded?esc(row.excluded):scene.mode==='standings'?(row.gapToCut===null?'—':row.qualifies?'Clasifica':row.gapToCut===0?'Empate':row.gapToCut+' pts'):scene.status==='PLAYING'?'En juego':scene.status==='COMPLETED'?'Finalizado':'Preparado'}</td><td class="fortnite-points">${row.points}</td><td>${row.kills}</td></tr>`).join('')}</tbody></table>`).join('')}</div>
      <p class="fortnite-legend">VIP externo: ${esc(scene.vipName)} · Podio 10 / 6 / 4 · Kill 1 · VIP +5${scene.quota?' · Verde: zona de clasificación':''} · Puntos acumulados de esta ronda</p></section>`;
  }
  root.GTFortniteDisplay={scenes,render};
})(typeof window!=='undefined'?window:globalThis);
