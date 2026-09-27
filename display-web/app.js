(function () {
  const config = window.GTDisplayConfig;
  const core = window.GTDisplayCore;
  const isPreview = new URLSearchParams(location.search).get("preview") === "1";
  let previewSettings = null;
  function preferences() {
    return window.GTDisplaySettings.normalize({ ...remoteDisplayConfig?.displaySettings, ...controls?.settings, ...previewSettings });
  }
  let controls;
  let sceneTimer;
  let sceneCycle = 0;
  let lastRotationKey = null;
  let refreshTimer;
  let refreshBusy = false;
  let activeEntry = null;
  let renderGeneration = 0;
  let lastRenderedSignature = "";
  let configSignature = "";
  let lastConfigAttempt = 0;
  let lastSuccessfulRefresh = 0;
  let refreshFailures = 0;
  let failedTournamentIds = new Set();
  let connectionBadge;
  let activeCall = null;
  let activeToast = null;
  let toastTimer;
  let displayScale = 1;
  const app = document.getElementById("app");
  const themeMedia = window.GTThemeMedia.create(app);
  function renderScreen(html) { themeMedia.render(html, renderThemeArt("background")); }
  const sceneQueue = [];
  const callNotificationQueue = [];
  let callAudio = null;
  let callAudioUrl = null;
  let audioUnlocked = false;
  let audioMuted = true;
  let audioControlButton = null;
  let sponsorLogos = [];
  let themeManifest = { default: null, themes: [] };
  let loadedThemeFiles = new Map();
  let activeTheme = { cssVars: {}, assets: {} };
  let remoteDisplayConfig = null;
  let callToastVisible = false;
  let currentState = { tournaments: [], matchesByTournament: new Map() };
  const announcedResultFingerprintsByTournament = new Map();
  const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".ogv", ".mov", ".m4v"];
  const SMASH_ICON_BASE_PATH = new URL("./assets/smash-stock-icons/", window.location.href).toString().replace(/\/$/, "");
  const ROA2_ICON_BASE_PATH = new URL("./assets/roa2-stock-icons/", window.location.href).toString().replace(/\/$/, "");
  const SMASH_CHARACTER_ICON_MAP = {
    "Bowser Jr.": "bowser_jr",
    "Captain Falcon": "captain_falcon",
    "Dark Pit": "dark_pit",
    "Dark Samus": "dark_samus",
    "Diddy Kong": "diddy_kong",
    "Donkey Kong": "donkey_kong",
    "Dr. Mario": "dr_mario",
    "Duck Hunt": "duck_hunt",
    "Ice Climbers": "ice_climbers",
    "King Dedede": "king_dedede",
    "King K. Rool": "king_k_rool",
    "Little Mac": "little_mac",
    "Mega Man": "mega_man",
    "Meta Knight": "meta_knight",
    "Mr. Game & Watch": "mr_game_and_watch",
    "Pac-Man": "pac_man",
    "Pokemon Trainer": "pokemon_trainer",
    "Pyra & Mythra": "pyra",
    "R.O.B.": "rob",
    "Rosalina": "rosalina_and_luma",
    "Simon Belmont": "simon",
    "Toon Link": "toon_link",
    "Wii Fit Trainer": "wii_fit_trainer",
    "Young Link": "young_link",
    "Zero Suit Samus": "zero_suit_samus",
    "Banjo-Kazooie": "banjo_kazooie",
    "Mii Brawler": "mii_fighter",
    "Mii Swordfighter": "mii_fighter",
    "Mii Gunner": "mii_gunner",
    "Piranha Plant": "piranha_plant",
    "Random": "",
    "Random Character": ""
  };
  const ROA2_CHARACTER_ICON_MAP = {
    "Zetterburn": "zetterburn",
    "Orcane": "orcane",
    "Wrastor": "wrastor",
    "Kragg": "kragg",
    "Forsburn": "forsburn",
    "Maypul": "maypul",
    "Absa": "absa",
    "Etalus": "etalus",
    "Ranno": "ranno",
    "Clairen": "clairen",
    "Olympia": "olympia",
    "Fleet": "fleet",
    "Loxodont": "loxodont",
    "Galvan": "galvan",
    "La Reina": "la_reina",
    "Slade": "slade",
    "Random": "",
    "Random Character": ""
  };

  function renderTemplate(template, values) {
    return String(template || "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_full, key) => String(values[key] ?? ""));
  }

  function popupTemplateValues(tournament, match) {
    const timeoutMinutes =
      tournament.settings?.callTimeoutMinutes ||
      tournament.callTimeoutMinutes ||
      config.defaultCallTimeoutMinutes ||
      10;
    const setupLabel = match.call?.stationLabel?.trim() || "?";
    const playAreaName = tournament.settings?.playAreaName?.trim() || "";
    return {
      tournament_title: tournament.title,
      tournament_game: tournament.gameTitle,
      players_vs: (match.participants || []).map((participant) => participant.displayName).join(" vs "),
      station_label: playAreaName ? `${setupLabel} · ${playAreaName}` : setupLabel,
      setup_label: setupLabel,
      play_area_name: playAreaName,
      timeout_minutes: timeoutMinutes,
    };
  }

  function isActiveTournament(detail) {
    return (detail.matches.length > 0 || detail.tournament.settings?.bracketMode === "FORTNITE") && !["DRAFT", "CANCELLED"].includes(detail.tournament.status);
  }

  function normalizeStatus(status) {
    return ({ PENDING: "Pendiente", CALLED: "Llamado", CHECKED_IN: "Preparados", PLAYING: "Jugando", UNDER_REVIEW: "En revisión", COMPLETED: "Finalizado", WALKOVER: "DQ", IN_PROGRESS: "En curso", DRAFT: "Borrador", REGISTRATION_OPEN: "Inscripción abierta", REGISTRATION_CLOSED: "Inscripción cerrada", CANCELLED: "Cancelado" })[status] || String(status || "").replaceAll("_", " ");
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function safeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeCharacterSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s&.-]/g, "")
      .replace(/\s+/g, " ")
      .replace(/&/g, "and")
      .replace(/[.\-]/g, " ")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function isSmashTitle(gameTitle) {
    const normalized = String(gameTitle || "").trim().toLowerCase();
    return normalized.includes("smash")
      || normalized.includes("ultimate")
      || normalized.includes("ssbu")
      || normalized.includes("super smash bros");
  }

  function isRoa2Title(gameTitle) {
    const normalized = String(gameTitle || "").trim().toLowerCase();
    return normalized.includes("roa 2")
      || normalized.includes("roa2")
      || normalized.includes("roa ii")
      || normalized.includes("rivals of aether 2")
      || normalized.includes("rivals of aether ii")
      || normalized.includes("rivals 2")
      || normalized.includes("rivals ii");
  }

  function supportsBracketCharacterIcons(tournament) {
    return isSmashTitle(tournament?.gameTitle) || isRoa2Title(tournament?.gameTitle);
  }

  function resolveCharacterIconUrl(gameTitle, characterName) {
    if (!characterName) return "";
    const trimmedCharacterName = String(characterName).trim();
    if (isRoa2Title(gameTitle)) {
      const explicit = ROA2_CHARACTER_ICON_MAP[trimmedCharacterName];
      const resource = explicit !== undefined ? explicit : normalizeCharacterSlug(trimmedCharacterName);
      if (!resource) return "";
      return `${ROA2_ICON_BASE_PATH}/${resource}.png`;
    }
    if (!isSmashTitle(gameTitle)) return "";
    const explicit = SMASH_CHARACTER_ICON_MAP[trimmedCharacterName];
    const resource = explicit !== undefined ? explicit : normalizeCharacterSlug(characterName);
    if (!resource) return "";
    return `${SMASH_ICON_BASE_PATH}/${resource}.png`;
  }

  function renderCharacterIcons(tournament, match, participantId, className) {
    if (!preferences().showCharacters) return "";
    if (!supportsBracketCharacterIcons(tournament) || match.status === "WALKOVER") return "";
    const characters = core.characters(match, participantId);
    return characters.length ? `<span class="team-character-icons">${characters.map(name => {
      const url = resolveCharacterIconUrl(tournament.gameTitle, name);
      return url ? `<img class="${className}" src="${safeHtml(url)}" alt="${safeHtml(name)}" title="${safeHtml(name)}">` : "";
    }).join("")}</span>` : "";
  }

  function matchDisplayLabel(match) {
    const identifier = match.displayIdentifier || matchExternalRef(match).identifier || `M${match.matchNumber}`;
  return identifier + (match.startggStreamLabel || matchExternalRef(match).stream ? " · Stream gg" : "");
  }

  function matchRoundLabel(match) {
    return match.roundLabel || matchExternalRef(match).fullRoundText || stageTitle(match.bracketStage, match.roundNumber, 0);
  }

  function isPlaceholderParticipantId(participantId) {
    const value = String(participantId || "");
    return value.startsWith("winner_of_")
      || value.startsWith("loser_of_")
      || value.startsWith("advance_")
      || value.startsWith("drop_");
  }

  function sourceMatchIdFromPlaceholder(participantId) {
    const value = String(participantId || "");
    if (value.startsWith("winner_of_")) return value.slice("winner_of_".length);
    if (value.startsWith("loser_of_")) return value.slice("loser_of_".length);
    const advanceMatch = value.match(/^advance_\d+_of_(.+)$/);
    if (advanceMatch) return advanceMatch[1];
    const dropMatch = value.match(/^drop_\d+_of_(.+)$/);
    if (dropMatch) return dropMatch[1];
    return "";
  }

  function feedsParticipantFromMatch(match, participantId) {
    if (!participantId) return false;
    const advancers = Array.isArray(match.advancingParticipantIds)
      ? match.advancingParticipantIds.filter(Boolean)
      : [];
    if (advancers.includes(participantId)) return true;
    if (match.winnerParticipantId && match.winnerParticipantId === participantId) return true;
    return Array.isArray(match.participants)
      && match.participants.some((participant) => participant.participantId === participantId);
  }

  function sourceMatchIdsForMatch(match, candidateMatches = []) {
    if (String(matchExternalRef(match).phaseType || "").trim().toUpperCase() === "ROUND_ROBIN") {
      return [];
    }
    const sourceIds = new Set();
    (match.participants || []).forEach((participant) => {
      const sourceId = sourceMatchIdFromPlaceholder(participant.participantId);
      if (sourceId) {
        sourceIds.add(sourceId);
      }
    });
    const targetIndex = candidateMatches.findIndex((candidate) => candidate.id === match.id);
    const earlierMatches = targetIndex >= 0
      ? candidateMatches.slice(0, targetIndex)
      : candidateMatches.filter((candidate) => candidate.id !== match.id);
    (match.participants || []).forEach((participant) => {
      const participantId = String(participant?.participantId || "").trim();
      if (!participantId || isPlaceholderParticipantId(participantId)) return;
      const sourceMatch = [...earlierMatches]
        .reverse()
        .find((candidate) => feedsParticipantFromMatch(candidate, participantId));
      if (sourceMatch?.id) {
        sourceIds.add(sourceMatch.id);
      }
    });
    return Array.from(sourceIds);
  }

  function resolveThemeAssetUrl(value) {
    if (!value) return "";
    if (/^([a-z]+:)?\/\//i.test(String(value)) || String(value).startsWith("data:") || String(value).startsWith("blob:")) {
      return value;
    }
    return `${config.backendUrl}${value}`;
  }

  function isVideoAsset(value) {
    const normalized = String(value || "").split("#")[0].split("?")[0].toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => normalized.endsWith(ext));
  }

  function stageTitle(stage, round, totalRounds) {
    if (stage === "POOLS") return `Pools Round ${round}`;
    const prefix = stage === "LOSERS" ? "Losers" : stage === "FINALS" ? "Grand Final" : "Winners";
    if (stage === "FINALS") return prefix;
    if (stage === "WINNERS" && round === totalRounds && totalRounds > 1) return `${prefix} Final`;
    if (stage === "WINNERS" && round === totalRounds - 1 && totalRounds > 2) return `${prefix} Semifinal`;
    return `${prefix} Round ${round}`;
  }

  function isMarioKartMatch(match, tournament) {
    return tournament?.settings?.bracketMode === "MKART" || match.advancersRequired > 1 || (match.participants || []).length > 2;
  }

  function effectiveBestOf(match) {
    const value = Number(match.reportedBestOf ?? match.bestOf ?? 1);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
  }

  function bestOfLabel(match) {
    return `Bo${effectiveBestOf(match)}`;
  }

  function isAutomaticAdvanceDisplayMatch(match) {
    if (match.status !== "COMPLETED") return false;
    if (match.call?.calledAt || match.call?.startedAt) return false;
    if ((match.characterSelections || []).length > 0) return false;
    const participants = match.participants || [];
    if (participants.length === 0 || participants.length > (match.advancersRequired || 1)) return false;

    const advancedIds = new Set(match.advancingParticipantIds || []);
    if (match.winnerParticipantId) advancedIds.add(match.winnerParticipantId);
    if (advancedIds.size === 0) return false;

    return participants.every((participant) =>
      (participant.score || 0) === (advancedIds.has(participant.participantId) ? 1 : 0)
    );
  }

  function updateAudioControl() {
    if (!audioControlButton) return;
    if (!callAudioUrl) {
      audioControlButton.textContent = "Sin sonido";
      audioControlButton.disabled = true;
      audioControlButton.classList.add("is-disabled");
      audioControlButton.classList.remove("is-active", "is-muted");
      return;
    }

    audioControlButton.disabled = false;
    audioControlButton.classList.remove("is-disabled");
    if (!audioUnlocked) {
      audioControlButton.textContent = "Activar sonido";
      audioControlButton.classList.remove("is-active", "is-muted");
      return;
    }

    if (audioMuted) {
      audioControlButton.textContent = "Quitar mute";
      audioControlButton.classList.add("is-muted");
      audioControlButton.classList.remove("is-active");
      return;
    }

    audioControlButton.textContent = "Mutear sonido";
    audioControlButton.classList.add("is-active");
    audioControlButton.classList.remove("is-muted");
  }

  async function unlockAudio() {
    if (!callAudio) return;
    try {
      callAudio.pause();
      callAudio.muted = true;
      callAudio.currentTime = 0;
      const playAttempt = callAudio.play();
      if (playAttempt && typeof playAttempt.then === "function") {
        await playAttempt;
      }
      callAudio.pause();
      callAudio.currentTime = 0;
      callAudio.muted = false;
      audioUnlocked = true;
      audioMuted = false;
      updateAudioControl();
    } catch (_) {}
  }

  function toggleAudioMute() {
    if (!audioUnlocked) {
      unlockAudio();
      return;
    }
    audioMuted = !audioMuted;
    if (callAudio) {
      callAudio.muted = audioMuted;
      if (audioMuted) {
        callAudio.pause();
        callAudio.currentTime = 0;
      }
    }
    updateAudioControl();
  }

  function ensureAudioControl() {
    if (audioControlButton) return;
    audioControlButton = document.createElement("button");
    audioControlButton.type = "button";
    audioControlButton.className = "audio-control";
    audioControlButton.addEventListener("click", toggleAudioMute);
    document.body.appendChild(audioControlButton);
    updateAudioControl();
  }

  function playCallSound() {
    if (!callAudio || !audioUnlocked || audioMuted) return;
    try {
      callAudio.muted = false;
      callAudio.currentTime = 0;
      callAudio.play().catch(() => {});
    } catch (_) {}
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), config.requestTimeoutMs || 10000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) { const error = new Error(`HTTP ${response.status}`); error.status = response.status; throw error; }
      return await response.json();
    } finally { window.clearTimeout(timer); }
  }

  function api(path) {
    return fetchJson(`${config.backendUrl}${path}`, { headers: { "X-App-Key": config.appClientKey }, cache: "no-store" });
  }

  async function fetchState() {
    const allTournaments = await api("/api/tournaments");
    if (!Array.isArray(allTournaments)) throw new Error("Lista de torneos no válida");
    const visibleOnDisplay = tournament => tournament.status !== 'ARCHIVED' && tournament.settings?.displayEnabled !== false;
    const list = allTournaments.filter(visibleOnDisplay);
    const previous = new Map(currentState.tournaments.map(detail => [detail.tournament.id, detail]));
    const results = new Array(list.length);
    const failed = new Set();
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, list.length) }, async () => {
      while (cursor < list.length) {
        const index = cursor++;
        const id = list[index].id;
        try {
          const detail = await api(`/api/tournaments/${encodeURIComponent(id)}`);
          if (!detail?.tournament || !Array.isArray(detail.matches) || !Array.isArray(detail.participants)) throw new Error("Detalle de torneo no válido");
          results[index] = detail;
        }
        catch (error) {
          if (error.status !== 404) { failed.add(id); results[index] = previous.get(id); }
        }
      }
    }));
    failedTournamentIds = failed;
    return results.filter(detail => detail && visibleOnDisplay(detail.tournament) && isActiveTournament(detail));
  }

  async function loadRemoteDisplayConfig() {
    try {
      const nextConfig = await fetchJson(`${config.backendUrl}/api/display-admin/public-config`, {
        headers: config.appClientKey ? { "X-App-Key": config.appClientKey } : {},
        cache: "no-cache",
      });
      remoteDisplayConfig = nextConfig;
      controls?.applyRemote(nextConfig.displaySettings || {});
      updateDisplayScale();
      configSignature = JSON.stringify(nextConfig);
      if (remoteDisplayConfig?.default || remoteDisplayConfig?.themes) {
        themeManifest = {
          default: remoteDisplayConfig.default || themeManifest.default,
          themes: remoteDisplayConfig.themes || themeManifest.themes || [],
        };
      }
      if (Array.isArray(remoteDisplayConfig?.sponsors)) {
        sponsorLogos = remoteDisplayConfig.sponsors.map((src) => src.startsWith("http") ? src : `${config.backendUrl}${src}`);
      }
      const soundUrl = remoteDisplayConfig?.selectedSoundUrl || config.callSoundUrl;
      if (soundUrl) {
        const resolvedSoundUrl = new URL(soundUrl, `${config.backendUrl}/`).href;
        if (resolvedSoundUrl !== callAudioUrl) {
          callAudio = new Audio(resolvedSoundUrl);
          callAudio.preload = "auto";
          callAudio.volume = preferences().soundVolume / 100;
          callAudio.muted = audioMuted;
          callAudioUrl = resolvedSoundUrl;
          audioUnlocked = false;
        }
        updateAudioControl();
      }
      if (callAudio) callAudio.volume = preferences().soundVolume / 100;
      if (callAudio) callAudio.volume = preferences().soundVolume / 100;
    } catch (error) {
      console.warn("No se pudo cargar la config remota del display", error);
    }
  }

  async function loadThemeManifest() {
    if (window.GTDisplayThemes) {
      themeManifest = window.GTDisplayThemes;
      return;
    }
    try {
      themeManifest = await fetchJson(config.themeManifestUrl, { cache: "no-cache" });
    } catch (error) {
      console.warn("No se pudo cargar el manifest de temas", error);
    }
  }

  async function loadThemeFile(file) {
    if (!file) return null;
    if (typeof file === "object") return file;
    if (loadedThemeFiles.has(file)) {
      return loadedThemeFiles.get(file);
    }
    try {
      const theme = await fetchJson(file, { cache: "no-cache" });
      loadedThemeFiles.set(file, theme);
      return theme;
    } catch (error) {
      console.warn("No se pudo cargar el tema", file, error);
      return null;
    }
  }

  function matchThemeEntry(gameTitle) {
    const normalized = slugify(gameTitle);
    return (themeManifest.themes || []).find((entry) =>
      (entry.matchers || []).some((matcher) => normalized.includes(slugify(matcher)))
    ) || null;
  }

  async function resolveTheme(gameTitle) {
    const themeEntry = matchThemeEntry(gameTitle);
    if (!themeEntry) return null;
    const theme = themeEntry.file ? await loadThemeFile(themeEntry.file) : themeEntry;
    if (!theme) return null;
    return { ...theme, __themeKey: themeEntry.key || theme.key || themeEntry.file };
  }

  async function applyThemeForTournament(tournament, generation = renderGeneration) {
    const baseTheme = themeManifest.default
      ? await loadThemeFile(themeManifest.default)
      : themeManifest.defaultTheme || null;
    const specificTheme = tournament ? await resolveTheme(tournament.gameTitle) : null;
    const mergedTheme = {
      ...(baseTheme || {}),
      ...(specificTheme || {}),
      cssVars: {
        ...((baseTheme && baseTheme.cssVars) || {}),
        ...((specificTheme && specificTheme.cssVars) || {})
      },
      assets: {
        ...((baseTheme && baseTheme.assets) || {}),
        ...((specificTheme && specificTheme.assets) || {})
      }
    };
    if (generation !== renderGeneration) return;
    Object.keys(activeTheme.cssVars || {}).forEach(key => document.documentElement.style.removeProperty(key));
    activeTheme = mergedTheme;
    const vars = mergedTheme.cssVars || {};
    Object.entries(vars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }

  function renderThemeArt(kind) {
    const asset = activeTheme.assets?.[kind];
    if (!asset) return "";
    const resolvedAsset = safeHtml(resolveThemeAssetUrl(asset));
    if (isVideoAsset(asset)) {
      return `<div class="theme-art theme-art-${kind}"><video src="${resolvedAsset}" autoplay muted loop playsinline preload="auto"></video></div>`;
    }
    return `<div class="theme-art theme-art-${kind}"><img src="${resolvedAsset}" alt="${kind}"></div>`;
  }

  function stableAnnouncementMatchKey(match) {
    const provider = match.externalRef?.provider;
    const setId = String(match.externalRef?.setId || "").trim();
    if (provider === "START_GG" && setId) {
      return `startgg:${setId}`;
    }
    return `local:${match.id}`;
  }

  function resultFingerprint(match) { return core.resultFingerprint(match); }

  function pruneEvents() {
    const valid = event => refreshFailures === 0 && !failedTournamentIds.has(event.tournament.id) && core.validQueuedEvent(event, currentState.matchesByTournament, Date.now(), controls?.settings.tournamentId);
    for (const queue of [sceneQueue, callNotificationQueue]) {
      const retained = queue.filter(valid).slice(-30);
      queue.splice(0, queue.length, ...retained);
    }
    if (activeCall && !valid(activeCall)) dismissCall();
  }

  function queueNewEvents(nextDetails) {
    const previousMatches = currentState.matchesByTournament;
    const nextMap = new Map();
    nextDetails.forEach(detail => {
      const previous = previousMatches.get(detail.tournament.id) || new Map();
      const announced = announcedResultFingerprintsByTournament.get(detail.tournament.id) || new Map();
      const nextMatches = new Map();
      detail.matches.forEach(match => {
        nextMatches.set(match.id, match);
        const old = previous.get(match.id);
        const calledNow = old && match.status === "CALLED" && (old.status !== "CALLED" || old.call?.calledAt !== match.call?.calledAt);
        if (calledNow && !failedTournamentIds.has(detail.tournament.id)) {
          callNotificationQueue.push({ type: "call", tournament: detail.tournament, match, queuedAt: Date.now() });
        }
        const completed = ["COMPLETED", "WALKOVER"].includes(match.status);
        if (!completed) return;
        const key = stableAnnouncementMatchKey(match);
        const fingerprint = resultFingerprint(match);
        if (old && fingerprint !== resultFingerprint(old) && announced.get(key) !== fingerprint && !isAutomaticAdvanceDisplayMatch(match)) {
          const champion = detail.tournament.status === "COMPLETED" && match.bracketStage === "FINALS";
          sceneQueue.push({ type: champion ? "champion" : "result", tournament: detail.tournament, match, fingerprint, queuedAt: Date.now() });
        }
        announced.set(key, fingerprint);
      });
      announcedResultFingerprintsByTournament.set(detail.tournament.id, announced);
      nextMap.set(detail.tournament.id, nextMatches);
    });
    currentState = { tournaments: nextDetails, matchesByTournament: nextMap };
    for (const id of announcedResultFingerprintsByTournament.keys()) if (!nextMap.has(id)) announcedResultFingerprintsByTournament.delete(id);
    pruneEvents();
  }

  function splitRoundColumns(matches, size) {
    return Array.from({ length: Math.ceil(matches.length / size) }, (_, index) => matches.slice(index * size, (index + 1) * size));
  }

  function buildBracketScenes(detail) {
    const imported = detail.tournament.importSource?.provider === "START_GG";
    const visible = detail.matches.filter(match => imported || !isAutomaticAdvanceDisplayMatch(match));
    const scopes = new Map();
    visible.forEach(match => {
      const ref = matchExternalRef(match);
      const key = imported ? `${ref.phaseId || ref.phaseName || "main"}:${ref.phaseGroupId || ref.phaseGroupName || "main"}` : match.bracketStage === "POOLS" ? "pools" : "main";
      if (!scopes.has(key)) scopes.set(key, { key, label: [ref.phaseName, ref.phaseGroupName].filter(Boolean).join(" · ") || (key === "pools" ? "Pools" : "Bracket principal"), matches: [], order: Number(ref.phaseOrder) || 0 });
      scopes.get(key).matches.push(match);
    });
    return [...scopes.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, undefined, { numeric: true })).flatMap(scope => {
      const winners = scope.matches.filter(match => match.bracketStage !== "LOSERS");
      const losers = scope.matches.filter(match => match.bracketStage === "LOSERS");
      const clusters = [];
      if (winners.length) clusters.push({ id: `${scope.key}:winners`, label: winners.some(m => m.bracketStage === "POOLS") ? scope.label : "Winners / Final", columns: buildModernColumnsFromStageGroups(["POOLS", "WINNERS", "FINALS"].map(stage => ({ stage, matches: winners.filter(m => m.bracketStage === stage) }))) });
      if (losers.length) clusters.push({ id: `${scope.key}:losers`, label: "Losers", columns: buildModernBracketColumns("LOSERS", losers) });
      const sections = [{ id: scope.key, label: scope.label, clusters }];
      clusters.forEach(cluster => {
        // Resolve origins once per round; never connect opponents in the same round.
        const previousByParticipant = new Map();
        cluster.columns = cluster.columns.map(column => {
          const matches = column.matches.map(match => {
            const sources = new Set();
            if (String(matchExternalRef(match).phaseType || "").toUpperCase() !== "ROUND_ROBIN") {
              (match.participants || []).forEach(participant => {
                const id = sourceMatchIdFromPlaceholder(participant.participantId) || previousByParticipant.get(participant.participantId);
                if (id) sources.add(id);
              });
            }
            return { ...match, displaySourceIds: [...sources] };
          });
          matches.forEach(match => {
            const ids = [...(match.participants || []).map(participant => participant.participantId), ...(match.advancingParticipantIds || []), match.winnerParticipantId];
            ids.filter(id => id && !isPlaceholderParticipantId(id)).forEach(id => previousByParticipant.set(id, match.id));
          });
          return { ...column, matches };
        });
      });
      const viewport = screenViewport();
      const pages = core.paginateSections(sections, viewport.width, viewport.height, displayScale, preferences());
      return pages.map((sections, index) => ({
        key: `${scope.key}:${sections[0].id}`, label: `${scope.label} · ${sections[0].label}${pages.length > 1 ? ` · ${index + 1}/${pages.length}` : ""}`,
        pageIndex: index, pageCount: pages.length,
        stages: ["POOLS", "WINNERS", "LOSERS", "FINALS"], sections,
        matchIds: sections.flatMap(section => section.clusters.flatMap(cluster => cluster.columns.flatMap(column => column.matches.map(match => match.id)))),
      }));
    });
  }

  function matchExternalRef(match) {
    return match.externalRef || {};
  }

  function roundDisplayTitleFromMatches(stage, matches, totalRounds) {
    const fullRoundText = String(matches[0]?.roundLabel || matchExternalRef(matches[0] || {}).fullRoundText || "").trim();
    return fullRoundText || stageTitle(stage, matches[0]?.roundNumber || 1, totalRounds);
  }

  function playerState(match, participantId, tournament) {
    const isWinner = isMarioKartMatch(match, tournament)
      ? (match.advancingParticipantIds || []).includes(participantId)
      : match.winnerParticipantId === participantId;
    const completed = ["COMPLETED", "WALKOVER"].includes(match.status);
    return { completed, isWinner, isLoser: completed && participantId && !isWinner };
  }

  function currentBracketRenderMode() {
    if (previewSettings?.bracketRenderMode) return previewSettings.bracketRenderMode;
    return remoteDisplayConfig?.bracketRenderMode === "modern" ? "modern" : "classic";
  }

  function buildModernBracketColumns(stage, matches) {
    const byRound = new Map();
    matches.forEach((match) => {
      const round = match.roundNumber || 1;
      if (!byRound.has(round)) byRound.set(round, []);
      byRound.get(round).push(match);
    });
    const orderedRounds = Array.from(byRound.entries()).sort((a, b) => a[0] - b[0]);
    return orderedRounds.map(([round, roundMatches]) => ({
      stage,
      round,
      totalRounds: orderedRounds.length,
      title: modernRoundDisplayTitle(stage, round, roundMatches),
      matches: [...roundMatches].sort((a, b) => a.matchNumber - b.matchNumber),
      sourceStartIndex: 0,
    }));
  }

  function buildModernColumnsFromStageGroups(stageGroups) {
    return stageGroups.flatMap(({ stage, matches }) => {
      const filteredMatches = (matches || []).filter(Boolean);
      if (!filteredMatches.length) return [];
      return buildModernBracketColumns(stage, filteredMatches);
    });
  }

  function modernRoundDisplayTitle(stage, roundNumber, matches) {
    if (matches[0]?.roundLabel) return matches[0].roundLabel;
    const fullRoundText = String(matches[0]?.roundLabel || matchExternalRef(matches[0] || {}).fullRoundText || "").trim();
    if (fullRoundText) {
      return fullRoundText;
    }
    if (stage === "FINALS") {
      return roundNumber > 1 ? "Grand Final Reset" : "Grand Final";
    }
    if (stage === "LOSERS") {
      return `Losers Round ${roundNumber}`;
    }
    if (stage === "POOLS") {
      return `Pools Round ${roundNumber}`;
    }
    return `Winners Round ${roundNumber}`;
  }

  function buildModernEntrantHtml(detail, match, participant) {
    const state = playerState(match, participant.participantId, detail.tournament);
    const mkartMatch = isMarioKartMatch(match, detail.tournament);

    const isWalkover = match.status === "WALKOVER";
    const scoreText = !mkartMatch
      ? (isWalkover && state.isLoser ? "DQ" : String(participant.score || 0))
      : "";
    return `
      <div class="modern-entrant ${state.isWinner ? "win" : state.isLoser ? "lose" : ""}" data-participant-id="${safeHtml(participant.participantId)}">
        <div class="modern-entrant-main">
          ${renderCharacterIcons(detail.tournament, match, participant.participantId, "modern-entrant-character-icon")}
          <div class="modern-entrant-name">${safeHtml(participant.displayName)}</div>
        </div>
        ${mkartMatch ? "" : `<div class="modern-entrant-score ${isWalkover && state.isLoser ? "dq" : ""}">${safeHtml(scoreText)}</div>`}
      </div>`;
  }

  function buildModernMatchCardHtml(detail, column, match, matchIndex, clusterMatches, connectionGroup) {
    const mkartMatch = isMarioKartMatch(match, detail.tournament);
    const entrants = (match.participants || []).map((participant) =>
      buildModernEntrantHtml(detail, match, participant)
    ).join("");
    const sourceMatchIds = (match.displaySourceIds || sourceMatchIdsForMatch(match, clusterMatches)).join(",");
    return `
      <div class="modern-match-card ${mkartMatch ? "mkart" : ""}" data-round-index="${column.round}" data-match-index="${matchIndex}" data-match-id="${safeHtml(match.id)}" data-source-match-ids="${safeHtml(sourceMatchIds)}" data-bracket-stage="${safeHtml(match.bracketStage)}" data-connection-group="${safeHtml(connectionGroup)}">
        <div class="modern-match-head"><span>${safeHtml(matchDisplayLabel(match))}</span><span>${normalizeStatus(match.status)}</span></div>
        <div class="modern-match-meta">${mkartMatch ? `Heat de ${(match.participants || []).length} - pasan ${match.advancersRequired}` : bestOfLabel(match)}</div>
        ${entrants}
      </div>`;
  }

  function buildModernBracketHtml(detail, sceneDef, sections) {
    return sections.map((section) => `
      <div class="modern-bracket-section">
        <div class="modern-bracket-section-header">${safeHtml(section.label)}</div>
        ${section.clusters.map((cluster, clusterIndex) => `
          <div class="modern-bracket-cluster ${clusterIndex > 0 ? "separated" : ""}">
            ${section.clusters.length > 1 ? `<div class="modern-bracket-cluster-title">${safeHtml(cluster.label)}</div>` : ""}
            <div class="modern-bracket-canvas" data-section-id="${safeHtml(cluster.id)}" data-card-width="${Number(cluster.cardWidth) || 0}">
              <svg class="modern-bracket-connectors"></svg>
              ${(() => {
                const clusterMatches = cluster.columns.flatMap((column) => column.matches);
                return cluster.columns.map((column) => `
                <div class="modern-round-column ${column.matches.some((match) => isMarioKartMatch(match, detail.tournament)) ? "mkart" : ""}" data-round-order="${column.round}" data-source-start-index="${column.sourceStartIndex || 0}">
                  <div class="modern-round-title">${safeHtml(column.title)}</div>
                  ${column.matches.map((match, matchIndex) => buildModernMatchCardHtml(detail, column, match, matchIndex, clusterMatches, cluster.id)).join("")}
                </div>
              `).join("");
              })()}
            </div>
          </div>
        `).join("")}
      </div>
    `).join("");
  }

  function layoutModernRenderedBracket() {
    const canvases = app.querySelectorAll(".modern-bracket-canvas");
    canvases.forEach((canvas) => {
      const columns = Array.from(canvas.querySelectorAll(".modern-round-column"));
      if (columns.length === 0) return;
      const density = preferences().bracketDensity;
      const baseStandardWidth = Number(canvas.dataset.cardWidth) || (density === "comfortable" ? 370 : density === "compact" ? 300 : 320);
      const baseMarioKartWidth = baseStandardWidth;
      const baseColumnGap = 36;
      const baseVerticalGap = density === "comfortable" ? 18 : 12;
      const baseTopPadding = 12;
      const baseTitleHeight = 36;
      const responsiveScale = displayScale;
      const columnGap = Math.round(baseColumnGap * responsiveScale);
      const verticalGap = Math.round(baseVerticalGap * responsiveScale);
      const topPadding = Math.round(baseTopPadding * responsiveScale);
      const titleHeight = Math.round(baseTitleHeight * responsiveScale);
      const connectorSvg = canvas.querySelector(".modern-bracket-connectors");
      connectorSvg.innerHTML = "";
      canvas.style.setProperty("--modern-scale", String(responsiveScale));
      canvas.style.setProperty("--modern-card-width", `${Math.round(baseStandardWidth * responsiveScale)}px`);
      canvas.style.setProperty("--modern-mkart-width", `${Math.round(baseMarioKartWidth * responsiveScale)}px`);
      canvas.style.setProperty("--modern-column-gap", `${columnGap}px`);
      canvas.style.setProperty("--modern-vertical-gap", `${verticalGap}px`);
      canvas.style.setProperty("--modern-top-padding", `${topPadding}px`);
      canvas.style.setProperty("--modern-title-height", `${titleHeight}px`);
      let maxHeight = 0;
      let leftCursor = 0;
      const globalCardHeight = columns.reduce((max, column) => {
        const cards = Array.from(column.querySelectorAll(".modern-match-card"));
        const columnMax = cards.reduce((cardMax, card) => Math.max(cardMax, card.offsetHeight || 0), 0);
        return Math.max(max, columnMax);
      }, 60 * responsiveScale);
      const rowUnit = globalCardHeight + verticalGap;
      const positionedCardByMatchId = new Map();
      const baseTop = topPadding + titleHeight;

      columns.forEach((column, columnIndex) => {
        const columnWidth = column.offsetWidth || (column.classList.contains("mkart") ? 320 : 252);
        column.style.left = `${leftCursor}px`;
        column.style.top = "0px";
        const cards = Array.from(column.querySelectorAll(".modern-match-card"));
        const cardPositions = [];
        cards.forEach((card, cardIndex) => {
          const cardHeight = card.offsetHeight || globalCardHeight;
          let top;
          if (columnIndex === 0) {
            top = baseTop + (cardIndex * rowUnit);
          } else {
            const sourceIds = String(card.dataset.sourceMatchIds || "")
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean);
            const sources = sourceIds
              .map((sourceId) => positionedCardByMatchId.get(sourceId))
              .filter((source) => source && source.card?.dataset?.connectionGroup === card.dataset.connectionGroup);
            if (sources.length >= 2) {
              const sourceCenter = sources.reduce((sum, source) => sum + source.top + (source.height / 2), 0) / sources.length;
              top = sourceCenter - (cardHeight / 2);
            } else if (sources.length === 1) {
              top = (sources[0].top + (sources[0].height / 2)) - (cardHeight / 2);
            } else {
              top = baseTop + (cardIndex * rowUnit);
            }
            const previousCard = cardPositions[cardPositions.length - 1];
            if (previousCard) {
              top = Math.max(top, previousCard.top + previousCard.height + verticalGap);
            }
          }
          card.style.left = "0px";
          card.style.top = `${top}px`;
          const positionedCard = { card, top, height: cardHeight };
          cardPositions.push(positionedCard);
          if (card.dataset.matchId) {
            positionedCardByMatchId.set(card.dataset.matchId, positionedCard);
          }
          maxHeight = Math.max(maxHeight, top + cardHeight + 28);
        });
        leftCursor += columnWidth + columnGap;
      });

      const width = Math.max(leftCursor - columnGap, 320);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${maxHeight}px`;
      connectorSvg.setAttribute("viewBox", `0 0 ${width} ${maxHeight}`);
      connectorSvg.setAttribute("width", `${width}`);
      connectorSvg.setAttribute("height", `${maxHeight}`);

      const allCards = Array.from(canvas.querySelectorAll(".modern-match-card"));
      const cardByMatchId = new Map(
        allCards
          .filter((card) => card.dataset.matchId)
          .map((card) => [card.dataset.matchId, card])
      );
      const drawnConnectors = new Set();
      allCards.forEach((targetCard) => {
        const sourceIds = String(targetCard.dataset.sourceMatchIds || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        sourceIds.forEach((sourceId) => {
          const sourceCard = cardByMatchId.get(sourceId);
          const connectorKey = `${sourceId}->${targetCard.dataset.matchId}`;
          if (!sourceCard || sourceCard.dataset.connectionGroup !== targetCard.dataset.connectionGroup || drawnConnectors.has(connectorKey)) return;
          drawModernConnector(canvas, connectorSvg, sourceCard, targetCard);
          drawnConnectors.add(connectorKey);
        });
      });
    });
  }

  function drawModernConnector(canvas, svg, sourceCard, targetCard) {
    const sourceBox = getModernBoxRelativeToCanvas(sourceCard, canvas);
    const targetBox = getModernBoxRelativeToCanvas(targetCard, canvas);
    const x1 = sourceBox.x + sourceBox.width;
    const y1 = sourceBox.y + sourceBox.height / 2;
    const x2 = targetBox.x;
    const y2 = targetBox.y + targetBox.height / 2;
    const midX = x1 + (x2 - x1) * 0.5;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "modern-bracket-connector");
    path.setAttribute("d", `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
    svg.appendChild(path);
  }

  function getModernBoxRelativeToCanvas(element, canvas) {
    let x = 0;
    let y = 0;
    let node = element;
    while (node && node !== canvas) {
      x += node.offsetLeft || 0;
      y += node.offsetTop || 0;
      node = node.offsetParent;
    }
    return {
      x,
      y,
      width: element.offsetWidth || 0,
      height: element.offsetHeight || 0,
    };
  }

  function fitRenderedBracket() {
    const viewport = app.querySelector(".bracket-viewport");
    const scaleNode = app.querySelector(".bracket-scale");
    const content = app.querySelector(".bracket-scroll");
    if (!viewport || !scaleNode || !content) return;
    const contentWidth = Math.max(content.scrollWidth, 1);
    const contentHeight = Math.max(content.scrollHeight, 1);
    const widthScale = viewport.clientWidth / contentWidth;
    const heightScale = viewport.clientHeight / contentHeight;
    const overview = preferences().bracketViewport === "overview";
    let scale = Math.max(overview ? 0.02 : 0.75, Math.min(1, widthScale, heightScale));
    const note = app.querySelector(".bracket-zoom-note");
    if (note) note.textContent = overview && scale < 0.65 ? `Vista completa · ${Math.round(scale * 100)} % · Usa «Por ramas» para leer el detalle` : "";
    // The overview hint itself takes space; measure the remaining viewport again.
    scale = Math.max(overview ? 0.02 : 0.75, Math.min(1, widthScale, (viewport.clientHeight - 4) / contentHeight));
    scaleNode.style.width = `${contentWidth}px`;
    scaleNode.style.height = `${contentHeight}px`;
    if (window.CSS && CSS.supports && CSS.supports("zoom", "1")) {
      scaleNode.style.zoom = `${scale}`;
      scaleNode.style.transform = "none";
    } else {
      scaleNode.style.zoom = "";
      scaleNode.style.transform = `scale(${scale})`;
    }
  }

  function preloadImage(src) {
    return new Promise((resolve) => {
      const image = new Image();
      const timer = window.setTimeout(() => resolve(null), 5000);
      image.onload = () => { clearTimeout(timer); resolve(src); };
      image.onerror = () => { clearTimeout(timer); resolve(null); };
      image.src = src;
    });
  }

  async function loadSponsorLogos() {
    const checks = [];
    for (let index = 1; index <= (config.sponsorMax || 0); index += 1) {
      checks.push(preloadImage(`${config.sponsorsPath}/${config.sponsorPrefix}${index}.png`));
    }
    const localLogos = (await Promise.all(checks)).filter(Boolean);
    if (!Array.isArray(remoteDisplayConfig?.sponsors)) sponsorLogos = localLogos;
  }

  function renderSponsorsBar() {
    if (!preferences().showSponsors) return "";
    if (!sponsorLogos.length) return "";
    return `<div class="sponsors-bar">${sponsorLogos.map((src, index) => `<img class="sponsor-logo" src="${src}" alt="Sponsor ${index + 1}">`).join("")}</div>`;
  }

  function dismissCall() {
    window.clearTimeout(toastTimer);
    activeToast?.remove();
    activeToast = null;
    activeCall = null;
    callToastVisible = false;
  }

  function showCallNotification() {
    if (isPreview || !preferences().showCalls) { callNotificationQueue.length = 0; dismissCall(); return; }
    pruneEvents();
    if (callToastVisible || !callNotificationQueue.length) return;
    activeCall = callNotificationQueue.shift();
    callToastVisible = true;
    const { tournament, match } = activeCall;
    const templates = remoteDisplayConfig?.messageTemplates || {};
    const values = popupTemplateValues(tournament, match);
    const toast = document.createElement("div");
    activeToast = toast;
    toast.className = "call-toast slide-in-right";
    const field = (key, fallback) => safeHtml(renderTemplate(templates[key] || fallback, values));
    toast.innerHTML = `<div class="call-toast-eyebrow">${field("webCallEyebrow", "Llamada a jugar")}</div>
      <div class="call-toast-title">${field("webCallTitle", "{{tournament_title}}")}</div>
      <div class="call-toast-body">${field("webCallBody", "{{players_vs}}")}</div>
      <div class="call-toast-meta">${field("webCallMeta", "Estación {{station_label}} · {{timeout_minutes}} min")}</div>
      <div class="call-toast-note">${field("webCallNote", "Presentaos dentro del tiempo asignado.")}</div>`;
    playCallSound();
    document.body.appendChild(toast);
    toastTimer = window.setTimeout(() => { dismissCall(); showCallNotification(); }, (controls?.settings.callSeconds || 12) * 1000);
  }

  function renderIdle() {
    renderScreen(`<div class="screen idle-screen">${renderSponsorsBar()}${renderThemeArt("idle")}<img src="${config.idleImageUrl}" alt="Idle"></div>`);
    showCallNotification();
  }

  async function renderBracketScene(detail, sceneDef) {
    const generation = renderGeneration;
    await applyThemeForTournament(detail.tournament, generation);
    if (generation !== renderGeneration) return;
    const totalMatches = detail.matches.length;
    detail = { ...detail, matches: detail.matches.filter(match => sceneDef.matchIds.includes(match.id)) };
    const useModernBracket = currentBracketRenderMode() === "modern";
    let html = "";
    let densityClass = "";

    if (useModernBracket) {
      const modernSections = sceneDef.sections;
      html = buildModernBracketHtml(detail, sceneDef, modernSections);
      densityClass = "modern-bracket-shell";
    } else {
      const renderColumn = (column) => {
        const mkartColumn = column.matches.some((match) => isMarioKartMatch(match, detail.tournament));
        const matchesHtml = column.matches.sort((a, b) => a.matchNumber - b.matchNumber).map((match) => {
          const mkartMatch = isMarioKartMatch(match, detail.tournament);
          const entrants = (match.participants || []).map((participant) => {
            const state = playerState(match, participant.participantId, detail.tournament);

            const isWalkover = match.status === "WALKOVER";
            const scoreText = !mkartMatch
              ? (isWalkover && state.isLoser ? "DQ" : String(participant.score || 0))
              : "";
            return `
              <div class="entrant ${state.isWinner ? "win" : state.isLoser ? "lose" : ""}" data-participant-id="${safeHtml(participant.participantId)}">
                ${renderCharacterIcons(detail.tournament, match, participant.participantId, "entrant-character-icon")}
                <div class="entrant-name">${safeHtml(participant.displayName)}</div>
                ${mkartMatch ? "" : `<div class="entrant-score ${isWalkover && state.isLoser ? "dq" : ""}">${safeHtml(scoreText)}</div>`}
              </div>`;
          }).join("");

          return `
            <div class="match-card" data-match-id="${safeHtml(match.id)}">
              <div class="match-head"><span>${safeHtml(matchDisplayLabel(match))}</span><span>${normalizeStatus(match.status)}</span></div>
              <div class="scene-meta">${mkartMatch ? `Heat de ${match.participants.length} - pasan ${match.advancersRequired}` : bestOfLabel(match)}</div>
              ${entrants}
            </div>`;
        }).join("");

        return `
          <div class="bracket-column ${mkartColumn ? "mkart" : ""}">
            <div class="round-title">
              ${safeHtml(column.title || roundDisplayTitleFromMatches(column.stage, column.matches, column.totalRounds))}
              ${column.chunkCount > 1 ? `<span class="round-split">Bloque ${column.chunkIndex + 1}/${column.chunkCount}</span>` : ""}
            </div>
            ${matchesHtml}
          </div>`;
      };

      html = sceneDef.sections.map(section => section.clusters.map(cluster => `
        <div class="classic-cluster" ${cluster.cardWidth ? `style="--bracket-card-width:${Number(cluster.cardWidth)}px"` : ""}><div class="classic-cluster-title">${safeHtml(cluster.label)}</div>
        <div class="classic-columns">${cluster.columns.map(renderColumn).join("")}</div></div>`).join("")).join("");

    }

    renderScreen(`
      <div class="screen scene-bracket">
        ${renderThemeArt("background")}
        ${renderThemeArt("bracketOverlay")}
        <div class="scene-shell">
          ${renderSponsorsBar()}
          <div class="scene-topbar">
            <div class="scene-title">
              <div class="eyebrow">${safeHtml(sceneDef.label)}</div>
              <div class="name">${safeHtml(detail.tournament.title)}</div>
              <div class="scene-meta">${safeHtml(detail.tournament.gameTitle)} - ${normalizeStatus(detail.tournament.status)}</div>
            </div>
            <div class="scene-status">${detail.participants.length} participantes · ${new Set(sceneDef.matchIds).size} de ${totalMatches} matches</div>
          </div>
          <div class="bracket-context">${sceneDef.sections.flatMap(section => section.clusters).map(cluster => `<div class="round-trail"><strong>${safeHtml(cluster.label)}</strong>${(cluster.allRoundTitles || cluster.columns.map(c => c.title)).map((title, i) => `<span class="${i >= (cluster.roundStart || 0) && i < (cluster.roundStart || 0) + cluster.columns.length ? "current" : ""}">${safeHtml(title)}</span>`).join("")}${cluster.branchCount > 1 ? `<b>Rama ${cluster.branchIndex + 1}/${cluster.branchCount}</b>` : ""}</div>`).join("")}<span class="bracket-zoom-note"></span></div>
          <div class="bracket-stage">
            <div class="bracket-viewport">
              <div class="bracket-scale">
                <div class="bracket-scroll ${densityClass}">${html}</div>
              </div>
            </div>
          </div>
        </div>
      </div>`);

    // Commit geometry in the same turn as the HTML, before the browser paints.
    // A deferred layout can briefly expose unpositioned cards when pages rotate.
    if (useModernBracket) layoutModernRenderedBracket();
    fitRenderedBracket();
    showCallNotification();
  }

  function renderStandardResultScene(scene, winnerId, celebration) {
    const match = scene.match;
    const isWalkover = match.status === "WALKOVER";
    const players = (match.participants || []).map((participant) => {
      const winner = participant.participantId === winnerId;
      const loser = !winner && ["COMPLETED", "WALKOVER"].includes(match.status);

      const scoreText = isWalkover && loser ? "DQ" : String(participant.score ?? 0);
      return `
        <div class="player-card ${winner ? "winner" : loser ? "loser" : "neutral"}">
          <div class="player-role">${winner ? "Ganador" : loser ? "Perdedor" : "Participante"}</div>
          <div class="player-name-row">
            ${renderCharacterIcons(scene.tournament, match, participant.participantId, "player-character-icon")}
            <div class="player-name">${safeHtml(participant.displayName)}</div>
          </div>
          <div class="player-score ${isWalkover && loser ? "dq" : ""}">${safeHtml(scoreText)}</div>
        </div>`;
    });

    return `
      <div class="result-card">
        <div class="result-stage">${safeHtml(matchRoundLabel(match))}</div>
        <div class="result-match-name">${celebration ? "Torneo completado" : safeHtml(matchDisplayLabel(match))}</div>
        ${celebration ? `<div class="champion-title">${safeHtml((match.participants || []).find((participant) => participant.participantId === winnerId)?.displayName || "Campeón")}</div><div class="champion-subtitle">Victoria final del torneo</div>` : ""}
        <div class="result-players">
          ${players[0] || ""}
          <div class="result-vs">VS</div>
          ${players[1] || players[2] || ""}
        </div>
      </div>`;
  }

  function renderMkartResultScene(scene, celebration) {
    const match = scene.match;
    const advancers = new Set(match.advancingParticipantIds || []);
    const heatPlayers = (match.participants || []).map((participant) => {
      const advanced = advancers.has(participant.participantId);
      const eliminated = ["COMPLETED", "WALKOVER"].includes(match.status) && !advanced;
      return `
        <div class="mkart-player-card ${advanced ? "advanced" : eliminated ? "eliminated" : ""}">
          <div class="mkart-player-header">
            <div class="player-name">${safeHtml(participant.displayName)}</div>
            <div class="mkart-badge">${advanced ? "Pasa" : eliminated ? "Fuera" : "Pendiente"}</div>
          </div>
          <div class="mkart-player-footer">
            <div class="player-score">${participant.score ?? 0}</div>
          </div>
        </div>`;
    }).join("");

    return `
      <div class="result-card mkart-result-card">
        <div class="result-stage">${safeHtml(matchRoundLabel(match))}</div>
        <div class="result-match-name">${celebration ? "Torneo completado" : safeHtml(matchDisplayLabel(match))}</div>
        ${celebration ? `<div class="champion-title">${safeHtml((match.participants || []).find((participant) => advancers.has(participant.participantId))?.displayName || "Campeón")}</div><div class="champion-subtitle">Victoria final del torneo</div>` : `<div class="mkart-summary">Clasifican ${match.advancersRequired} jugador(es) de este grupo</div>`}
        <div class="mkart-result-grid">${heatPlayers}</div>
      </div>`;
  }

  async function renderResultScene(scene) {
    const generation = renderGeneration;
    await applyThemeForTournament(scene.tournament, generation);
    if (generation !== renderGeneration) return;
    const match = scene.match;
    const winnerId = match.winnerParticipantId || (match.advancingParticipantIds || [])[0];
    const celebration = scene.type === "champion";
    const mkartMatch = isMarioKartMatch(match, scene.tournament) && !celebration;
    const cardHtml = mkartMatch ? renderMkartResultScene(scene, celebration) : renderStandardResultScene(scene, winnerId, celebration);

    renderScreen(`
      <div class="screen pulse-enter ${celebration ? "scene-champion" : "scene-result"}">
        ${renderThemeArt("background")}
        ${renderThemeArt(celebration ? "championOverlay" : "resultOverlay")}
        ${celebration ? `<div class="champion-overlay"></div><div class="champion-spark champion-spark-a"></div><div class="champion-spark champion-spark-b"></div><div class="champion-spark champion-spark-c"></div>` : ""}
        <div class="scene-shell">
          ${renderSponsorsBar()}
          <div class="scene-topbar">
            <div class="scene-title">
              <div class="eyebrow">${celebration ? "Campeon del torneo" : mkartMatch ? "Resultado del heat" : "Resultado confirmado"}</div>
              <div class="name">${safeHtml(scene.tournament.title)}</div>
              <div class="scene-meta">${safeHtml(scene.tournament.gameTitle)}</div>
            </div>
            <div class="scene-status">${normalizeStatus(match.status)}</div>
          </div>
          <div class="result-panel">${cardHtml}</div>
        </div>
      </div>`);
    showCallNotification();
  }

  function screenViewport() {
    const header = preferences().compactHeader ? 140 : 250;
    const sponsors = preferences().showSponsors && sponsorLogos.length ? 65 : 0;
    return { width: Math.max(280, window.innerWidth - 48 * displayScale), height: Math.max(200, window.innerHeight - (header + sponsors) * displayScale) };
  }

  function updateDisplayScale() {
    displayScale = Math.max(0.7, Math.min(4, window.innerWidth / 1920, window.innerHeight / 1080)) * preferences().textScale / 100;
    document.documentElement.style.setProperty("--display-scale", String(displayScale));
    document.documentElement.dataset.density = preferences().bracketDensity;
    document.documentElement.classList.toggle("compact-header", preferences().compactHeader);
    document.documentElement.classList.toggle("reduce-motion", preferences().reduceMotion || isPreview);
    document.documentElement.classList.toggle("display-preview", isPreview);
  }

  function setupRows(detail) {
    const rows = Array.from({ length: Math.max(1, detail.tournament.settings?.setupCount || 1) }, (_, index) => ({ label: String(index + 1), matches: [] }));
    for (let i = 1; i <= Math.min(2, detail.tournament.settings?.streamCount || 0); i++) rows.push({ label: `Stream ${i}`, matches: [] });
    detail.matches.filter(match => ["CALLED", "CHECKED_IN", "PLAYING", "RESULT_REPORTED", "UNDER_REVIEW"].includes(match.status)).forEach(match => {
      const raw = String(match.call?.stationLabel || "").trim();
      const number = raw.match(/^(?:setup\s*)?#?(\d+)$/i)?.[1];
      const label = number ? String(Number(number)) : raw || "Sin estación";
      let row = rows.find(row => row.label === label);
      if (!row) { row = { label, matches: [] }; rows.push(row); }
      row.matches.push(match);
    });
    for (const ladder of detail.ladder?.activeMatches || []) {
      if (!["READY_CHECK","PLAYING"].includes(ladder.status)) continue;
      const label = ladder.stationLabel?.replace(/^setup\s*/i, "") || "Sin estación";
      let row = rows.find(row => row.label === label);
      if (!row) { row = {label,matches:[]}; rows.push(row); }
      row.matches.push({...ladder,displayIdentifier:"Ladder",bracketStage:"LADDER",roundNumber:1,matchNumber:1,status:ladder.status === "READY_CHECK" ? "CALLED" : "PLAYING",call:{stationLabel:ladder.stationLabel,calledAt:ladder.status === "READY_CHECK" && ladder.readyDeadlineAt ? new Date(Date.parse(ladder.readyDeadlineAt)-(detail.ladder.session?.options?.settings?.readySeconds || 300)*1000).toISOString() : undefined}});
    }
    return rows;
  }

  function sceneEntries() {
    const settings = controls.settings;
    const active = currentState.tournaments.filter(detail => !settings.tournamentId || detail.tournament.id === settings.tournamentId);
    const entries = active.flatMap(detail => {
      if (detail.tournament.settings?.bracketMode === 'FORTNITE') {
        const viewport=screenViewport();
        return window.GTFortniteDisplay.scenes(detail,viewport.width/displayScale,viewport.height/displayScale).map(sceneDef=>({key:`${detail.tournament.id}:fortnite:${sceneDef.key}`,label:`${detail.tournament.title} · ${sceneDef.label}`,type:'fortnite',detail,sceneDef}));
      }
      const bracket = ["setups","ladder"].includes(settings.view) ? [] : buildBracketScenes(detail).map(sceneDef => ({ key: `${detail.tournament.id}:bracket:${sceneDef.key}`, label: `${detail.tournament.title} · ${sceneDef.label}`, type: "bracket", detail, sceneDef }));
      const rows = setupRows(detail);
      const capacity = Math.max(1, Math.floor(window.innerWidth / displayScale / 500)) * Math.max(1, Math.floor((window.innerHeight / displayScale - 250) / 300));
      const setups = ["bracket","ladder"].includes(settings.view) || (settings.view === "rotation" && !preferences().includeSetups) ? [] : splitRoundColumns(rows, capacity).map((rows, index) => ({ key: `${detail.tournament.id}:setups:${index}`, label: `${detail.tournament.title} · Setups ${index + 1}`, type: "setups", detail, rows }));
      const ladder = settings.view === "ladder" || (settings.view === "rotation" && preferences().includeLadder) ? window.GTLadderDisplay.scenes(detail, window.innerHeight / displayScale) : [];
      return [...bracket, ...setups, ...ladder];
    });
    controls.update(currentState.tournaments.map(detail => detail.tournament), entries);
    const fixed = settings.sceneKey ? entries.filter(entry => entry.key === settings.sceneKey) : [];
    return fixed.length ? fixed : entries;
  }

  async function renderSetups(entry) {
    const generation = renderGeneration;
    await applyThemeForTournament(entry.detail.tournament, generation);
    if (generation !== renderGeneration) return;
    const tournament = entry.detail.tournament;
    renderScreen(`<div class="screen scene-setups"><div class="scene-shell">${renderSponsorsBar()}
      <div class="scene-topbar"><div class="scene-title"><div class="eyebrow">Setups · ${safeHtml(tournament.settings?.playAreaName || "Zona de juego")}</div>
      <div class="name">${safeHtml(tournament.title)}</div><div class="scene-meta">${safeHtml(tournament.gameTitle)}</div></div></div>
      <div class="setup-grid">${entry.rows.map(row => `<section class="setup-card ${row.matches.length ? "occupied" : "available"}"><h2>Estación ${safeHtml(row.label)}</h2>${row.matches.length ? row.matches.map(match => {
        const isPlaying = match.status === "PLAYING";
        const timeout = tournament.settings?.callTimeoutMinutes || 10;
        const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(match.call?.calledAt || "")) / 60000));
        return `<div class="setup-match"><div class="setup-status">${isPlaying ? "Jugando" : match.status === "CALLED" ? "Llamados a jugar" : normalizeStatus(match.status)} · ${safeHtml(matchDisplayLabel(match))}</div>
          <div class="setup-players">${match.participants.map(p => safeHtml(p.displayName)).join("<span>vs</span>")}</div>
          ${!isPlaying && Number.isFinite(elapsed) ? `<p>${Math.max(0, timeout - elapsed)} min de plazo</p>` : ""}</div>`;
      }).join("") : '<div class="setup-status">Libre</div>'}</section>`).join("")}</div></div></div>`);
  }

  async function renderEntry(entry, force = false) {
    const signature = JSON.stringify([entry, configSignature, displayScale, entry?.type === "setups" ? Math.floor(Date.now() / 60000) : 0]);
    if (!force && signature === lastRenderedSignature) return;
    const sameScene = activeEntry?.key === entry?.key;
    activeEntry = entry;
    if (entry && ["bracket", "setups", "ladder", "fortnite"].includes(entry.type)) lastRotationKey = entry.key;
    lastRenderedSignature = signature;
    const generation = ++renderGeneration;
    try {
      if (!entry) { await applyThemeForTournament(null, generation); if (generation === renderGeneration) renderIdle(); }
      else if (entry.type === "bracket") await renderBracketScene(entry.detail, entry.sceneDef);
      else if (entry.type === "setups") await renderSetups(entry);
      else if (entry.type === "ladder") { await applyThemeForTournament(entry.detail.tournament, generation); if (generation === renderGeneration) renderScreen(window.GTLadderDisplay.render(entry, renderSponsorsBar())); }
      else if (entry.type === "fortnite") {
        await applyThemeForTournament(entry.detail.tournament,generation);
        if(generation!==renderGeneration)return;
        renderScreen(`<div class="screen scene-fortnite"><div class="scene-shell">${renderSponsorsBar()}<div class="scene-topbar"><div class="scene-title"><div class="eyebrow">Fortnite · Grupos y clasificación</div><div class="name">${safeHtml(entry.detail.tournament.title)}</div><div class="scene-meta">${entry.detail.tournament.settings.fortniteLobbySize||20} puestos por grupo</div></div></div>${window.GTFortniteDisplay.render(entry.sceneDef)}</div></div>`);
      }
      else await renderResultScene(entry);
      if (sameScene && generation === renderGeneration) app.querySelector(".pulse-enter")?.classList.remove("pulse-enter");
    } catch (error) { if (generation === renderGeneration) lastRenderedSignature = ""; console.warn("No se pudo actualizar la escena", error); }
  }

  function updateConnectionBadge() {
    const count = failedTournamentIds.size;
    connectionBadge.hidden = refreshFailures === 0 && count === 0;
    if (connectionBadge.hidden) return;
    const last = lastSuccessfulRefresh ? new Date(lastSuccessfulRefresh).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "pendiente";
    connectionBadge.textContent = refreshFailures ? `Sin conexión · Última actualización: ${last}` : `${count} torneo(s) sin actualizar · Conservando los últimos datos`;
  }

  async function refreshLoop() {
    if (refreshBusy) return;
    refreshBusy = true;
    window.clearTimeout(refreshTimer);
    try {
      const nextDetails = await fetchState();
      refreshFailures = 0;
      if (!failedTournamentIds.size) lastSuccessfulRefresh = Date.now();
      queueNewEvents(nextDetails);
      const entries = sceneEntries();
      if (activeEntry && ["result", "champion"].includes(activeEntry.type) && core.validQueuedEvent(activeEntry, currentState.matchesByTournament, Date.now(), controls.settings.tournamentId)) {
        // Results keep their allotted time; the next bracket uses the latest data.
      } else {
        await renderEntry(entries.find(entry => entry.key === activeEntry?.key || entry.key === lastRotationKey) || entries[0] || null);
      }
    } catch (error) {
      refreshFailures++;
      dismissCall();
      console.warn("No se pudo actualizar el display", error);
    } finally {
      refreshBusy = false;
      updateConnectionBadge();
      if (!refreshFailures) showCallNotification();
      refreshTimer = window.setTimeout(refreshLoop, Math.min(30000, (config.pollIntervalMs || 4000) * Math.max(1, refreshFailures)));
    }
    if (Date.now() - lastConfigAttempt > 30000) {
      lastConfigAttempt = Date.now();
      void loadRemoteDisplayConfig();
    }
  }

  async function sceneLoop(manual = false) {
    const cycle = ++sceneCycle;
    window.clearTimeout(sceneTimer);
    pruneEvents();
    const entries = sceneEntries();
    let duration = controls.settings.bracketSeconds * 1000;
    if (!preferences().showResults || isPreview) sceneQueue.length = 0;
    if (!manual && preferences().showResults && !isPreview && !controls.settings.paused && !controls.settings.sceneKey && controls.settings.view !== "setups" && sceneQueue.length) {
      const event = sceneQueue.shift();
      await renderEntry({ ...event, key: `result:${event.tournament.id}:${event.match.id}` });
      duration = controls.settings.resultSeconds * 1000;
    } else if (manual || !controls.settings.paused || !activeEntry) {
      const index = entries.findIndex(entry => entry.key === lastRotationKey);
      await renderEntry(entries[(index + 1) % entries.length] || null);
    }
    if (cycle === sceneCycle) sceneTimer = window.setTimeout(() => sceneLoop(), duration);
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      updateDisplayScale();
      lastRenderedSignature = "";
      if (activeEntry && ["result", "champion"].includes(activeEntry.type)) { void renderEntry(activeEntry, true); return; }
      const entries = sceneEntries();
      void renderEntry(entries.find(entry => entry.key === activeEntry?.key) || entries[0] || null);
    }, 160);
  });
  window.addEventListener("online", () => { void refreshLoop(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { pruneEvents(); void refreshLoop(); } });
  app.addEventListener("error", event => { if (event.target.tagName === "IMG") event.target.hidden = true; }, true);
  updateDisplayScale();
  controls = window.GTScreenControls(field => {
    updateDisplayScale();
    sceneCycle++;
    pruneEvents();
    const entries = sceneEntries();
    const keepResult = activeEntry && ["result", "champion"].includes(activeEntry.type) && !["tournamentId", "view", "sceneKey"].includes(field);
    if (!keepResult) void renderEntry(entries.find(entry => entry.key === activeEntry?.key) || entries[0] || null, true);
    window.clearTimeout(sceneTimer);
    sceneTimer = window.setTimeout(() => sceneLoop(), (keepResult ? controls.settings.resultSeconds : controls.settings.bracketSeconds) * 1000);
  }, () => { void sceneLoop(true); });
  window.addEventListener("message", event => {
    if (!isPreview || event.source !== window.parent || event.origin !== location.origin) return;
    if (event.data?.type === "GT_DISPLAY_PREVIEW_NEXT") { void sceneLoop(true); return; }
    if (event.data?.type !== "GT_DISPLAY_PREVIEW") return;
    previewSettings = { ...window.GTDisplaySettings.normalize(event.data.settings), bracketRenderMode: event.data.settings?.bracketRenderMode === "modern" ? "modern" : "classic" };
    updateDisplayScale();
    lastRenderedSignature = "";
    const entries = sceneEntries();
    void renderEntry(entries[0] || null, true);
  });
  connectionBadge = document.createElement("div");
  connectionBadge.className = "display-connection";
  connectionBadge.setAttribute("role", "status");
  connectionBadge.hidden = true;
  document.body.appendChild(connectionBadge);
  ensureAudioControl();
  renderIdle();
  void Promise.all([loadSponsorLogos(), loadThemeManifest()]).then(() => { lastRenderedSignature = ""; });
  void refreshLoop();
  sceneTimer = window.setTimeout(() => sceneLoop(), controls.settings.bracketSeconds * 1000);
})();
