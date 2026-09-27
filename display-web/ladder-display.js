(function () {
  const html = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const statuses = {READY_CHECK:"Confirma asistencia", PLAYING:"En juego", SUSPENDED:"Esperando bracket / setup", AWAITING_CONFIRMATION:"Pendiente del rival", DISPUTED:"En revisión", COMPLETED:"Finalizado", CANCELLED:"Cancelado", EXPIRED:"Ausencia"};
  function scenes(detail, height) {
    if (!detail.ladder?.session) return [];
    const capacity = Math.max(2,Math.floor((height-330)/135));
    const groups = [["Sets abiertos",detail.ladder.activeMatches,"matches"],["Clasificación",detail.ladder.standings,"standings"],["Cola",detail.ladder.queue,"queue"],["Resultados recientes",detail.ladder.completedMatches.filter(m=>m.status==="COMPLETED").slice(0,20),"matches"]];
    const scenes = groups.flatMap(([title,rows,kind],group) => {
      const pages=[];
      for(let i=0;i<rows.length;i+=capacity) pages.push({key:`${detail.tournament.id}:ladder:${group}:${i}`,type:"ladder",detail,rows:rows.slice(i,i+capacity),kind,offset:i,label:`${detail.tournament.title} · Ladder · ${title}`,title,page:Math.floor(i/capacity)+1,pages:Math.ceil(rows.length/capacity)});
      return pages;
    });
    return scenes.length ? scenes : [{key:detail.tournament.id+":ladder:waiting",type:"ladder",detail,rows:[],kind:"queue",offset:0,label:detail.tournament.title+" · Ladder",title:"Esperando jugadores",page:1,pages:1}];
  }
  function render(entry,sponsors="") {
    const options=entry.detail.ladder.session.options || {};
    const competitive=options.settings?.mode==="COMPETITIVE";
    const state=entry.detail.ladder.session.status==="COMPLETED"?"Finalizada":options.closing?"Inscripciones cerradas":options.paused?"Pausada":"Activa";
    const rows=entry.rows.map((row,index)=> {
      if(entry.kind==="standings") return `<div class="ladder-display-row"><b class="ladder-position">${entry.offset+index+1}</b><strong>${html(row.displayName)}</strong><span>${row.wins}–${row.losses} · ${row.winRate}%${competitive?` · ${row.rating}${row.eligible?"":" · provisional"}`:""}</span></div>`;
      if(entry.kind==="queue") return `<div class="ladder-display-row"><b class="ladder-position">${entry.offset+index+1}</b><strong>${html(row.displayName)}</strong><span>${html(row.waitingReason || "Esperando rival")}</span></div>`;
      return `<div class="ladder-display-match"><div class="ladder-display-tag">${html(row.stationLabel || "Ladder")} · Bo${row.bestOf} · ${html(statuses[row.status] || row.status)}</div><div class="ladder-display-players">${row.participants.map(p=>`<strong>${html(p.displayName)}</strong><b>${p.score}</b>`).join("")}</div></div>`;
    }).join("");
    return `<div class="screen scene-ladder"><div class="scene-shell">${sponsors}<div class="scene-topbar"><div class="scene-title"><div class="eyebrow">Ladder · ${state} · ${competitive?"Competitiva":"Casual"}</div><div class="name">${html(entry.detail.tournament.title)}</div><div class="scene-meta">${html(entry.title)} · Página ${entry.page}/${entry.pages}${competitive?` · Mínimo ${options.settings.minimumSets} sets`:""}</div></div></div><div class="ladder-display-list">${rows || '<div class="ladder-display-row"><strong>Entra en la cola desde la app de jugadores</strong></div>'}</div></div></div>`;
  }
  window.GTLadderDisplay={scenes,render};
})();
