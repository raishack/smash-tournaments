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
    byId('team-help').textContent = mode === 'TEAM_CREATE' ? 'After verifying your email, you become the first starter and receive a code to invite the rest of your team.' : mode === 'TEAM_JOIN' ? 'Each player verifies their own email. Starter or reserve availability is checked on confirmation.' : 'Staff will see your nickname on the solo player list and may assign you a place. Joining this list does not guarantee a team or a bracket place.';
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
    } catch { throw Error('Could not connect. Check your connection and try again.'); }
    finally { clearTimeout(timeout); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.message || 'Could not complete the request. Try again.');
    return data;
  }
  function message(text, error = false) {
    const node = byId('message'); node.textContent = text; node.className = error ? 'error' : 'sent'; node.hidden = false;
  }
  async function load() {
    byId('retry').hidden = true;
    byId('verification').hidden = true;
    if (!validId) { byId('tournament-title').textContent = 'Invalid link'; message('Use the registration link provided by the organizers.', true); return; }
    try {
      const data = await api(encodeURIComponent(tournamentId));
      byId('tournament-title').textContent = data.title;
      document.title = data.title + ' · Registration';
      byId('game').textContent = data.gameTitle + ' · ' + data.platform;
      byId('format-rules').hidden = data.bracketMode !== 'FORTNITE';
      if(data.bracketMode === 'FORTNITE') byId('format-rules').textContent = `Fortnite: groups of up to ${data.fortniteLobbySize} participants plus an external VIP, and ${data.fortniteGamesPerRound} games per round. Random seats. Points: first 10, second 6, third 4, each kill 1 and eliminating the VIP 5 extra. Points accumulate within the round and reset on advancement. Tiebreakers: firsts, seconds, thirds, kills, VIP eliminations, then lowest assigned seat number. Qualification quotas are published when groups are drawn.`;
      const date = new Date(data.startsAt);
      byId('date').textContent = Number.isNaN(date.getTime()) ? 'Date to be confirmed' : date.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
      teamTournament = (data.teamSize || 1) > 1;
      byId('places').textContent = data.availablePlaces + ' of ' + data.maxParticipants + (teamTournament ? ' teams' : '');
      byId('team-fields').hidden = !teamTournament;
      byId('team-rules').textContent = data.teamSize + ' starters and up to ' + (data.reserveCount || 0) + ' reserves per team.';
      byId('solo-option').disabled = !data.allowSoloRegistration;
      byId('solo-option').hidden = !data.allowSoloRegistration;
      byId('reserve-option').disabled = !data.reserveCount;
      byId('reserve-option').hidden = !data.reserveCount;
      byId('registration-mode').querySelector('[value="TEAM_CREATE"]').disabled = data.availablePlaces === 0 && !data.waitlistEnabled;
      if (teamTournament && data.availablePlaces === 0 && !data.waitlistEnabled) byId('registration-mode').value = 'TEAM_JOIN';
      teamMode();
      byId('details').hidden = false;
      byId('availability').textContent = !data.open ? 'Registration is closed.' : data.availablePlaces === 0 ? (teamTournament ? 'No places remain for new teams. You can join an existing team using its code.' : 'The tournament is full.') : '';
      byId('registration').hidden = Boolean(token) || !data.open || (!teamTournament && !data.availablePlaces && !data.waitlistEnabled);
      if(data.open&&data.waitlistEnabled&&data.availablePlaces===0)byId('availability').textContent='This event is full. Verify your email to join the waitlist. A place will be assigned automatically when one becomes available, while registration remains open.';
      byId('deadline').textContent=data.registrationClosesAt?'Registration closes: '+new Date(data.registrationClosesAt).toLocaleString('en-US'):'';
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
    button.disabled = true; button.textContent = 'Sending link…';
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
    finally { button.disabled = false; button.textContent = 'Send verification link'; }
  });
  byId('confirm').addEventListener('click', async () => {
    const button = byId('confirm'); button.disabled = true; button.textContent = 'Confirming…';
    byId('message').hidden = true;
    try {
      const data = await api('confirm', { token });
      // Confirmation has committed. A failed refresh must not imply it failed.
      showStatus(data);
      history.replaceState(null, '', registrationUrl);
      try { showStatus(await api('status',{token})); }
      catch {
        message('The operation was saved, but some data could not be refreshed. Select Reload to view it.', true);
        byId('retry').hidden = false;
      }
    } catch (error) { message(error.message, true); }
    finally { button.disabled = false; button.textContent = 'Confirm registration'; }
  });
  function showStatus(data){
    byId('verification').hidden=true;byId('availability').hidden=true;byId('success').hidden=false;
    byId('success-heading').textContent=data.removed?'Registration removed by staff':data.cancelled?'Registration cancelled':data.waiting?'Waitlisted':'Registration confirmed';
    byId('success-text').textContent=data.nickname+' · '+data.title;
    byId('success-hint').textContent=data.removed?'You are no longer registered. Contact staff if you need clarification.':data.cancelled?'Your place has been released.':data.waiting?'We will email you if a place is assigned before registration closes.':data.kind==='TEAM_MEMBER'?(data.waitingForTeam?'You are on the solo player list. We will notify you when staff assigns you a team.':'Team: '+data.teamName+' · '+(data.role==='RESERVE'?'reserve':'starter')):'You are registered. Remember to confirm attendance if check-in is required.';
    byId('team-invite').hidden=!data.teamCode;if(data.teamCode)byId('invite-code').textContent=data.teamCode;
    byId('cancel').hidden=!data.canCancel||data.cancelled;
  }
  byId('recover').addEventListener('submit',async e=>{e.preventDefault();const b=byId('recover-button');b.disabled=true;try{message((await api(encodeURIComponent(tournamentId)+'/recover',{email:byId('recover-email').value.trim()})).message);}catch(e){message(e.message,true);}finally{b.disabled=false;}});
  byId('cancel').addEventListener('click',async()=>{if(!confirm('Cancel your registration? If you are captain, another team member will become captain.'))return;byId('cancel').disabled=true;try{showStatus(await api('cancel',{token}));}catch(e){message(e.message,true);}finally{byId('cancel').disabled=false;}});
  byId('retry').addEventListener('click', () => { byId('message').hidden = true; void load(); });
  byId('copy-invite').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(byId('invite-code').textContent); message('Code copied.'); }
    catch { message('You can select and copy the code above.'); }
  });
  // A mail link may reuse the registration tab and change only the fragment.
  window.addEventListener('hashchange', () => location.reload());
  void load();
})();
