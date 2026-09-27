(function () {
  const app = document.getElementById("app");
  const config = window.GTDisplayConfig || { backendUrl: window.location.origin };
  const TOKEN_KEY = "gt_manage_admin_token";
  const API_BASE = `${config.backendUrl}/api/manage`;
  const AUTH_BASE = `${config.backendUrl}/api/display-admin`;
  const MANAGE_USER_ID = "web_manage";

  const state = {
    token: localStorage.getItem(TOKEN_KEY) || "",
    tournaments: [],
    showArchived: false,
    selectedTournamentId: null,
    detail: null,
    loading: false,
    error: "",
    success: "",
    playerFilter: "",
    stationDrafts: {},
    smashCharacters: [],
    modal: null,
    characterPicker: null,
  };

  function setToken(token) {
    state.token = token || "";
    if (state.token) {
      localStorage.setItem(TOKEN_KEY, state.token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  async function api(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (state.token) {
      headers.set("Authorization", `Bearer ${state.token}`);
    }
    if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const json = await response.json();
        message = json.message || message;
      } catch (_) {}
      throw new Error(message);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function flash(message, type = "success") {
    state.success = type === "success" ? message : "";
    state.error = type === "error" ? message : "";
    render();
  }

  async function login(username, password) {
    const result = await api(`${AUTH_BASE}/login`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
      headers: { "Content-Type": "application/json" },
    });
    setToken(result.token);
    await loadInitialData();
  }

  async function loadInitialData() {
    state.loading = true;
    state.error = "";
    render();
    try {
      const [tournaments, characters] = await Promise.all([
        api(`${API_BASE}/tournaments?includeArchived=true`),
        api(`${API_BASE}/smash-characters`),
      ]);
      state.tournaments = tournaments.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
      state.smashCharacters = characters;
      state.selectedTournamentId = state.selectedTournamentId || state.tournaments[0]?.id || null;
      if (state.selectedTournamentId) {
        await loadTournamentDetail(state.selectedTournamentId, false);
      } else {
        state.detail = null;
      }
    } catch (error) {
      if (String(error.message || "").includes("401")) {
        setToken("");
        state.detail = null;
        state.tournaments = [];
      }
      state.error = error.message || "Could not load web management.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadTournamentDetail(tournamentId, keepMessage = true) {
    state.loading = true;
    if (!keepMessage) {
      state.success = "";
      state.error = "";
    }
    render();
    try {
      state.detail = await api(`${API_BASE}/tournaments/${tournamentId}`);
      state.selectedTournamentId = tournamentId;
    } catch (error) {
      state.error = error.message || "Could not load the tournament.";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function mutate(path, body, successMessage, tournamentId = state.selectedTournamentId) {
    if (state.loading) return false;
    state.loading = true;
    state.error = "";
    state.success = "";
    render();
    try {
      await api(`${API_BASE}${path}`, {
        method: "POST",
        body: body == null ? undefined : JSON.stringify(body),
      });
      if (tournamentId) {
        await loadTournamentDetail(tournamentId);
      } else {
        await loadInitialData();
      }
      flash(successMessage, "success");
      return true;
    } catch (error) {
      state.error = error.message || "Could not complete the action.";
      render();
      return false;
    } finally {
      state.loading = false;
      render();
    }
  }

  function getSelectedTournament() {
    return state.tournaments.find((item) => item.id === state.selectedTournamentId) || null;
  }

  function isStartggMirrored(tournament) {
    return tournament?.importSource?.provider === "START_GG";
  }

  function supportsSmashCharacterReporting(tournament) {
    return (tournament?.importSource?.entrantSize ?? 1) === 1 && /smash|ultimate/i.test(tournament?.gameTitle || "");
  }

  function winsNeeded(bestOf) {
    return Math.floor((bestOf || 1) / 2) + 1;
  }

  function effectiveBestOf(match) {
    return match?.reportedBestOf || match?.bestOf || 1;
  }

  function scoreOptions(match) {
    const target = winsNeeded(effectiveBestOf(match));
    const options = [];
    for (let loserScore = 0; loserScore < target; loserScore += 1) {
      for (const winner of match.participants) {
        const loser = match.participants.find((item) => item.participantId !== winner.participantId);
        if (!loser) continue;
        options.push({
          key: `${winner.participantId}:${target}-${loserScore}`,
          winnerParticipantId: winner.participantId,
          winnerScore: target,
          loserScore,
          label: `${winner.displayName} ${target}-${loserScore}`,
        });
      }
    }
    return options;
  }

  function buildDefaultGames(match, option, supportsCharacters) {
    const loserId = match.participants.find((item) => item.participantId !== option.winnerParticipantId)?.participantId || "";
    const games = [];
    for (let index = 0; index < option.loserScore; index += 1) {
      games.push({
        winnerParticipantId: loserId,
        selections: supportsCharacters ? defaultSelections(match) : [],
      });
    }
    for (let index = 0; index < option.winnerScore; index += 1) {
      games.push({
        winnerParticipantId: option.winnerParticipantId,
        selections: supportsCharacters ? defaultSelections(match) : [],
      });
    }
    return games;
  }

  function defaultSelections(match) {
    return match.participants.map((participant) => ({
      participantId: participant.participantId,
      characterName: "",
    }));
  }

  function openQuickReport(match) {
    if (state.loading) return;
    state.error = "";
    const tournament = state.detail?.tournament;
    const withCharacters = supportsSmashCharacterReporting(tournament);
    const options = scoreOptions(match);
    const selectedOption = options[0];
    state.modal = {
      type: "quick-report",
      matchId: match.id,
      scoreKey: selectedOption?.key || "",
      withCharacters,
      games: selectedOption ? buildDefaultGames(match, selectedOption, withCharacters) : [],
    };
    render();
  }

  function closeModal() {
    state.modal = null;
    state.characterPicker = null;
    render();
  }

  function updateModalGamesFromScore(scoreKey) {
    const match = currentModalMatch();
    if (!match) return;
    const option = scoreOptions(match).find((item) => item.key === scoreKey);
    if (!option) return;
    state.modal.scoreKey = scoreKey;
    state.modal.games = buildDefaultGames(match, option, state.modal.withCharacters);
    render();
  }

  function currentModalMatch() {
    if (!state.modal?.matchId) return null;
    return (state.detail?.matches || []).find((match) => match.id === state.modal.matchId) || null;
  }

  function updateGameWinner(index, participantId) {
    if (!state.modal) return;
    state.modal.games[index].winnerParticipantId = participantId;
    render();
  }

  function updateGameCharacter(index, participantId, characterName) {
    if (!state.modal) return;
    const selections = state.modal.games[index].selections || [];
    const selection = selections.find((item) => item.participantId === participantId);
    if (selection) {
      const previousCharacter = selection.characterName || "";
      selection.characterName = characterName;
      if (index === 0) {
        state.modal.games.forEach((game, gameIndex) => {
          if (gameIndex === 0) return;
          const gameSelection = (game.selections || []).find((item) => item.participantId === participantId);
          if (!gameSelection) return;
          if (!gameSelection.characterName || gameSelection.characterName === previousCharacter) {
            gameSelection.characterName = characterName;
          }
        });
      }
    }
    render();
  }

  function openCharacterPicker(gameIndex, participantId) {
    state.characterPicker = { gameIndex, participantId };
    render();
  }

  function closeCharacterPicker() {
    state.characterPicker = null;
    render();
  }

  function chooseCharacterFromPicker(characterName) {
    if (!state.characterPicker) return;
    updateGameCharacter(
      state.characterPicker.gameIndex,
      state.characterPicker.participantId,
      characterName,
    );
    state.characterPicker = null;
    render();
  }

  async function submitQuickReport() {
    if (state.loading) return;
    const tournamentId = state.selectedTournamentId;
    const match = currentModalMatch();
    if (!tournamentId || !match || !state.modal) return;
    const payload = {
      games: state.modal.games.map((game) => ({
        winnerParticipantId: game.winnerParticipantId,
        selections: state.modal.withCharacters ? game.selections : undefined,
      })),
    };
    if (state.modal.withCharacters) {
      for (const game of payload.games) {
        const hasBlank = (game.selections || []).some((item) => !item.characterName);
        if (hasBlank) {
          flash("Choose both characters in every game.", "error");
          return;
        }
      }
    }
    const draft = state.modal;
    const saved = await mutate(
      `/tournaments/${tournamentId}/matches/${match.id}/result-detailed`,
      payload,
      "Result recorded.",
    );
    if (saved && state.modal === draft) closeModal();
  }

  function filteredMatches(detail) {
    const query = state.playerFilter.trim().toLowerCase();
    return (detail?.matches || [])
      .filter((match) => match.status !== "COMPLETED" && match.status !== "WALKOVER" && match.status !== "CANCELLED")
      .filter((match) => {
        if (!query) return true;
        return match.participants.some((participant) => participant.displayName.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const statusWeight = { PLAYING: 0, CALLED: 1, PENDING: 2 };
        return (statusWeight[a.status] ?? 9) - (statusWeight[b.status] ?? 9)
          || a.roundNumber - b.roundNumber
          || a.matchNumber - b.matchNumber;
      });
  }

  function updateStationDraft(matchId, value) {
    state.stationDrafts[matchId] = value;
  }

  function matchTitle(match) {
    if (match.displayLabel) return match.displayLabel;
    const stage = match.bracketStage === "POOLS"
      ? (match.externalRef?.phaseGroupName || "Pool")
      : match.bracketStage === "WINNERS"
        ? "Winners"
        : match.bracketStage === "LOSERS"
          ? "Losers"
          : "Finals";
    return `${stage} R${match.roundNumber} · Match ${match.matchNumber}`;
  }

  function safeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;");
  }

  function renderLogin() {
    app.innerHTML = `
      <div class="login">
        <div class="panel stack">
          <div>
            <p class="eyebrow">Smash Tournaments</p>
            <h1 class="title">Web management</h1>
            <p class="muted">Designed for iPhone and quick use in Safari.</p>
          </div>
          ${state.error ? `<div class="notice error">${safeHtml(state.error)}</div>` : ""}
          <form id="login-form" class="stack">
            <div class="field">
              <label>Username</label>
              <input name="username" value="admin" autocomplete="username">
            </div>
            <div class="field">
              <label>Password</label>
              <input name="password" type="password" autocomplete="current-password">
            </div>
            <button class="btn primary" type="submit">Sign in</button>
          </form>
        </div>
      </div>
    `;
    document.getElementById("login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        await login(String(form.get("username") || ""), String(form.get("password") || ""));
      } catch (error) {
      state.error = error.message || "Could not sign in.";
        render();
      }
    });
  }

  function renderTournamentList() {
    return `
      <div class="toolbar" aria-label="Tournament list">
        <button class="btn ${state.showArchived?'secondary':'primary'}" data-archive-list="current">Current</button>
        <button class="btn ${state.showArchived?'primary':'secondary'}" data-archive-list="archived">Archived</button>
      </div>
      <div class="list">
        ${state.tournaments.filter(t=>(t.status==='ARCHIVED')===state.showArchived).map((tournament) => `
          <button class="tournament-card" data-open-tournament="${safeHtml(tournament.id)}">
            <div class="row between">
              <div class="stack" style="align-items:flex-start;">
                <p class="eyebrow">${safeHtml(tournament.gameTitle)}</p>
                <h2 class="card-title">${safeHtml(tournament.title)}</h2>
              </div>
              <span class="chip">${safeHtml(tournament.status==='ARCHIVED'?'Archived':tournament.status)}</span>
            </div>
            <div class="chips">
              <span class="chip">${safeHtml(new Date(tournament.startsAt).toLocaleString())}</span>
              ${isStartggMirrored(tournament) ? '<span class="chip">start.gg</span>' : ""}
            </div>
          </button>
        `).join("") || '<div class="empty">There are no tournaments on this server.</div>'}
      </div>
    `;
  }

  function renderLadder(detail) { return window.GTLadderPanel.render(detail); }

  function renderArchivedResults(detail) {
    const final=detail.fortnite?.rounds.find(round=>round.final&&round.closed);
    if(final) {
      const names=new Map(detail.participants.map(player=>[player.id,player.displayName]));
      return `<section class="panel"><h3>Final standings</h3>${final.groups[0].standings.map(row=>`<p>${row.rank}. ${safeHtml(names.get(row.participantId)||'Player')} · ${row.points} points${row.excluded?' · '+safeHtml(row.excluded):''}</p>`).join('')}</section>`;
    }
    const matches=detail.matches.filter(match=>['COMPLETED','WALKOVER'].includes(match.status));
    return `<section class="panel"><h3>Results</h3>${matches.map(match=>`<p>${safeHtml(matchTitle(match))} · ${match.participants.map(player=>`${safeHtml(player.displayName)} ${Number(player.score)||0}`).join(' — ')}</p>`).join('')||'<p>No matches are available.</p>'}</section>`;
  }

  function renderDetail() {
    const detail = state.detail;
    if (!detail) {
      return `<div class="empty">Select a tournament to begin.</div>`;
    }
    const tournament = detail.tournament;
    if(tournament.status==='ARCHIVED')return `<div class="stack">
      <button class="btn secondary" data-back="1">Back to list</button>
      <h2>${safeHtml(tournament.title)}</h2><p>Archived · read-only. This tournament is hidden from the display.</p>
      <button class="btn primary" data-archive="false" ${state.loading?'disabled':''}>Unarchive tournament</button>
      ${tournament.settings?.bracketMode==='FORTNITE'?'<button class="btn secondary" data-open-panel="fortnite/session">View Fortnite results</button>':''}
      <section class="panel"><h3>Participants</h3>${detail.participants.map(p=>`<p>${safeHtml(p.displayName)}</p>`).join('')}</section>
      ${renderArchivedResults(detail)}
    </div>`;
    const matches = filteredMatches(detail);
    return `
      <div class="stack">
        <div class="row between">
          <div class="stack" style="gap:6px;">
            <button class="btn secondary small" data-back="1">Back</button>
            <h2 class="title" style="font-size:1.7rem">${safeHtml(tournament.title)}</h2>
            <div class="chips">
              <span class="chip">${safeHtml(tournament.gameTitle)}</span>
              <span class="chip">${safeHtml(tournament.status)}</span>
              ${isStartggMirrored(tournament) ? '<span class="chip">start.gg</span>' : ""}
            </div>
          </div>
          <div class="toolbar">
            <button class="btn secondary small" data-refresh="1">Refresh</button>
            ${tournament.settings?.bracketMode !== "FORTNITE" && (tournament.status === "DRAFT" || tournament.status === "READY")
              ? '<button class="btn primary small" data-start-tournament="1">Start tournament</button>'
              : ""}
            ${isStartggMirrored(tournament)
              ? '<button class="btn secondary small" data-reimport="1">Reimport bracket</button>'
              : ""}
          </div>
        </div>

        <section class="panel stack">
          <h3 class="section-title">Registration and results</h3><div class="toolbar">
          ${!isStartggMirrored(tournament) ? `<button class="btn secondary" data-open-panel="registration-admin/session">Registration, waitlist and teams</button>` : ''}<button class="btn secondary" data-display-toggle="1">${tournament.settings?.displayEnabled === false ? 'Show on display' : 'Hide from display'}</button>
          ${tournament.settings?.bracketMode === 'FORTNITE' ? '<button class="btn primary" data-open-panel="fortnite/session">Fortnite groups and scores</button>' : ''}
          ${tournament.status === 'COMPLETED' ? '<button class="btn primary" data-open-panel="top8-session">Create results poster</button><button class="btn secondary" data-archive="true">Archive tournament</button>' : ''}
          </div><p class="muted">Registration changes and score sheets are saved on the server.</p>
        </section>
        <form class="panel stack" data-resources-form>
          <h3 class="section-title">Setups and streams</h3>
          <div class="row wrap">
            <div class="field"><label for="setup-count">Regular setups</label><input id="setup-count" type="number" min="1" max="256" required value="${Number(tournament.settings?.setupCount) || 1}"></div>
            <div class="field"><label for="stream-count">Stream</label><select id="stream-count">
              ${[0,1,2].map(count => `<option value="${count}" ${count === (tournament.settings?.streamCount || 0) ? "selected" : ""}>${count ? count + (count === 1 ? " stream" : " streams") : "No stream"}</option>`).join("")}
            </select></div>
            <button class="btn secondary small" type="submit" ${state.loading ? "disabled" : ""}>Save setups and streams</button>
          </div>
          <p class="muted">Streams are separate destinations from setups. start.gg stream marks are informational.</p>
        </form>
        ${renderLadder(detail)}

        <div class="panel stack">
          <div class="row between">
            <h3 class="section-title">Match operations</h3>
            <div class="field" style="min-width:220px;">
              <input id="player-filter" placeholder="Search by player" value="${safeHtml(state.playerFilter)}">
            </div>
          </div>
          ${matches.length ? matches.map((match) => renderMatchCard(tournament, match)).join("") : '<div class="empty">No pending matches match this filter.</div>'}
        </div>
      </div>
    `;
  }

  function normalizedStation(value) {
    const label = String(value || "").trim();
    const setup = /^(?:setup\s*)?#?(\d+)$/i.exec(label);
    const stream = /^stream\s*(\d+)$/i.exec(label);
    return stream ? `Stream ${Number(stream[1])}` : setup ? `Setup ${Number(setup[1])}` : label;
  }

  function stationOptions(tournament, match, selected) {
    const labels = [...Array.from({length: Math.max(1, tournament.settings?.setupCount || 1)}, (_, i) => `Setup ${i+1}`),
      ...Array.from({length: Math.min(2, tournament.settings?.streamCount || 0)}, (_, i) => `Stream ${i+1}`)];
    const current = normalizedStation(selected);
    return '<option value="">No station</option>' + labels.map(label => {
      const occupied = (state.detail?.matches || []).some(other => other.id !== match.id
        && ["CALLED", "CHECKED_IN", "PLAYING", "RESULT_REPORTED", "UNDER_REVIEW"].includes(other.status)
        && normalizedStation(other.call?.stationLabel) === label);
      return `<option value="${safeHtml(label)}" ${current === label ? "selected" : ""} ${occupied ? "disabled" : ""}>${safeHtml(label)}${occupied ? " · Occupied" : ""}</option>`;
    }).join("");
  }

  function renderMatchCard(tournament, match) {
    const stationValue = state.stationDrafts[match.id] ?? match.call?.stationLabel ?? "";
    const withQuickReport = isStartggMirrored(tournament);
    return `
      <div class="match-card stack">
        <div class="row between">
          <div class="stack" style="gap:4px;">
            <div class="eyebrow">${safeHtml(matchTitle(match))}</div>
            <div class="status">${safeHtml(match.status)} · Bo${effectiveBestOf(match)}</div>
          </div>
          <div class="chips">
            ${match.call?.stationLabel ? `<span class="chip">Station ${safeHtml(match.call.stationLabel)}</span>` : ""}
          </div>
        </div>
        <div class="players">
          ${match.participants.map((participant) => `
            <div class="player-pill">
              <span>${safeHtml(participant.displayName)}</span>
              <strong>${participant.score ?? 0}</strong>
            </div>
          `).join("")}
        </div>
        <div class="field">
          <label>Destination</label>
          <select aria-label="Match destination" data-station-input="${safeHtml(match.id)}">${stationOptions(tournament, match, stationValue)}</select>
        </div>
        <div class="toolbar">
          <button class="btn secondary small" data-call="${safeHtml(match.id)}">Call</button>
          <button class="btn secondary small" data-start-match="${safeHtml(match.id)}">Start</button>
          <button class="btn secondary small" data-cancel-call="${safeHtml(match.id)}">Cancel</button>
          <button class="btn warn small" data-reset-match="${safeHtml(match.id)}">Reset set</button>
          ${withQuickReport ? `<button class="btn primary small" data-quick-report="${safeHtml(match.id)}">Quick report</button>` : ""}
        </div>
      </div>
    `;
  }

  function renderModal() {
    if (!state.modal) return "";
    const match = currentModalMatch();
    if (!match) return "";
    const options = scoreOptions(match);
    return `
      <div class="modal-backdrop" data-close-modal="1">
        <div class="modal stack" onclick="event.stopPropagation()">
          <div class="row between">
            <h3 class="section-title">Quick report</h3>
            <button class="btn secondary small" data-close-modal="1">Close</button>
          </div>
          <p class="muted modal-copy">Prepare the final result, review each game and submit everything together.</p>
          ${state.error ? `<div class="notice error" role="alert">${safeHtml(state.error)}</div>` : ""}
          <div class="stack modal-section">
            <div class="section-caption">Final result</div>
            <div class="score-options">
              ${options.map((option) => `
                <button
                  class="score-pill ${option.key === state.modal.scoreKey ? "selected" : ""}"
                  data-score-option="${safeHtml(option.key)}"
                  type="button"
                >
                  ${safeHtml(option.label)}
                </button>
              `).join("")}
            </div>
          </div>
          <div class="stack modal-section">
            <div class="section-caption">Game summary</div>
            <div class="games-list">
            ${state.modal.games.map((game, index) => `
              <div class="game-row stack">
                <div class="row between wrap">
                  <strong>Game ${index + 1}</strong>
                  <div class="winner-toggle-group">
                    ${match.participants.map((participant) => `
                      <button
                        class="winner-toggle ${participant.participantId === game.winnerParticipantId ? "selected" : ""}"
                        data-game-winner="${index}"
                        data-winner-participant="${safeHtml(participant.participantId)}"
                        type="button"
                      >
                        ${safeHtml(participant.displayName)}
                      </button>
                    `).join("")}
                  </div>
                </div>
                ${state.modal.withCharacters ? match.participants.map((participant) => `
                  <div class="field quick-character-field">
                    <label>${safeHtml(participant.displayName)}</label>
                    <button
                      class="character-picker-trigger ${(game.selections || []).find((item) => item.participantId === participant.participantId)?.characterName ? "filled" : ""}"
                      data-open-character-picker="${index}:${safeHtml(participant.participantId)}"
                      type="button"
                    >
                      ${safeHtml((game.selections || []).find((item) => item.participantId === participant.participantId)?.characterName || "Choose character")}
                    </button>
                  </div>
                `).join("") : ""}
              </div>
            `).join("")}
            </div>
          </div>
          <div class="sticky-actions">
            <div class="toolbar">
              <button class="btn secondary" data-close-modal="1">Cancel</button>
              <button class="btn primary" data-submit-quick-report="1">${state.loading ? "Saving…" : "Report result"}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCharacterPicker() {
    if (!state.characterPicker) return "";
    const match = currentModalMatch();
    if (!match) return "";
    const participant = match.participants.find((item) => item.participantId === state.characterPicker.participantId);
    return `
      <div class="modal-backdrop modal-backdrop-top" data-close-character-picker="1">
        <div class="modal character-picker-modal stack" onclick="event.stopPropagation()">
          <div class="row between">
            <h3 class="section-title">Choose character</h3>
            <button class="btn secondary small" data-close-character-picker="1">Close</button>
          </div>
          <p class="muted modal-copy">${safeHtml(participant?.displayName || "")}</p>
          <div class="field">
            <label>Search</label>
            <input id="character-search" placeholder="Filter characters">
          </div>
          <div class="character-picker-list" id="character-picker-list">
            ${state.smashCharacters.map((character) => `
              <button
                class="character-picker-option"
                data-character-option="${safeHtml(character.name)}"
                data-character-name="${safeHtml(character.name.toLowerCase())}"
                type="button"
              >
                ${safeHtml(character.name)}
              </button>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderShell() {
    app.innerHTML = `
      <div class="page">
        ${state.error ? `<div class="notice error">${safeHtml(state.error)}</div>` : ""}
        ${state.success ? `<div class="notice success">${safeHtml(state.success)}</div>` : ""}
        <div class="shell-header">
          <div>
            <p class="eyebrow">Smash Tournaments - Web management</p>
            <h1 class="title">Tournaments</h1>
          </div>
          <div class="toolbar">
            <a class="btn secondary small" href="/account/">My account and users</a><button class="btn secondary small" data-logout="1">Sign out</button>
          </div>
        </div>
        ${state.selectedTournamentId ? renderDetail() : renderTournamentList()}
      </div>
      ${renderModal()}
      ${renderCharacterPicker()}
    `;
    if (state.loading) {
      app.querySelectorAll(".modal button, .modal input, .modal select").forEach((control) => { control.disabled = true; });
    }
    bindShellEvents();
  }

  function bindShellEvents() {
    document.querySelectorAll('[data-archive-list]').forEach(button=>button.addEventListener('click',()=>{state.showArchived=button.dataset.archiveList==='archived';render();}));
    document.querySelector('[data-archive]')?.addEventListener('click',async event=>{
      if(state.loading)return;const archived=event.currentTarget.dataset.archive==='true';
      if(!confirm(archived?'It will move to Archived, become read-only and disappear from the display. Archive?':'It will return to Completed. The display remains disabled until you enable it. Unarchive?'))return;
      await mutate('/tournaments/'+encodeURIComponent(state.selectedTournamentId)+'/archive',{archived},archived?'Tournament archived':'Tournament unarchived');
      if(state.detail?.tournament){const current=state.detail.tournament;state.tournaments=state.tournaments.map(t=>t.id===current.id?current:t);}
      render();
    });
    document.querySelectorAll('[data-open-panel]').forEach(button => button.addEventListener('click',async()=>{
      if(state.loading)return;button.disabled=true;
      try{
        const result=await api(API_BASE+'/tournaments/'+encodeURIComponent(state.selectedTournamentId)+'/'+button.dataset.openPanel,{method:'POST',body:'{}'});
        const url=new URL(result.url);if(url.origin!==new URL(config.backendUrl).origin)throw Error('The panel has an invalid destination');
        window.location.assign(url.href);
      }catch(error){flash(error.message||'Could not open the panel','error');}finally{button.disabled=false;}
    }));
    document.querySelector('[data-display-toggle]')?.addEventListener('click',()=>{
      if(state.loading)return;
      mutate('/tournaments/'+encodeURIComponent(state.selectedTournamentId)+'/public-options',{displayEnabled:state.detail.tournament.settings?.displayEnabled===false},'Visibility updated.');
    });
    document.querySelectorAll("[data-open-tournament]").forEach((node) => {
      node.addEventListener("click", () => loadTournamentDetail(node.getAttribute("data-open-tournament")));
    });
    document.querySelectorAll("[data-back]").forEach((node) => {
      node.addEventListener("click", () => {
        state.selectedTournamentId = null;
        state.detail = null;
        render();
      });
    });
    document.querySelectorAll("[data-refresh]").forEach((node) => {
      node.addEventListener("click", () => loadTournamentDetail(state.selectedTournamentId));
    });
    document.querySelectorAll("[data-logout]").forEach((node) => {
      node.addEventListener("click", () => {
        void api(`${config.backendUrl}/api/management-auth/logout`, {method:"POST",body:"{}"}).catch(()=>{});
        setToken("");
        state.detail = null;
        state.tournaments = [];
        render();
      });
    });
    document.querySelector("[data-resources-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      if (state.loading || !event.currentTarget.reportValidity()) return;
      const setupCount = Number(document.getElementById("setup-count").value);
      const streamCount = Number(document.getElementById("stream-count").value);
      mutate(`/tournaments/${state.selectedTournamentId}/setups`, { setupCount, streamCount }, "Setups and streams saved.");
    });
    const filterInput = document.getElementById("player-filter");
    if (filterInput) {
      filterInput.addEventListener("input", (event) => {
        state.playerFilter = event.target.value;
        render();
      });
    }
    document.querySelectorAll("[data-station-input]").forEach((node) => {
      node.addEventListener("input", (event) => updateStationDraft(node.getAttribute("data-station-input"), event.target.value));
    });
    document.querySelectorAll("[data-start-tournament]").forEach((node) => {
      node.addEventListener("click", () => mutate(`/tournaments/${state.selectedTournamentId}/start`, {}, "Tournament started."));
    });
    document.querySelectorAll("[data-reimport]").forEach((node) => {
      node.addEventListener("click", () => {
        const tournament = getSelectedTournament();
        mutate(
          `/tournaments/${state.selectedTournamentId}/import/startgg`,
          { eventUrl: tournament.importSource.eventUrl, syncResults: true, preserveTournamentTitle: false },
          "Bracket reimportada.",
        );
      });
    });
    window.GTLadderPanel.bind(state.detail, input => mutate(`/tournaments/${state.selectedTournamentId}/ladder/control`, input, "Ladder updated."));
    document.querySelectorAll("[data-ladder-start]").forEach((node) => {
      node.addEventListener("click", () => mutate(`/tournaments/${state.selectedTournamentId}/ladder/start`, { startedByUserId: MANAGE_USER_ID }, "Ladder enabled."));
    });
    document.querySelectorAll("[data-ladder-finalize]").forEach((node) => {
      node.addEventListener("click", () => mutate(`/tournaments/${state.selectedTournamentId}/ladder/finalize`, { completedByUserId: MANAGE_USER_ID }, "Registration closed; open sets may finish."));
    });
    document.querySelectorAll("[data-call]").forEach((node) => {
      node.addEventListener("click", () => {
        const matchId = node.getAttribute("data-call");
        mutate(
          `/tournaments/${state.selectedTournamentId}/matches/${matchId}/call`,
          { calledByUserId: MANAGE_USER_ID, stationLabel: [...document.querySelectorAll("[data-station-input]")].find(input => input.getAttribute("data-station-input") === matchId)?.value || undefined },
          "Match llamado.",
        );
      });
    });
    document.querySelectorAll("[data-start-match]").forEach((node) => {
      node.addEventListener("click", () => mutate(`/tournaments/${state.selectedTournamentId}/matches/${node.getAttribute("data-start-match")}/start`, { startedByUserId: MANAGE_USER_ID }, "Match started."));
    });
    document.querySelectorAll("[data-cancel-call]").forEach((node) => {
      node.addEventListener("click", () => mutate(`/tournaments/${state.selectedTournamentId}/matches/${node.getAttribute("data-cancel-call")}/cancel-call`, {}, "Call cancelled."));
    });
    document.querySelectorAll("[data-reset-match]").forEach((node) => {
      node.addEventListener("click", () => mutate(`/tournaments/${state.selectedTournamentId}/matches/${node.getAttribute("data-reset-match")}/reset`, {}, "Match reseteado."));
    });
    document.querySelectorAll("[data-quick-report]").forEach((node) => {
      node.addEventListener("click", () => {
        const match = (state.detail?.matches || []).find((item) => item.id === node.getAttribute("data-quick-report"));
        if (match) openQuickReport(match);
      });
    });
    document.querySelectorAll("[data-close-modal]").forEach((node) => {
      node.addEventListener("click", closeModal);
    });
    document.querySelectorAll("[data-score-option]").forEach((node) => {
      node.addEventListener("click", () => updateModalGamesFromScore(node.getAttribute("data-score-option")));
    });
    document.querySelectorAll("[data-game-winner]").forEach((node) => {
      node.addEventListener("click", () => updateGameWinner(
        Number(node.getAttribute("data-game-winner")),
        node.getAttribute("data-winner-participant"),
      ));
    });
    document.querySelectorAll("[data-open-character-picker]").forEach((node) => {
      node.addEventListener("click", () => {
        const [index, participantId] = node.getAttribute("data-open-character-picker").split(":");
        openCharacterPicker(Number(index), participantId);
      });
    });
    document.querySelectorAll("[data-submit-quick-report]").forEach((node) => {
      node.addEventListener("click", submitQuickReport);
    });
    document.querySelectorAll("[data-close-character-picker]").forEach((node) => {
      node.addEventListener("click", closeCharacterPicker);
    });
    document.querySelectorAll("[data-character-option]").forEach((node) => {
      node.addEventListener("click", () => chooseCharacterFromPicker(node.getAttribute("data-character-option")));
    });
    const characterSearch = document.getElementById("character-search");
    if (characterSearch) {
      characterSearch.focus();
      characterSearch.addEventListener("input", (event) => {
        const query = String(event.target.value || "").trim().toLowerCase();
        document.querySelectorAll("[data-character-option]").forEach((node) => {
          const name = node.getAttribute("data-character-name") || "";
          node.style.display = !query || name.includes(query) ? "" : "none";
        });
      });
    }
  }

  function render() {
    if (!state.token) {
      renderLogin();
      return;
    }
    renderShell();
  }

  if (state.token) {
    loadInitialData();
  } else {
    render();
  }
})();
