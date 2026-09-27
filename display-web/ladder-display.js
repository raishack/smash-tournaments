(function () {
  const html = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const statuses = {READY_CHECK:"Confirm attendance", PLAYING:"Playing", SUSPENDED:"Waiting for bracket / setup", AWAITING_CONFIRMATION:"Waiting for opponent", DISPUTED:"Under review", COMPLETED:"Finished", CANCELLED:"Cancelled", EXPIRED:"Absence"};
  function scenes(detail, height) {
    if (!detail.ladder?.session) return [];
    const capacity = Math.max(2,Math.floor((height-330)/135));
    const groups = [["Open sets",detail.ladder.activeMatches,"matches"],["Standings",detail.ladder.standings,"standings"],["Queue",detail.ladder.queue,"queue"],["Recent results",detail.ladder.completedMatches.filter(m=>m.status==="COMPLETED").slice(0,20),"matches"]];
    const scenes = groups.flatMap(([title,rows,kind],group) => {
      const pages=[];
      for(let i=0;i<rows.length;i+=capacity) pages.push({key:`${detail.tournament.id}:ladder:${group}:${i}`,type:"ladder",detail,rows:rows.slice(i,i+capacity),kind,offset:i,label:`${detail.tournament.title} · Ladder · ${title}`,title,page:Math.floor(i/capacity)+1,pages:Math.ceil(rows.length/capacity)});
      return pages;
    });
    return scenes.length ? scenes : [{key:detail.tournament.id+":ladder:waiting",type:"ladder",detail,rows:[],kind:"queue",offset:0,label:detail.tournament.title+" · Ladder",title:"Waiting for players",page:1,pages:1}];
  }
  function render(entry,sponsors="") {
    const options=entry.detail.ladder.session.options || {};
    const competitive=options.settings?.mode==="COMPETITIVE";
    const state=entry.detail.ladder.session.status==="COMPLETED"?"Finished":options.closing?"Registration closed":options.paused?"Paused":"Active";
    const rows=entry.rows.map((row,index)=> {
      if(entry.kind==="standings") return `<div class="ladder-display-row"><b class="ladder-position">${entry.offset+index+1}</b><strong>${html(row.displayName)}</strong><span>${row.wins}–${row.losses} · ${row.winRate}%${competitive?` · ${row.rating}${row.eligible?"":" · provisional"}`:""}</span></div>`;
      if(entry.kind==="queue") return `<div class="ladder-display-row"><b class="ladder-position">${entry.offset+index+1}</b><strong>${html(row.displayName)}</strong><span>${html(row.waitingReason || "Waiting for opponent")}</span></div>`;
      return `<div class="ladder-display-match"><div class="ladder-display-tag">${html(row.stationLabel || "Ladder")} · Bo${row.bestOf} · ${html(statuses[row.status] || row.status)}</div><div class="ladder-display-players">${row.participants.map(p=>`<strong>${html(p.displayName)}</strong><b>${p.score}</b>`).join("")}</div></div>`;
    }).join("");
    return `<div class="screen scene-ladder"><div class="scene-shell">${sponsors}<div class="scene-topbar"><div class="scene-title"><div class="eyebrow">Ladder · ${state} · ${competitive?"Competitive":"Casual"}</div><div class="name">${html(entry.detail.tournament.title)}</div><div class="scene-meta">${html(entry.title)} · Page ${entry.page}/${entry.pages}${competitive?` · Minimum ${options.settings.minimumSets} sets`:""}</div></div></div><div class="ladder-display-list">${rows || '<div class="ladder-display-row"><strong>Join the queue from the Players app</strong></div>'}</div></div></div>`;
  }
  window.GTLadderDisplay={scenes,render};
})();
