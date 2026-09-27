(function(){
  const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const states={READY_CHECK:"Confirmando asistencia",PLAYING:"En juego",SUSPENDED:"Esperando bracket / setup",AWAITING_CONFIRMATION:"Pendiente del rival",DISPUTED:"Disputa",COMPLETED:"Completado",CANCELLED:"Cancelado",EXPIRED:"Ausencia"};
  const button=(action,label,extra="")=>`<button class="btn secondary small" data-ladder-action="${action}" ${extra}>${label}</button>`;
  function render(detail) {
    if(!detail?.tournament?.importSource) return "";
    const ladder=detail.ladder;const active=ladder?.session?.status==="ACTIVE";const o=ladder?.session?.options || {};const s=o.settings || {};const competitive=s.mode==="COMPETITIVE";
    const field=(name,label,value,min,max)=>`<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" value="${value}" required></label>`;
    const match=m=>`<div class="panel stack"><strong>${m.participants.map(p=>`${esc(p.displayName)} ${p.score}`).join(" — ")}</strong><span>${esc(states[m.status] || m.status)} · Bo${m.bestOf} · ${esc(m.stationLabel || "Sin setup asignado")}</span><span>${esc(m.details?.disputeReason || m.details?.suspensionReason || "")}</span>${active?`<details><summary>Gestionar set</summary><form data-ladder-match="${esc(m.id)}" class="stack"><label>Motivo obligatorio<input name="reason" required maxlength="500"></label>${m.participants.map((p,i)=>field(`score${i}`,esc(p.displayName),p.score,0,Math.floor(m.bestOf/2)+1)).join("")}<div class="toolbar">${m.status!=="READY_CHECK"?button("RESOLVE_RESULT","Guardar resultado"):""}${["COMPLETED","DISPUTED","AWAITING_CONFIRMATION"].includes(m.status)?button("REOPEN_MATCH","Reabrir"):""}${m.status!=="COMPLETED"?button("CANCEL_MATCH","Cancelar y devolver a cola"):""}</div></form></details>`:""}</div>`;
    return `<section class="panel stack" id="ladder-panel"><h3>Ladder · ${!active?ladder?.session?"Finalizada":"Inactiva":o.closing?"Terminando sets":o.paused?"Pausada":"Activa"}</h3>
      <div class="toolbar">${active?`${button(o.paused?"RESUME":"PAUSE",o.paused?"Reanudar":"Pausar")}${!o.closing?'<button class="btn secondary small" data-ladder-finalize="1">Cerrar inscripciones</button>':""}`:'<button class="btn primary small" data-ladder-start="1">Iniciar ladder</button>'}</div>
      ${active?`<details><summary>Ajustes de ladder</summary><form id="ladder-settings" class="stack"><label>Clasificación<select name="mode"><option value="CASUAL">Casual</option><option value="COMPETITIVE" ${competitive?"selected":""}>Competitiva</option></select></label><label>Formato de nuevos sets<select name="bestOf">${[1,3,5].map(n=>`<option ${s.bestOf===n?"selected":""} value="${n}">Bo${n}</option>`).join("")}</select></label>
      ${field("readySeconds","Confirmar asistencia · segundos",s.readySeconds??300,30,900)}${field("rematchWaitSeconds","Espera máxima antes de repetir rival · segundos",s.rematchWaitSeconds??180,0,1800)}${field("minimumSets","Mínimo de sets competitivos",s.minimumSets??3,1,50)}
      <label><input type="checkbox" name="requireConfirmation" ${s.requireConfirmation?"checked":""}> El rival confirma el resultado</label><label>Setups separados por comas<input name="setupNumbers" value="${esc((s.setupNumbers||[]).join(','))}" placeholder="3,4"></label><small>Vacío: asignación manual. La bracket principal tiene prioridad.</small>
      <label>Apertura opcional UTC<input name="opensAt" value="${esc(s.opensAt||"")}" placeholder="2026-09-20T16:00:00Z"></label><label>Cierre opcional UTC<input name="closesAt" value="${esc(s.closesAt||"")}"></label><button class="btn primary">Guardar ajustes</button></form></details>
      <details><summary>Añadir / retirar jugadores</summary><div class="stack">${detail.participants.map(p=>`<div class="row between"><span>${esc(p.displayName)}</span><div>${!o.closing?button("ADD_PLAYER","Añadir a cola",`data-player="${esc(p.id)}"`):""}${button("REMOVE_PLAYER","Retirar",`data-player="${esc(p.id)}"`)}</div></div>`).join("")}</div></details>`:""}
      <h4>Cola · ${ladder?.queue?.length||0}</h4>${(ladder?.queue||[]).map((q,i)=>`<div>${i+1}. ${esc(q.displayName)} · ${esc(q.waitingReason)}</div>`).join("")}
      <h4>Sets abiertos</h4>${(ladder?.activeMatches||[]).map(match).join("") || '<p class="muted">Sin sets abiertos</p>'}
      <h4>Clasificación · ${competitive?`Rating · mínimo ${s.minimumSets} sets`:"Victorias y diferencia de juegos"}</h4>${(ladder?.standings||[]).map((r,i)=>`<div class="player-pill"><strong>${i+1}. ${esc(r.displayName)}</strong><span>${r.wins}–${r.losses} · ${r.winRate??0}%${competitive?` · ${r.rating}${r.eligible?"":" · provisional"}`:""}</span></div>`).join("")}
      <details><summary>Resultados y actividad</summary>${(ladder?.completedMatches||[]).slice(0,50).map(match).join("")}${(ladder?.activity||[]).slice(0,50).map(e=>`<p><small>${esc(e.createdAt)} · ${esc(e.action)} · ${esc(e.actor)} · ${esc(e.reason)}</small></p>`).join("")}</details></section>`;
  }
  function bind(detail,send) {
    if(!detail) return;const panel=document.getElementById("ladder-panel");if(!panel) return;
    const revision=detail.ladder?.session?.options?.revision;
    panel.querySelectorAll('[data-ladder-action]').forEach(node=>node.addEventListener('click',event=>{
      event.preventDefault();const form=node.closest('form');const action=node.dataset.ladderAction;
      const input={action,actor:"web_manage",expectedRevision:revision,participantId:node.dataset.player};
      if(form){ if(!form.reportValidity()) return;const m=[...detail.ladder.activeMatches,...detail.ladder.completedMatches].find(m=>m.id===form.dataset.ladderMatch);if(!m)return;
        input.matchId=m.id;input.expectedRevision=m.details?.revision;input.reason=form.elements.reason.value.trim();
        if(action==='RESOLVE_RESULT'){input.scores=m.participants.map((p,i)=>({participantId:p.participantId,score:Number(form.elements[`score${i}`].value)}));input.winnerParticipantId=[...input.scores].sort((a,b)=>b.score-a.score)[0].participantId;}
      }send(input);
    }));
    panel.querySelector('#ladder-settings')?.addEventListener('submit',event=>{
      event.preventDefault();const f=event.target.elements;
      const settings={mode:f.mode.value,bestOf:Number(f.bestOf.value),readySeconds:Number(f.readySeconds.value),rematchWaitSeconds:Number(f.rematchWaitSeconds.value),minimumSets:Number(f.minimumSets.value),requireConfirmation:f.requireConfirmation.checked,setupNumbers:f.setupNumbers.value.split(',').map(x=>x.trim()).filter(Boolean).map(Number),opensAt:f.opensAt.value.trim()||undefined,closesAt:f.closesAt.value.trim()||undefined};
      send({action:"SETTINGS",actor:"web_manage",expectedRevision:revision,settings});
    });
  }
  window.GTLadderPanel={render,bind};
})();
