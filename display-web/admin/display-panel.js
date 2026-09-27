(function () {
  const settings = window.GTDisplaySettings;
  const select = (name, label, choices, value, hint = "") => `<label class="field"><span>${label}</span><select name="${name}">${choices.map(([key, text]) => `<option value="${key}" ${key === value ? "selected" : ""}>${text}</option>`).join("")}</select>${hint ? `<small>${hint}</small>` : ""}</label>`;
  const number = (name, label, value, min, max, unit = "") => `<label class="field"><span>${label}</span><div class="number-unit"><input name="${name}" type="number" min="${min}" max="${max}" value="${value}" required><span>${unit}</span></div></label>`;
  const toggle = (name, label, value) => `<label class="setting-toggle"><span>${label}</span><input name="${name}" type="checkbox" ${value ? "checked" : ""}></label>`;
  function render(state) {
    const p = settings.normalize(state.displaySettings);
    return `<section class="panel display-panel" data-admin-section="display">
      <div class="section-heading"><div><p class="overline">MAIN DISPLAY</p><h2>A readable bracket</h2><p>Choose how much to show. Saved changes apply to displays using administrator settings.</p></div><span class="status-pill" data-settings-status>Saved</span></div>
      <div class="preset-grid" aria-label="Quick settings">
        ${[["balanced", "Balanced", "Connected branches and comfortable reading"], ["dense", "More matches", "Compact cards, fewer pages"], ["venue", "Distance reading", "Large names and slow rotation"], ["overview", "Full overview", "The full path through each bracket"]].map(([key, title, body]) => `<button type="button" class="preset" data-preset="${key}"><strong>${title}</strong><span>${body}</span></button>`).join("")}
      </div>
      <div class="display-editor-grid"><form id="display-settings-form" class="grid">
        <fieldset><legend>Bracket</legend><div class="grid two">
          ${select("bracketRenderMode", "Representation", [["modern", "Modern · with connectors"], ["classic", "Classic · columns"]], state.bracketRenderMode || "classic")}
          ${select("bracketLayout", "Winners and losers", [["separate", "Separate scenes"], ["combined", "Combined, losers below"]], p.bracketLayout, "Separate: each bracket uses the full height.")}
          ${select("bracketViewport", "Framing", [["focus", "Connected branches"], ["overview", "Full bracket"]], p.bracketViewport, "Full overview may make text very small in large tournaments.")}
          ${select("bracketDensity", "Density", [["balanced", "Balanced"], ["compact", "More matches"], ["comfortable", "Large text"]], p.bracketDensity)}
          ${number("bracketRounds", "Maximum rounds per page", p.bracketRounds, 2, 8)}
          ${number("bracketRows", "Maximum matches per column", p.bracketRows, 2, 12)}
          ${number("textScale", "Text size", p.textScale, 80, 150, "%")}
        </div><p class="help">The final count adapts to available space and names. Later rounds stay with their source matches.</p></fieldset>
        <fieldset><legend>Content and rotation</legend><div class="grid two">
          ${toggle("compactHeader", "Compact header", p.compactHeader)}${toggle("showSponsors", "Show sponsors", p.showSponsors)}
          ${toggle("showCharacters", "Show characters", p.showCharacters)}${toggle("includeSetups", "Include setup scenes", p.includeSetups)}${toggle("includeLadder", "Include ladder scenes", p.includeLadder)}
          ${toggle("showResults", "Interrupt with results", p.showResults)}${toggle("showCalls", "Show match calls", p.showCalls)}
          ${toggle("reduceMotion", "Reduce motion", p.reduceMotion)}
        </div><div class="grid three timing-fields">
          ${number("bracketSeconds", "Bracket / setups", p.bracketSeconds, 5, 120, "s")}
          ${number("resultSeconds", "Result", p.resultSeconds, 5, 60, "s")}
          ${number("callSeconds", "Call", p.callSeconds, 5, 60, "s")}
        </div>${number("soundVolume", "Match call volume", p.soundVolume, 0, 100, "%")}<p class="help">The browser requires you to enable audio on each display.</p></fieldset>
        <div class="save-bar"><span class="form-status" data-form-status>No pending changes</span><button class="btn" type="submit">Save settings</button></div>
      </form><aside class="preview-panel">
        <div class="topbar"><h3>Preview</h3><select aria-label="Preview resolution" id="preview-resolution"><option value="1920,1080">Full HD · 1920 × 1080</option><option value="3840,2160">4K · 3840 × 2160</option><option value="1080,1920">Vertical · 1080 × 1920</option></select></div>
        <div class="display-preview-frame" id="display-preview-frame"><div class="preview-placeholder"><span>PREVIEW BEFORE SAVING</span><p>Settings appear here alongside the display tournaments.</p><button class="btn secondary" type="button" id="load-preview">Load preview</button></div></div>
        <div class="actions"><button class="btn secondary" type="button" id="next-preview" disabled>Next scene</button><a class="btn secondary" href="/" target="_blank" rel="noopener">Open display ↗</a></div>
        <p class="help">Try settings without changing event displays. The preview does not play sounds or notifications.</p>
        <div class="screen-link"><h3>One address per display</h3><label class="field"><span>Display name</span><input id="screen-name" value="main" maxlength="60" placeholder="stage, entrance…"></label><div class="actions"><button class="btn secondary" type="button" id="copy-screen-link">Copy link</button><a id="open-screen-link" target="_blank" rel="noopener">Open ↗</a></div><output id="screen-link-value"></output><p class="help">Each name keeps its preferences in the browser on that display.</p></div>
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
    form.addEventListener("input", () => { document.querySelector("[data-settings-status]").textContent = "Unsaved changes"; highlightPresets(); send(); });
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
      iframe.title = "Display preview";
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
      const url = new URL("/", location.href); url.searchParams.set("screen", name.value.trim() || "main");
      document.getElementById("screen-link-value").textContent = url.href;
      document.getElementById("open-screen-link").href = url.href;
      return url.href;
    }
    name.addEventListener("input", updateLink); updateLink();
    document.getElementById("copy-screen-link").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(updateLink()); onNotice("Link copied"); }
      catch (_) { onNotice("Select and copy the address below.", "error"); }
    });
  }
  window.GTAdminDisplay = { render, read, bind };
})();
