(function () {
  const settings = window.GTDisplaySettings;
  const select = (name, label, choices, value, hint = "") => `<label class="field"><span>${label}</span><select name="${name}">${choices.map(([key, text]) => `<option value="${key}" ${key === value ? "selected" : ""}>${text}</option>`).join("")}</select>${hint ? `<small>${hint}</small>` : ""}</label>`;
  const number = (name, label, value, min, max, unit = "") => `<label class="field"><span>${label}</span><div class="number-unit"><input name="${name}" type="number" min="${min}" max="${max}" value="${value}" required><span>${unit}</span></div></label>`;
  const toggle = (name, label, value) => `<label class="setting-toggle"><span>${label}</span><input name="${name}" type="checkbox" ${value ? "checked" : ""}></label>`;
  function render(state) {
    const p = settings.normalize(state.displaySettings);
    return `<section class="panel display-panel" data-admin-section="display">
      <div class="section-heading"><div><p class="overline">PANTALLA PRINCIPAL</p><h2>Una bracket que se entiende</h2><p>Elige cuánto mostrar. Los cambios guardados se aplican a las pantallas que usan los ajustes del administrador.</p></div><span class="status-pill" data-settings-status>Guardado</span></div>
      <div class="preset-grid" aria-label="Ajustes rápidos">
        ${[["balanced", "Equilibrado", "Ramas conectadas y lectura cómoda"], ["dense", "Más matches", "Tarjetas compactas, menos páginas"], ["venue", "Lectura a distancia", "Nombres grandes y rotación lenta"], ["overview", "Vista completa", "Todo el recorrido de cada bracket"]].map(([key, title, body]) => `<button type="button" class="preset" data-preset="${key}"><strong>${title}</strong><span>${body}</span></button>`).join("")}
      </div>
      <div class="display-editor-grid"><form id="display-settings-form" class="grid">
        <fieldset><legend>Bracket</legend><div class="grid two">
          ${select("bracketRenderMode", "Representación", [["modern", "Moderna · con conectores"], ["classic", "Clásica · columnas"]], state.bracketRenderMode || "classic")}
          ${select("bracketLayout", "Winners y losers", [["separate", "Escenas separadas"], ["combined", "Juntos, losers debajo"]], p.bracketLayout, "Separadas: cada bracket aprovecha toda la altura.")}
          ${select("bracketViewport", "Encuadre", [["focus", "Por ramas conectadas"], ["overview", "Bracket completa"]], p.bracketViewport, "La vista completa puede reducir mucho el texto en torneos grandes.")}
          ${select("bracketDensity", "Densidad", [["balanced", "Equilibrada"], ["compact", "Más matches"], ["comfortable", "Texto grande"]], p.bracketDensity)}
          ${number("bracketRounds", "Máximo de rondas por página", p.bracketRounds, 2, 8)}
          ${number("bracketRows", "Máximo de matches por columna", p.bracketRows, 2, 12)}
          ${number("textScale", "Tamaño de texto", p.textScale, 80, 150, "%")}
        </div><p class="help">El número final se adapta al espacio y a los nombres. Las rondas siguientes acompañan a sus matches de origen.</p></fieldset>
        <fieldset><legend>Contenido y rotación</legend><div class="grid two">
          ${toggle("compactHeader", "Cabecera compacta", p.compactHeader)}${toggle("showSponsors", "Mostrar patrocinadores", p.showSponsors)}
          ${toggle("showCharacters", "Mostrar personajes", p.showCharacters)}${toggle("includeSetups", "Intercalar setups", p.includeSetups)}${toggle("includeLadder", "Intercalar ladder", p.includeLadder)}
          ${toggle("showResults", "Interrumpir con resultados", p.showResults)}${toggle("showCalls", "Mostrar llamadas a jugar", p.showCalls)}
          ${toggle("reduceMotion", "Reducir animaciones", p.reduceMotion)}
        </div><div class="grid three timing-fields">
          ${number("bracketSeconds", "Bracket / setups", p.bracketSeconds, 5, 120, "s")}
          ${number("resultSeconds", "Resultado", p.resultSeconds, 5, 60, "s")}
          ${number("callSeconds", "Llamada", p.callSeconds, 5, 60, "s")}
        </div>${number("soundVolume", "Volumen de llamadas", p.soundVolume, 0, 100, "%")}<p class="help">El navegador necesita que actives el audio desde cada pantalla.</p></fieldset>
        <div class="save-bar"><span class="form-status" data-form-status>Sin cambios pendientes</span><button class="btn" type="submit">Guardar ajustes</button></div>
      </form><aside class="preview-panel">
        <div class="topbar"><h3>Previsualización</h3><select aria-label="Resolución de previsualización" id="preview-resolution"><option value="1920,1080">Full HD · 1920 × 1080</option><option value="3840,2160">4K · 3840 × 2160</option><option value="1080,1920">Vertical · 1080 × 1920</option></select></div>
        <div class="display-preview-frame" id="display-preview-frame"><div class="preview-placeholder"><span>PRUEBA ANTES DE GUARDAR</span><p>Los ajustes se muestran aquí con los torneos del display.</p><button class="btn secondary" type="button" id="load-preview">Cargar previsualización</button></div></div>
        <div class="actions"><button class="btn secondary" type="button" id="next-preview" disabled>Siguiente escena</button><a class="btn secondary" href="/" target="_blank" rel="noopener">Abrir display ↗</a></div>
        <p class="help">Prueba los ajustes sin cambiar las pantallas del evento. La vista previa no reproduce sonidos ni avisos.</p>
        <div class="screen-link"><h3>Una dirección por pantalla</h3><label class="field"><span>Nombre de pantalla</span><input id="screen-name" value="principal" maxlength="60" placeholder="escenario, entrada…"></label><div class="actions"><button class="btn secondary" type="button" id="copy-screen-link">Copiar enlace</button><a id="open-screen-link" target="_blank" rel="noopener">Abrir ↗</a></div><output id="screen-link-value"></output><p class="help">Cada nombre conserva sus preferencias en el navegador de esa pantalla.</p></div>
      </aside></div></section>`;
  }
  function read(form) {
    const data = new FormData(form);
    const p = Object.fromEntries(Object.entries(settings.defaults).map(([key, value]) => [key, typeof value === "boolean" ? data.has(key) : typeof value === "number" ? Number(data.get(key)) : String(data.get(key))]));
    return { bracketRenderMode: String(data.get("bracketRenderMode")), displaySettings: settings.normalize(p) };
  }
  let resizeObserver;
  function bind(onNotice) {
    resizeObserver?.disconnect();
    const form = document.getElementById("display-settings-form");
    const frame = document.getElementById("display-preview-frame");
    const resolution = document.getElementById("preview-resolution");
    let iframe;
    const send = () => iframe?.contentWindow?.postMessage({ type: "GT_DISPLAY_PREVIEW", settings: { ...read(form).displaySettings, bracketRenderMode: read(form).bracketRenderMode } }, location.origin);
    function resize() {
      if (!iframe) return;
      const [width, height] = resolution.value.split(",").map(Number);
      frame.style.aspectRatio = `${width} / ${height}`;
      iframe.style.width = `${width}px`; iframe.style.height = `${height}px`;
      iframe.style.transform = `scale(${frame.clientWidth / width})`;
    }
    const highlightPresets = () => {
      const values = read(form).displaySettings;
      document.querySelectorAll("[data-preset]").forEach(button => {
        const active = Object.entries(settings.presets[button.dataset.preset]).every(([key, value]) => values[key] === value);
        button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
      });
    };
    highlightPresets();
    form.addEventListener("input", () => { document.querySelector("[data-settings-status]").textContent = "Cambios sin guardar"; highlightPresets(); send(); });
    form.addEventListener("change", send);
    document.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => {
      const preset = settings.presets[button.dataset.preset];
      for (const [key, value] of Object.entries(preset)) {
        const input = form.elements.namedItem(key);
        if (input.type === "checkbox") input.checked = value; else input.value = value;
      }
      form.elements.namedItem("bracketRenderMode").value = "modern";
      form.dispatchEvent(new Event("input", { bubbles: true }));
    }));
    document.getElementById("load-preview").addEventListener("click", () => {
      iframe = document.createElement("iframe");
      iframe.title = "Previsualización del display";
      iframe.src = "/?preview=1&screen=admin-preview";
      iframe.addEventListener("load", () => { resize(); send(); });
      frame.replaceChildren(iframe);
      document.getElementById("next-preview").disabled = false;
      resizeObserver = new ResizeObserver(resize); resizeObserver.observe(frame);
    });
    resolution.addEventListener("change", resize);
    document.getElementById("next-preview").addEventListener("click", () => iframe?.contentWindow?.postMessage({ type: "GT_DISPLAY_PREVIEW_NEXT" }, location.origin));
    const name = document.getElementById("screen-name");
    function updateLink() {
      const url = new URL("/", location.href); url.searchParams.set("screen", name.value.trim() || "principal");
      document.getElementById("screen-link-value").textContent = url.href;
      document.getElementById("open-screen-link").href = url.href;
      return url.href;
    }
    name.addEventListener("input", updateLink); updateLink();
    document.getElementById("copy-screen-link").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(updateLink()); onNotice("Enlace copiado"); }
      catch (_) { onNotice("Selecciona y copia la dirección que aparece debajo.", "error"); }
    });
  }
  window.GTAdminDisplay = { render, read, bind };
})();
