(function () {
  const app = document.getElementById("app");
  const config = window.GTDisplayConfig;
  const API_BASE = `${config.backendUrl}/api/display-admin`;
  const TOKEN_KEY = "gt_display_admin_token";
  const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".ogv", ".mov", ".m4v"];

  const COLOR_FIELDS = [
    ["--bg", "Fondo general"],
    ["--panel", "Panel bracket"],
    ["--panel-2", "Panel resultado"],
    ["--line", "Bordes"],
    ["--text", "Texto principal"],
    ["--muted", "Texto secundario"],
    ["--soft", "Texto suave"],
    ["--accent", "Acento"],
    ["--gold", "Dorado"],
    ["--electric", "Azul electrico"],
    ["--teal", "Verde agua"],
    ["--win", "Color de victoria"],
    ["--lose", "Color de derrota"],
    ["--idle-bg", "Fondo idle"],
    ["--scene-grid-strong", "Grid fuerte"],
    ["--scene-grid-soft", "Grid suave"],
    ["--scene-bracket-glow-a", "Glow bracket A"],
    ["--scene-bracket-glow-b", "Glow bracket B"],
    ["--scene-result-glow", "Glow resultado"],
    ["--scene-champion-gold", "Glow campeon dorado"],
    ["--scene-champion-green", "Glow campeon verde"],
    ["--scene-champion-blue", "Glow campeon azul"],
    ["--match-card-highlight-a", "Highlight bracket A"],
    ["--match-card-highlight-b", "Highlight bracket B"],
    ["--entrant-bg", "Entrada neutra"],
    ["--entrant-border", "Borde entrada neutra"],
    ["--entrant-win-bg", "Entrada ganador"],
    ["--entrant-win-border", "Borde ganador"],
    ["--entrant-win-text", "Texto ganador"],
    ["--entrant-lose-bg", "Entrada perdedor"],
    ["--entrant-lose-border", "Borde perdedor"],
    ["--entrant-lose-text", "Texto perdedor"],
    ["--result-card-highlight-a", "Highlight resultado A"],
    ["--result-card-highlight-b", "Highlight resultado B"],
    ["--player-neutral-bg", "Jugador neutro"],
    ["--player-neutral-border", "Borde jugador neutro"],
    ["--player-win-bg-top", "Jugador ganador arriba"],
    ["--player-win-bg-bottom", "Jugador ganador abajo"],
    ["--player-win-border", "Borde ganador"],
    ["--player-lose-bg-top", "Jugador perdedor arriba"],
    ["--player-lose-bg-bottom", "Jugador perdedor abajo"],
    ["--player-lose-border", "Borde perdedor"],
    ["--mkart-badge-bg", "Badge MKART"],
    ["--call-toast-border", "Borde popup"],
    ["--call-toast-glow", "Glow popup"],
    ["--call-toast-highlight-a", "Popup A"],
    ["--call-toast-highlight-b", "Popup B"]
  ];

  const TEXT_FIELDS = [
    ["--idle-fit", "Ajuste idle", "cover o contain"]
  ];

  const ASSET_FIELDS = [
    ["background", "Fondo general"],
    ["bracketOverlay", "Overlay bracket"],
    ["resultOverlay", "Overlay resultado"],
    ["championOverlay", "Overlay campeon"],
    ["idle", "Overlay idle"]
  ];

  const MESSAGE_FIELDS = [
    ["telegramMatchCalled", "Telegram · llamada a jugar"],
    ["telegramTournamentStartedCaption", "Telegram · caption inicio torneo"],
    ["telegramGameWin", "Telegram · partida ganada"],
    ["telegramMatchResolved", "Telegram · match resuelto"],
    ["telegramRoundCompletedCaption", "Telegram · caption ronda completa"],
    ["telegramTournamentCompleted", "Telegram · torneo completado"],
    ["telegramTournamentCompletedCaption", "Telegram · caption campeon"],
    ["telegramLadderCompleted", "Telegram · ladder completada"],
    ["telegramLadderCompletedCaption", "Telegram · caption ladder"],
    ["whatsappMatchCalled", "WhatsApp · llamada a jugar"],
    ["whatsappTournamentStartedCaption", "WhatsApp · caption inicio torneo"],
    ["whatsappGameWin", "WhatsApp · partida ganada"],
    ["whatsappMatchResolved", "WhatsApp · match resuelto"],
    ["whatsappRoundCompletedCaption", "WhatsApp · caption ronda completa"],
    ["whatsappTournamentCompleted", "WhatsApp · torneo completado"],
    ["whatsappTournamentCompletedCaption", "WhatsApp · caption campeon"],
    ["whatsappLadderCompleted", "WhatsApp · ladder completada"],
    ["whatsappLadderCompletedCaption", "WhatsApp · caption ladder"],
    ["webCallEyebrow", "Web popup · eyebrow"],
    ["webCallTitle", "Web popup · titulo"],
    ["webCallBody", "Web popup · cuerpo"],
    ["webCallMeta", "Web popup · meta"],
    ["webCallNote", "Web popup · nota"]
  ];

  let state = null;
  let selectedThemeId = null;
  let activeSection = ["display", "themes", "media", "messages", "access"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "display";
  const drafts = new Map();
  const dirtyForms = new Set();
  const savingForms = new Set();
  const formForPath = { "/settings/save": "display-settings-form", "/themes/save": "theme-form", "/messages/save": "messages-form" };
  function markDirty(event) {
    const form = event.target.closest("form");
    if (!form || !Object.values(formForPath).includes(form.id) || !event.target.name && event.target !== form) return;
    dirtyForms.add(draftKey(form));
    form.querySelector("[data-form-status]")?.replaceChildren(document.createTextNode("Cambios sin guardar"));
  }
  app.addEventListener("input", markDirty);
  app.addEventListener("change", markDirty);
  window.addEventListener("beforeunload", event => { if (dirtyForms.size) { event.preventDefault(); event.returnValue = ""; } });
  function draftKey(form) { return form.id + (form.id === "theme-form" ? ":" + (form.elements.namedItem("id")?.value || "new") : ""); }
  function formValues(form) {
    return [...form.elements].filter(input => input.name && !["file", "password", "submit"].includes(input.type)).map(input => [input.name, input.type === "checkbox" ? input.checked : input.value]);
  }
  function captureDrafts() {
    app.querySelectorAll("form").forEach(form => { if (dirtyForms.has(draftKey(form))) drafts.set(draftKey(form), formValues(form)); });
  }
  function restoreDrafts() {
    app.querySelectorAll("form").forEach(form => {
      for (const [name, value] of drafts.get(draftKey(form)) || []) {
        const input = form.elements.namedItem(name);
        if (input) { if (input.type === "checkbox") input.checked = value; else input.value = value; }
      }
      if (dirtyForms.has(draftKey(form))) form.querySelector("[data-form-status]")?.replaceChildren(document.createTextNode("Cambios sin guardar"));
    });
    if (dirtyForms.has("display-settings-form")) document.querySelector("[data-settings-status]").textContent = "Cambios sin guardar";
  }
  function showSection(section) {
    activeSection = section;
    app.querySelectorAll("[data-admin-section]").forEach(panel => { panel.hidden = panel.dataset.adminSection !== section; });
    app.querySelectorAll("[data-nav]").forEach(button => { button.classList.toggle("active", button.dataset.nav === section); button.setAttribute("aria-current", button.dataset.nav === section ? "page" : "false"); });
    history.replaceState(null, "", "#" + section);
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  async function api(path, options = {}, auth = true) {
    const form = formForPath[path] ? document.getElementById(formForPath[path]) : null;
    const key = form ? draftKey(form) : null;
    const sent = form ? JSON.stringify(formValues(form)) : null;
    if (key && savingForms.has(key)) throw new Error("Este formulario ya se está guardando.");
    if (key) { savingForms.add(key); form.querySelectorAll('[type="submit"]').forEach(button => { button.disabled = true; }); }
    try {
    const headers = new Headers(options.headers || {});
    if (auth) {
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const json = await response.json();
        message = json.message || message;
      } catch (_) {}
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    const result = response.status === 204 ? null : await response.json();
    const liveForm = form ? document.getElementById(form.id) : null;
    const latest = liveForm && draftKey(liveForm) === key ? formValues(liveForm) : drafts.get(key) || (form ? formValues(form) : null);
    if (key && sent === JSON.stringify(latest)) { drafts.delete(key); dirtyForms.delete(key); }
    return result;
    } finally {
      if (key) { savingForms.delete(key); form.querySelectorAll('[type="submit"]').forEach(button => { button.disabled = false; }); }
    }
  }

  function flash(message, type = "success") {
    document.querySelectorAll("body > .notice").forEach(notice => notice.remove());
    const banner = document.createElement("div");
    banner.className = `notice ${type}`;
    banner.textContent = message;
    banner.setAttribute("role", type === "error" ? "alert" : "status");
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 3500);
  }

  function toColor(value) {
    if (!value) return "#0f172a";
    if (value.startsWith("#") && (value.length === 4 || value.length === 7)) return value;
    const rgba = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!rgba) return "#0f172a";
    return `#${[rgba[1], rgba[2], rgba[3]]
      .map((part) => Number(part).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function isAbsoluteAssetUrl(value) {
    return /^([a-z]+:)?\/\//i.test(String(value || "")) || String(value || "").startsWith("data:") || String(value || "").startsWith("blob:");
  }

  function resolveAssetUrl(value) {
    if (!value) return "";
    return isAbsoluteAssetUrl(value) ? value : `${config.backendUrl}${value}`;
  }

  function isVideoAsset(value) {
    const normalized = String(value || "").split("#")[0].split("?")[0].toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => normalized.endsWith(ext));
  }

  function renderMediaPreview(value, alt, className = "") {
    const resolved = resolveAssetUrl(value);
    if (!resolved) return "";
    if (isVideoAsset(value)) {
      return `<video class="${escapeHtml(className)}" src="${escapeHtml(resolved)}" autoplay muted loop playsinline preload="metadata"></video>`;
    }
    return `<img class="${escapeHtml(className)}" src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}">`;
  }

  function selectedTheme() {
    if (!state?.themes?.length) return null;
    const exact = state.themes.find((theme) => theme.id === selectedThemeId);
    return exact || state.themes[0];
  }

  function createEmptyTheme() {
    return {
      id: "",
      key: "",
      name: "Tema nuevo",
      matchers: [],
      cssVars: {},
      assets: {}
    };
  }

  function allImageOptions(currentValue) {
    const builtin = (state.builtinImages || []).map((asset) => ({
      label: `[Base] ${asset.name}`,
      value: asset.url
    }));
    const uploaded = (state.images || []).map((asset) => ({
      label: `[Subida] ${asset.name}`,
      value: asset.url
    }));
    const options = [...builtin, ...uploaded];
    if (currentValue && !options.some((item) => item.value === currentValue)) {
      options.unshift({ label: `Actual: ${currentValue}`, value: currentValue });
    }
    return options;
  }

  function renderAssetSelect(field, currentValue) {
    const options = allImageOptions(currentValue);
    return `
      <div class="field">
        <label>${field[1]}</label>
        <select name="asset_${field[0]}">
          <option value="">Sin asset</option>
          ${options.map((item) => `
            <option value="${escapeHtml(item.value)}" ${item.value === currentValue ? "selected" : ""}>
              ${escapeHtml(item.label)}
            </option>`).join("")}
        </select>
      </div>`;
  }

  function cssPreviewStyle(theme) {
    return Object.entries(theme.cssVars || {})
      .map(([key, value]) => `${key}:${value}`)
      .join(";");
  }

  function renderThemePreview(theme) {
    const style = cssPreviewStyle(theme);
    const background = theme.assets?.background
      ? `<div class="theme-preview-bg">${renderMediaPreview(theme.assets.background, "", "theme-preview-media")}</div>`
      : "";
    const winnerLabel = theme.matchers?.length ? theme.matchers.join(", ") : "Sin tags";
    return `
      <div class="theme-preview" style="${escapeHtml(style)}">
        ${background}
        <div class="theme-preview-inner">
          <div class="theme-preview-header">
            <div>
              <div class="preview-eyebrow">Vista rapida</div>
              <div class="preview-title">${escapeHtml(theme.name || "Tema nuevo")}</div>
            </div>
            <div class="preview-chip">${escapeHtml(winnerLabel)}</div>
          </div>
          <div class="preview-body">
            <div class="preview-match">
              <div class="preview-match-head"><span>M1</span><span>COMPLETED</span></div>
              <div class="preview-entrant win"><span>Jugador A</span><strong>Gana</strong></div>
              <div class="preview-entrant lose"><span>Jugador B</span><strong>Pierde</strong></div>
            </div>
            <div class="preview-result">
              <div class="preview-result-card">
                <div class="preview-result-title">Resultado</div>
                <div class="preview-player winner">
                  <span>Ganador</span>
                  <strong>Jugador A</strong>
                </div>
                <div class="preview-player loser">
                  <span>Perdedor</span>
                  <strong>Jugador B</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderLogin(errorMessage = "") {
    app.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <h1>Display Admin</h1>
          <p class="muted">Panel de sonidos, imagenes y temas del display.</p>
          ${errorMessage ? `<div class="notice error">${escapeHtml(errorMessage)}</div>` : ""}
          <form id="login-form" class="grid">
            <div class="field">
              <label>Usuario</label>
              <input name="username" autocomplete="username" required>
            </div>
            <div class="field">
              <label>Contrasena</label>
              <input type="password" name="password" autocomplete="current-password" required>
            </div>
            <button class="btn" type="submit">Entrar</button>
          </form>
        </div>
      </div>`;

    document.getElementById("login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        const result = await api("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: form.get("username"),
            password: form.get("password")
          })
        }, false);
        setToken(result.token);
        await loadState();
      } catch (error) {
        renderLogin(error.message);
      }
    });
  }

  function renderThemeEditor() {
    const theme = structuredClone(selectedTheme() || createEmptyTheme());

    return `
      <div class="panel split" data-admin-section="themes">
        <div class="topbar">
          <div>
            <h2>Editor de temas</h2>
            <p class="muted">Crea temas nuevos, asigna tags y cambia colores o imagenes de forma visual.</p>
          </div>
          <div class="actions">
            <button class="btn secondary" id="new-theme-btn" type="button">Nuevo tema</button>
            <button class="btn secondary" id="duplicate-theme-btn" type="button">Duplicar</button>
            ${theme.id && theme.id !== "theme_base" ? `<button class="btn danger" id="delete-theme-btn" type="button">Eliminar tema</button>` : ""}
          </div>
        </div>
        <div class="section-grid">
          <div class="list" id="theme-list">
            ${state.themes.map((item) => `
              <button type="button" class="list-item ${item.id === theme.id ? "active" : ""}" data-theme-id="${escapeHtml(item.id)}">
                <strong>${escapeHtml(item.name)}</strong>
                <div class="asset-meta">${escapeHtml(item.key)}</div>
                <div class="asset-meta">${escapeHtml((item.matchers || []).join(", ") || "Sin tags")}</div>
              </button>`).join("")}
          </div>
          <div class="editor-stack">
            <div id="theme-preview-live">${renderThemePreview(theme)}</div>
            <form id="theme-form" class="grid">
              <input type="hidden" name="id" value="${escapeHtml(theme.id || "")}">
              <div class="grid two">
                <div class="field"><label>Clave interna</label><input name="key" value="${escapeHtml(theme.key || "")}" placeholder="mario-kart" required></div>
                <div class="field"><label>Nombre visible</label><input name="name" value="${escapeHtml(theme.name || "")}" placeholder="Mario Kart" required></div>
              </div>
              <div class="field">
                <label>Tags de aplicacion</label>
                <input name="matchers" value="${escapeHtml((theme.matchers || []).join(", "))}" placeholder="mario kart, mkart">
              </div>
              <div class="grid two">
                ${ASSET_FIELDS.map((field) => renderAssetSelect(field, theme.assets?.[field[0]] || "")).join("")}
              </div>
              <details class="theme-section" open>
                <summary>Colores y contraste</summary>
                <div class="theme-vars">
                  ${COLOR_FIELDS.map(([key, label]) => `
                    <div class="color-field">
                      <label>${label}</label>
                      <input type="color" name="color_${escapeHtml(key)}" value="${escapeHtml(toColor(theme.cssVars?.[key]))}">
                      <input name="raw_${escapeHtml(key)}" value="${escapeHtml(theme.cssVars?.[key] || "")}" placeholder="#000000 o rgba(...)">
                    </div>`).join("")}
                </div>
              </details>
              <div class="theme-section">
                <h3>Ajustes de texto</h3>
                <div class="theme-vars text-vars">
                  ${TEXT_FIELDS.map(([key, label, placeholder]) => `
                    <div class="color-field">
                      <label>${label}</label>
                      <input name="raw_${escapeHtml(key)}" value="${escapeHtml(theme.cssVars?.[key] || "")}" placeholder="${escapeHtml(placeholder)}">
                    </div>`).join("")}
                </div>
              </div>
              <div class="save-bar"><span data-form-status>Sin cambios pendientes</span>
                <button class="btn" type="submit">Guardar tema</button>
              </div>
            </form>
          </div>
        </div>
      </div>`;
  }

  function renderApp() {
    captureDrafts();
    const soundCards = (state.sounds || []).map((sound) => `
      <label class="asset-card selectable">
        <div><strong>${escapeHtml(sound.name)}</strong></div>
        <div class="asset-meta">${escapeHtml(sound.fileName)}</div>
        <audio controls src="${config.backendUrl}${sound.url}"></audio>
        <div><input type="radio" name="soundChoice" value="${escapeHtml(sound.id)}" ${state.selectedSoundId === sound.id ? "checked" : ""}> Usar este sonido</div>
      </label>`).join("");

    const imageCards = [...(state.builtinImages || []), ...(state.images || [])].map((image) => `
      <div class="asset-card">
        ${renderMediaPreview(image.url, image.name, "asset-preview")}
        <div><strong>${escapeHtml(image.name)}</strong></div>
        <div class="asset-meta">${escapeHtml(image.fileName)}</div>
      </div>`).join("");

    const sponsorCards = (state.sponsors || []).map((sponsor) => `
      <div class="asset-card sponsor-card">
        <img src="${config.backendUrl}${sponsor.url}" alt="${escapeHtml(sponsor.name)}">
        <div><strong>${escapeHtml(sponsor.name)}</strong></div>
        <div class="asset-meta">${escapeHtml(sponsor.fileName)}</div>
        <label class="toggle-row">
          <input type="checkbox" data-sponsor-active="${escapeHtml(sponsor.id)}" ${sponsor.active ? "checked" : ""}>
          <span>${sponsor.active ? "Activo" : "Oculto"}</span>
        </label>
        <button class="btn danger" type="button" data-sponsor-delete="${escapeHtml(sponsor.id)}">Eliminar</button>
      </div>`).join("");

    app.innerHTML = `
      <div class="shell admin-shell">
        <div class="hero">
          <div class="topbar">
            <div>
              <p class="overline">SMASH TOURNAMENTS</p>
              <h1>Control de pantallas</h1>
              <p>Bracket, identidad visual y avisos del evento.</p>
            </div>
            <div class="actions">
              <button class="btn secondary" id="refresh-btn" type="button">Refrescar</button>
              <a class="btn secondary" href="/" target="_blank" rel="noopener">Ver display ↗</a>
              <button class="btn secondary" id="logout-btn" type="button">Salir</button>
            </div>
          </div>
        </div>

        <div class="admin-layout"><nav class="admin-nav" aria-label="Secciones del administrador">
          ${[["display", "Pantalla y bracket", "Encuadre, densidad y tiempos"], ["themes", "Temas visuales", "Colores, fondos y overlays"], ["media", "Biblioteca", "Sonidos, imágenes y sponsors"], ["messages", "Mensajes", "Telegram, WhatsApp y pantalla"], ["access", "Acceso", "Usuario y contraseña"]].map(([key, title, detail]) => `<button type="button" data-nav="${key}"><strong>${title}</strong><span>${detail}</span></button>`).join("")}
        </nav><main class="admin-content">
        ${window.GTAdminDisplay.render(state)}
        <div class="panel" data-admin-section="access">
          <h2>Cuenta de gestión</h2><p class="muted">La misma cuenta sirve en las aplicaciones y en este panel.</p><a class="btn secondary" href="/account/">Mi cuenta y usuarios</a>
          <p class="muted">Usuario actual: <strong>${escapeHtml(state.username)}</strong></p>
          <form id="credentials-form" class="grid three">
            <div class="field"><label>Clave actual</label><input type="password" name="currentPassword"></div>
            <div class="field"><label>Usuario</label><input readonly name="username" value="${escapeHtml(state.username)}"></div>
            <div class="field"><label>Nueva contrasena</label><input type="password" name="password"></div>
            <div class="actions"><button class="btn" type="submit">Guardar acceso</button></div>
          </form>
        </div>

        <div class="panel" data-admin-section="media">
          <h2>Sonidos de llamada</h2>
          <p class="muted">Sube audio en el formato que prefieras y elige que sonido debe usar el display.</p>
          <form id="sound-upload-form" class="actions" enctype="multipart/form-data">
            <input type="file" name="file" accept="audio/*">
            <input type="text" name="name" placeholder="Nombre del sonido">
            <button class="btn" type="submit">Subir sonido</button>
          </form>
          <div class="asset-grid" style="margin-top:12px;">
            <label class="asset-card selectable">
              <div><strong>Original del display</strong></div>
              <div class="asset-meta">Usa el sonido configurado por defecto en la web</div>
              <div><input type="radio" name="soundChoice" value="" ${!state.selectedSoundId ? "checked" : ""}> Usar original</div>
            </label>
            ${soundCards || '<div class="muted">Todavia no hay sonidos subidos.</div>'}
          </div>
        </div>

        <div class="panel" data-admin-section="media">
          <h2>Media para temas</h2>
          <p class="muted">Sube imagenes o videos para usar como fondos y overlays del display.</p>
          <form id="image-upload-form" class="actions" enctype="multipart/form-data">
            <input type="file" name="file" accept="image/*,video/*">
            <input type="text" name="name" placeholder="Nombre del asset">
            <button class="btn" type="submit">Subir asset</button>
          </form>
          <label class="field asset-search"><span>Buscar en la biblioteca</span><input id="asset-search" type="search" placeholder="Nombre de imagen o vídeo"></label>
          <div class="asset-grid image-library" style="margin-top:14px;">${imageCards || '<div class="muted">Todavia no hay assets subidos.</div>'}</div>
        </div>

        <div class="panel" data-admin-section="media">
          <h2>Sponsors</h2>
          <p class="muted">Sube logos PNG/WebP/JPG y activa solo los que quieras mostrar arriba del display.</p>
          <form id="sponsor-upload-form" class="actions" enctype="multipart/form-data">
            <input type="file" name="file" accept="image/*">
            <input type="text" name="name" placeholder="Nombre del sponsor">
            <button class="btn" type="submit">Subir sponsor</button>
          </form>
          <div class="asset-grid" style="margin-top:14px;">${sponsorCards || '<div class="muted">Todavia no hay sponsors subidos.</div>'}</div>
        </div>

        <div class="panel" data-admin-section="messages">
          <h2>Mensajes y avisos</h2>
          <p class="muted">Puedes usar placeholders como <code>{{tournament_title}}</code>, <code>{{players_vs}}</code>, <code>{{station_label}}</code> (setup y zona), <code>{{setup_label}}</code>, <code>{{play_area_name}}</code>, <code>{{timeout_minutes}}</code>, <code>{{winner_name}}</code>, <code>{{match_label}}</code>, <code>{{score_text}}</code> y <code>{{round_title}}</code>.</p>
          <form id="messages-form" class="grid">
            <div class="message-tools"><label class="field"><span>Canal</span><select id="message-channel"><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="web">Pantalla</option></select></label><div class="message-example"><span>Ejemplo con datos ficticios</span><p id="message-example-text"></p></div></div>
            <div class="theme-vars text-vars">
              ${MESSAGE_FIELDS.map(([key, label]) => `
                <div class="color-field" data-message-channel="${key.startsWith("telegram") ? "telegram" : key.startsWith("whatsapp") ? "whatsapp" : "web"}">
                  <label>${label}</label>
                  <textarea name="msg_${escapeHtml(key)}">${escapeHtml(state.messageTemplates?.[key] || "")}</textarea>
                </div>`).join("")}
            </div>
            <div class="save-bar"><span data-form-status>Sin cambios pendientes</span>
              <button class="btn" type="submit">Guardar mensajes</button>
            </div>
          </form>
        </div>

        ${renderThemeEditor()}
        </main></div>
      </div>`;

    restoreDrafts();
    bindAppEvents();
    showSection(activeSection);
    window.GTAdminDisplay.bind(flash);
  }

  function bindThemeFieldSync() {
    document.querySelectorAll('input[type="color"][name^="color_"]').forEach((input) => {
      input.addEventListener("input", () => {
        const cssKey = input.name.replace("color_", "");
        const raw = document.querySelector(`input[name="raw_${CSS.escape(cssKey)}"]`);
        if (raw) raw.value = input.value;
      });
    });

    COLOR_FIELDS.forEach(([key]) => {
      const raw = document.querySelector(`input[name="raw_${CSS.escape(key)}"]`);
      const color = document.querySelector(`input[name="color_${CSS.escape(key)}"]`);
      if (!raw || !color) return;
      raw.addEventListener("input", () => {
        color.value = toColor(raw.value);
      });
    });
  }

  function bindAppEvents() {
    document.querySelectorAll("[data-nav]").forEach(button => button.addEventListener("click", () => showSection(button.dataset.nav)));
    document.getElementById("asset-search").addEventListener("input", event => {
      const query = event.target.value.trim().toLocaleLowerCase();
      document.querySelectorAll(".image-library .asset-card").forEach(card => { card.hidden = !card.textContent.toLocaleLowerCase().includes(query); });
    });
    const channel = document.getElementById("message-channel");
    const example = document.getElementById("message-example-text");
    const sample = { tournament_title: "Community Weekly", players_vs: "Alex vs. Cris", station_label: "Setup 3 · Escenario", setup_label: "Setup 3", play_area_name: "Escenario", timeout_minutes: "5", winner_name: "Alex", match_label: "Winners Semi-Final · A7", score_text: "2–1", round_title: "Winners Semi-Final", game_title: "Super Smash Bros. Ultimate", loser_name: "Cris", player_name: "Alex", match_name: "A7" };
    const showExample = textarea => { example.textContent = (textarea?.value || "Escribe una plantilla para ver el ejemplo.").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => sample[key] ?? match); };
    const changeChannel = () => {
      document.querySelectorAll("[data-message-channel]").forEach(field => { field.hidden = field.dataset.messageChannel !== channel.value; });
      showExample(document.querySelector(`[data-message-channel="${channel.value}"] textarea`));
    };
    channel.addEventListener("change", changeChannel); changeChannel();
    document.querySelectorAll("#messages-form textarea").forEach(input => {
      input.addEventListener("focus", () => showExample(input));
      input.addEventListener("input", () => showExample(input));
    });
    document.getElementById("logout-btn").addEventListener("click", () => {
      if (dirtyForms.size && !confirm("Hay cambios sin guardar. ¿Salir del administrador?")) return;
      void fetch(`${config.backendUrl}/api/management-auth/logout`, {method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:"{}"}).catch(()=>{});
      drafts.clear(); dirtyForms.clear(); state = null;
      loadVersion++;
      setToken(null);
      renderLogin();
    });

    document.getElementById("refresh-btn").addEventListener("click", () => loadState());

    document.getElementById("credentials-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        await api("/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword: form.get("currentPassword"),
            username: form.get("username"),
            password: form.get("password")
          })
        });
        flash("Credenciales actualizadas. Vuelve a iniciar sesion.", "success");
        drafts.clear(); dirtyForms.clear(); state = null;
        loadVersion++;
        setToken(null);
        renderLogin();
      } catch (error) {
        flash(error.message, "error");
      }
    });

    document.getElementById("sound-upload-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = new FormData(event.currentTarget);
      try {
        await api("/sounds/upload", { method: "POST", body });
        flash("Sonido subido", "success");
        await loadState();
      } catch (error) {
        flash(error.message, "error");
      }
    });

    document.getElementById("image-upload-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = new FormData(event.currentTarget);
      try {
        await api("/images/upload", { method: "POST", body });
        flash("Asset subido", "success");
        await loadState();
      } catch (error) {
        flash(error.message, "error");
      }
    });

    document.getElementById("sponsor-upload-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = new FormData(event.currentTarget);
      try {
        await api("/sponsors/upload", { method: "POST", body });
        flash("Sponsor subido", "success");
        await loadState();
      } catch (error) {
        flash(error.message, "error");
      }
    });

    document.querySelectorAll('input[name="soundChoice"]').forEach((input) => {
      input.addEventListener("change", async (event) => {
        try {
          await api("/sounds/select", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ soundId: event.target.value || null })
          });
          flash("Sonido seleccionado", "success");
          await loadState();
        } catch (error) {
          flash(error.message, "error");
        }
      });
    });

    document.querySelectorAll("[data-sponsor-active]").forEach((input) => {
      input.addEventListener("change", async (event) => {
        const sponsorId = event.target.getAttribute("data-sponsor-active");
        try {
          await api(`/sponsors/${sponsorId}/active`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: event.target.checked })
          });
          flash("Estado del sponsor actualizado", "success");
          await loadState();
        } catch (error) {
          flash(error.message, "error");
        }
      });
    });

    document.querySelectorAll("[data-sponsor-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        const sponsorId = button.getAttribute("data-sponsor-delete");
        if (!confirm("¿Eliminar este patrocinador y su imagen?")) return;
        try {
          await api(`/sponsors/${sponsorId}/delete`, { method: "POST" });
          flash("Sponsor eliminado", "success");
          await loadState();
        } catch (error) {
          flash(error.message, "error");
        }
      });
    });

    document.getElementById("messages-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = {};
      MESSAGE_FIELDS.forEach(([key]) => {
        payload[key] = String(form.get(`msg_${key}`) || "");
      });
      try {
        await api("/messages/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        flash("Mensajes guardados", "success");
        await loadState();
      } catch (error) {
        flash(error.message, "error");
      }
    });

    document.getElementById("display-settings-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = window.GTAdminDisplay.read(event.currentTarget);
      try {
        await api("/settings/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        flash("Ajustes guardados. Las pantallas los recibirán en unos segundos.", "success");
        await loadState();
      } catch (error) {
        flash(error.message, "error");
      }
    });

    document.querySelectorAll("[data-theme-id]").forEach((node) => {
      node.addEventListener("click", () => {
        selectedThemeId = node.getAttribute("data-theme-id");
        renderApp();
      });
    });

    document.getElementById("new-theme-btn").addEventListener("click", () => {
      captureDrafts();
      if (dirtyForms.has("theme-form:new") && !confirm("¿Descartar el tema nuevo sin guardar?")) return;
      drafts.delete("theme-form:new"); dirtyForms.delete("theme-form:new");
      const fresh = createEmptyTheme();
      state = {
        ...state,
        themes: [fresh, ...state.themes.filter((theme) => theme.id)]
      };
      selectedThemeId = "";
      renderApp();
    });

    document.getElementById("duplicate-theme-btn").addEventListener("click", () => {
      if (dirtyForms.has("theme-form:new") && !confirm("¿Descartar el tema nuevo sin guardar?")) return;
      const source = readThemeForm(document.getElementById("theme-form"));
      captureDrafts();
      drafts.delete("theme-form:new"); dirtyForms.delete("theme-form:new");
      const copy = { ...source, id: "", key: `${source.key}-copia`, name: `${source.name} · copia` };
      state.themes = [copy, ...state.themes.filter(theme => theme.id)];
      selectedThemeId = "";
      renderApp();
      document.getElementById("theme-form").dispatchEvent(new Event("input", { bubbles: true }));
    });

    const deleteThemeBtn = document.getElementById("delete-theme-btn");
    if (deleteThemeBtn) {
      deleteThemeBtn.addEventListener("click", async () => {
        const theme = selectedTheme();
        if (!theme?.id || theme.id === "theme_base") return;
        if (!confirm(`¿Eliminar el tema «${theme.name}»?`)) return;
        try {
          await api(`/themes/${theme.id}/delete`, { method: "POST" });
          drafts.delete(`theme-form:${theme.id}`); dirtyForms.delete(`theme-form:${theme.id}`);
          flash("Tema eliminado", "success");
          await loadState();
        } catch (error) {
          flash(error.message, "error");
        }
      });
    }

    bindThemeFieldSync();
    const updateThemePreview = () => { document.getElementById("theme-preview-live").innerHTML = renderThemePreview(readThemeForm(document.getElementById("theme-form"))); };
    document.getElementById("theme-form").addEventListener("input", updateThemePreview);
    document.getElementById("theme-form").addEventListener("change", updateThemePreview);
    updateThemePreview();

    document.getElementById("theme-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = readThemeForm(event.currentTarget);
      const formKey = draftKey(event.currentTarget);
      try {
        const saved = await api("/themes/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: payload.id || undefined })
        });
        if (!dirtyForms.has(formKey)) selectedThemeId = saved.id;
        flash("Tema guardado", "success");
        await loadState();
      } catch (error) {
        flash(error.message, "error");
      }
    });
  }

  function readThemeForm(element) {
    const form = new FormData(element);
    const cssVars = { ...(selectedTheme()?.cssVars || {}) };
    [...COLOR_FIELDS, ...TEXT_FIELDS].forEach(([key]) => {
      const value = String(form.get(`raw_${key}`) || "").trim();
      if (value) cssVars[key] = value; else delete cssVars[key];
    });
    const assets = {};
    ASSET_FIELDS.forEach(([key]) => { const value = String(form.get(`asset_${key}`) || "").trim(); if (value) assets[key] = value; });
    return { id: String(form.get("id") || ""), key: String(form.get("key") || "").trim(), name: String(form.get("name") || "").trim(), matchers: String(form.get("matchers") || "").split(",").map(value => value.trim()).filter(Boolean), cssVars, assets };
  }

  let loadVersion = 0;
  async function loadState() {
    const version = ++loadVersion;
    try {
      const next = await api("/state");
      if (version !== loadVersion) return;
      const newTheme = state?.themes.find(theme => !theme.id);
      if (newTheme && dirtyForms.has("theme-form:new")) next.themes.unshift(newTheme);
      state = next;
      if (selectedThemeId === null || !state.themes.some((theme) => theme.id === selectedThemeId)) {
        selectedThemeId = state.themes[0]?.id || null;
      }
      renderApp();
    } catch (error) {
      if (version !== loadVersion) return;
      if (error.status === 401 || error.status === 403) {
        setToken(null);
        renderLogin(error.message);
      } else if (state) {
        flash("No se pudo actualizar. Se conserva la sesión y los datos mostrados.", "error");
      } else {
        app.innerHTML = '<div class="notice error">No se pudo conectar. Tu sesión se conserva.</div><button class="btn" id="retry-load" type="button">Reintentar</button>';
        document.getElementById("retry-load").addEventListener("click", loadState);
      }
    }
  }

  if (getToken()) {
    loadState();
  } else {
    renderLogin();
  }
})();
