(() => {
  const byId = id => document.getElementById(id);
  const tournamentId = new URLSearchParams(location.search).get('tournamentId');
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  const validId = tournamentId && /^[a-zA-Z0-9_-]{1,100}$/.test(tournamentId);
  const registrationUrl = './?tournamentId=' + encodeURIComponent(tournamentId || '');
  let teamTournament = false;
  function teamMode() {
    const mode = byId('registration-mode').value;
    byId('create-team-fields').hidden = mode !== 'TEAM_CREATE';
    byId('join-team-fields').hidden = mode !== 'TEAM_JOIN';
    byId('team-name').required = teamTournament && mode === 'TEAM_CREATE';
    byId('team-code').required = teamTournament && mode === 'TEAM_JOIN';
    byId('team-help').textContent = mode === 'TEAM_CREATE' ? 'Al confirmar tu correo serás el primer titular y recibirás un código para invitar al resto del equipo.' : mode === 'TEAM_JOIN' ? 'Cada jugador confirma su propio correo. La plaza de titular o reserva se comprueba al confirmar.' : 'La organización verá tu nick en la lista sin equipo y podrá asignarte una plaza. Apuntarse a esta lista no garantiza equipo ni plaza en la bracket.';
  }
  byId('registration-mode').addEventListener('change', teamMode);
  byId('new-link').href = registrationUrl;
  async function api(path, body) {
    let response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      response = await fetch('/api/public-registration/' + path, {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined, signal: controller.signal,
      });
    } catch { throw Error('No se pudo conectar. Comprueba tu conexión y vuelve a intentarlo.'); }
    finally { clearTimeout(timeout); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.message || 'No se pudo completar la solicitud. Inténtalo de nuevo.');
    return data;
  }
  function message(text, error = false) {
    const node = byId('message'); node.textContent = text; node.className = error ? 'error' : 'sent'; node.hidden = false;
  }
  async function load() {
    byId('retry').hidden = true;
    byId('verification').hidden = true;
    if (!validId) { byId('tournament-title').textContent = 'Enlace no válido'; message('Utiliza el enlace de inscripción que te haya facilitado la organización.', true); return; }
    try {
      const data = await api(encodeURIComponent(tournamentId));
      byId('tournament-title').textContent = data.title;
      document.title = data.title + ' · Inscripción';
      byId('game').textContent = data.gameTitle + ' · ' + data.platform;
      byId('format-rules').hidden = data.bracketMode !== 'FORTNITE';
      if(data.bracketMode === 'FORTNITE') byId('format-rules').textContent = `Fortnite: grupos de hasta ${data.fortniteLobbySize} participantes más un VIP externo adicional y ${data.fortniteGamesPerRound} partidas por ronda. Puestos aleatorios. Puntos: 1.º 10, 2.º 6, 3.º 4, cada kill 1 y eliminar al VIP 5 extra. Se acumulan en la ronda y se reinician al pasar. Desempate: primeros, segundos, terceros, kills, VIP y menor número de puesto sorteado. El cupo de clasificados de cada grupo se publica al sortear.`;
      const date = new Date(data.startsAt);
      byId('date').textContent = Number.isNaN(date.getTime()) ? 'Fecha por confirmar' : date.toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
      teamTournament = (data.teamSize || 1) > 1;
      byId('places').textContent = data.availablePlaces + ' de ' + data.maxParticipants + (teamTournament ? ' equipos' : '');
      byId('team-fields').hidden = !teamTournament;
      byId('team-rules').textContent = data.teamSize + ' titulares y hasta ' + (data.reserveCount || 0) + ' reservas por equipo.';
      byId('solo-option').disabled = !data.allowSoloRegistration;
      byId('solo-option').hidden = !data.allowSoloRegistration;
      byId('reserve-option').disabled = !data.reserveCount;
      byId('reserve-option').hidden = !data.reserveCount;
      byId('registration-mode').querySelector('[value="TEAM_CREATE"]').disabled = data.availablePlaces === 0 && !data.waitlistEnabled;
      if (teamTournament && data.availablePlaces === 0 && !data.waitlistEnabled) byId('registration-mode').value = 'TEAM_JOIN';
      teamMode();
      byId('details').hidden = false;
      byId('availability').textContent = !data.open ? 'Las inscripciones están cerradas.' : data.availablePlaces === 0 ? (teamTournament ? 'No quedan plazas para nuevos equipos. Puedes completar un equipo existente con su código.' : 'El torneo está completo.') : '';
      byId('registration').hidden = Boolean(token) || !data.open || (!teamTournament && !data.availablePlaces && !data.waitlistEnabled);
      if(data.open&&data.waitlistEnabled&&data.availablePlaces===0)byId('availability').textContent='Aforo completo. Puedes verificar tu correo para entrar en lista de espera. La asignación será automática al liberarse una plaza, mientras las inscripciones sigan abiertas.';
      byId('deadline').textContent=data.registrationClosesAt?'Cierre de inscripciones: '+new Date(data.registrationClosesAt).toLocaleString('es-ES'):'';
      if(token){
        const current=await api('status',{token});
        if(current.confirmed||current.removed)showStatus(current);
        else byId('verification').hidden=false;
      }

    } catch (error) { message(error.message, true); byId('retry').hidden = false; }
  }
  byId('registration').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true; button.textContent = 'Enviando enlace…';
    byId('message').hidden = true;
    try {
      const input = { nickname: byId('nickname').value.trim(), email: byId('email').value.trim() };
      if (teamTournament) {
        input.mode = byId('registration-mode').value;input.gameId=byId('game-id').value.trim();input.preferredRole=byId('preferred-role').value.trim();
        if (input.mode === 'TEAM_CREATE') input.teamName = byId('team-name').value.trim();
        if (input.mode === 'TEAM_JOIN') { input.teamCode = byId('team-code').value.trim(); input.role = byId('team-role').value; }
      }
      const data = await api(encodeURIComponent(tournamentId) + '/request', input);
      message(data.message);
    } catch (error) { message(error.message, true); }
    finally { button.disabled = false; button.textContent = 'Enviar enlace de verificación'; }
  });
  byId('confirm').addEventListener('click', async () => {
    const button = byId('confirm'); button.disabled = true; button.textContent = 'Confirmando…';
    byId('message').hidden = true;
    try {
      const data = await api('confirm', { token });
      // Confirmation has committed. A failed refresh must not imply it failed.
      showStatus(data);
      history.replaceState(null, '', registrationUrl);
      try { showStatus(await api('status',{token})); }
      catch {
        message('La operación se ha guardado. No hemos podido actualizar todos los datos. Pulsa «Volver a cargar» para consultarlos.', true);
        byId('retry').hidden = false;
      }
    } catch (error) { message(error.message, true); }
    finally { button.disabled = false; button.textContent = 'Confirmar inscripción'; }
  });
  function showStatus(data){
    byId('verification').hidden=true;byId('availability').hidden=true;byId('success').hidden=false;
    byId('success-heading').textContent=data.removed?'Inscripción retirada por la organización':data.cancelled?'Inscripción cancelada':data.waiting?'En lista de espera':'Inscripción confirmada';
    byId('success-text').textContent=data.nickname+' · '+data.title;
    byId('success-hint').textContent=data.removed?'Ya no figuras entre los inscritos. Contacta con la organización si necesitas aclararlo.':data.cancelled?'Tu plaza se ha liberado.':data.waiting?'Te avisaremos por correo si se te asigna una plaza antes del cierre.':data.kind==='TEAM_MEMBER'?(data.waitingForTeam?'Estás en la lista sin equipo. Te avisaremos cuando la organización te asigne uno.':'Equipo: '+data.teamName+' · '+(data.role==='RESERVE'?'reserva':'titular')):'Ya figuras en el torneo. Recuerda confirmar asistencia si se exige check-in.';
    byId('team-invite').hidden=!data.teamCode;if(data.teamCode)byId('invite-code').textContent=data.teamCode;
    byId('cancel').hidden=!data.canCancel||data.cancelled;
  }
  byId('recover').addEventListener('submit',async e=>{e.preventDefault();const b=byId('recover-button');b.disabled=true;try{message((await api(encodeURIComponent(tournamentId)+'/recover',{email:byId('recover-email').value.trim()})).message);}catch(e){message(e.message,true);}finally{b.disabled=false;}});
  byId('cancel').addEventListener('click',async()=>{if(!confirm('¿Cancelar tu inscripción? Si eres capitán, otro miembro del equipo asumirá la capitanía.'))return;byId('cancel').disabled=true;try{showStatus(await api('cancel',{token}));}catch(e){message(e.message,true);}finally{byId('cancel').disabled=false;}});
  byId('retry').addEventListener('click', () => { byId('message').hidden = true; void load(); });
  byId('copy-invite').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(byId('invite-code').textContent); message('Código copiado.'); }
    catch { message('Puedes seleccionar y copiar el código que aparece arriba.'); }
  });
  // A mail link may reuse the registration tab and change only the fragment.
  window.addEventListener('hashchange', () => location.reload());
  void load();
})();
