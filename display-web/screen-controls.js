(function () {
  const screenId = new URLSearchParams(window.location.search).get("screen");
  const key = "main-display-screen-v1" + (screenId ? `:${screenId}` : "");
  const defaults = { tournamentId: "", view: "rotation", sceneKey: "", paused: false, ...window.GTDisplaySettings.defaults };
  let overrides = {};
  let remote = {};
  try { overrides = JSON.parse(localStorage.getItem(key) || "{}"); } catch (_) {}
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) overrides = {};
  for (const field of Object.keys(overrides)) if (!(field in defaults)) delete overrides[field];
  const normalized = window.GTDisplaySettings.normalize(overrides);
  for (const field of Object.keys(normalized)) if (field in overrides) overrides[field] = normalized[field];
  let settings = { ...defaults, ...overrides };
  for (const name of ["tournamentId", "sceneKey"]) if (typeof settings[name] !== "string") settings[name] = "";
  if (!["rotation", "bracket", "setups", "ladder"].includes(settings.view)) settings.view = "rotation";
  settings.paused = settings.paused === true;
  for (const field of ["tournamentId", "sceneKey", "view", "paused"]) if (field in overrides) overrides[field] = settings[field];
  window.GTScreenControls = function (onChange, onNext) {
    const panel = document.createElement("details");
    panel.className = "screen-controls";
    panel.innerHTML = `<summary title="Display settings" aria-label="Display settings">Display settings</summary><div class="screen-controls-body">
      <label>Tournament<select data-field="tournamentId"><option value="">All tournaments</option></select></label>
      <label>View<select data-field="view"><option value="rotation">Full rotation</option><option value="bracket">Bracket only</option><option value="setups">Setups only</option><option value="ladder">Ladder only</option></select></label>
      <label>Pin page<select data-field="sceneKey"><option value="">All pages</option></select></label>
      <label>Winners and losers<select data-field="bracketLayout"><option value="separate">Separate scenes</option><option value="combined">Together in one scene</option></select></label>
      <label>Framing<select data-field="bracketViewport"><option value="focus">Connected branches</option><option value="overview">Full bracket</option></select></label>
      <label>Density<select data-field="bracketDensity"><option value="comfortable">Large text</option><option value="balanced">Balanced</option><option value="compact">More matches</option></select></label>
      <label>Text size (%)<input data-field="textScale" type="number" min="80" max="150" step="5"></label>
      <label>Bracket / setups (segundos)<input data-field="bracketSeconds" type="number" min="5" max="120"></label>
      <label>Results (seconds)<input data-field="resultSeconds" type="number" min="5" max="60"></label>
      <label>Notifications (seconds)<input data-field="callSeconds" type="number" min="5" max="60"></label>
      <label class="screen-pause"><input data-field="paused" type="checkbox">Pause rotation (data continues updating)</label>
      <div class="screen-control-actions"><button type="button" data-next>Next</button><button type="button" data-fullscreen>Fullscreen</button></div>
      <button type="button" data-reset>Use administrator settings</button>
      <p class="screen-control-note">Changes here affect only this display.</p></div>`;
    document.body.appendChild(panel);
    function fill() {
      panel.querySelectorAll("[data-field]").forEach(input => {
        if (input.type === "checkbox") input.checked = settings[input.dataset.field];
        else input.value = settings[input.dataset.field];
      });
    }
    panel.addEventListener("change", event => {
      const input = event.target;
      const field = input.dataset.field;
      if (!field) return;
      const value = input.type === "checkbox" ? input.checked : input.type === "number" ? Math.min(Number(input.max), Math.max(Number(input.min), Number(input.value) || defaults[field])) : input.value;
      if (settings[field] === value) return;
      settings[field] = value;
      overrides[field] = value;
      if (["tournamentId", "view", "bracketLayout", "bracketViewport", "bracketDensity", "textScale"].includes(field)) { settings.sceneKey = ""; overrides.sceneKey = ""; }
      fill();
      try { localStorage.setItem(key, JSON.stringify(overrides)); } catch (_) {}
      onChange(field);
    });
    panel.querySelector("[data-next]").addEventListener("click", onNext);
    panel.querySelector("[data-reset]").addEventListener("click", () => {
      overrides = {};
      Object.assign(settings, defaults, remote);
      try { localStorage.removeItem(key); } catch (_) {}
      fill(); onChange("reset");
    });
    panel.querySelector("[data-fullscreen]").addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        else panel.querySelector(".screen-control-note").textContent = "Use browser fullscreen mode.";
      } catch (_) { panel.querySelector(".screen-control-note").textContent = "Use browser fullscreen mode."; }
    });
    let signature = "";
    fill();
    return { settings, applyRemote(value) {
      remote = window.GTDisplaySettings.normalize(value);
      Object.assign(settings, defaults, remote, overrides);
      Object.assign(settings, window.GTDisplaySettings.normalize(settings));
      fill();
    }, update(tournaments, scenes) {
      const next = JSON.stringify([tournaments.map(t => [t.id, t.title]), scenes.map(s => [s.key, s.label])]);
      if (next === signature) return;
      signature = next;
      for (const [field, entries, empty] of [["tournamentId", tournaments.map(t => [t.id, t.title]), "All tournaments"], ["sceneKey", scenes.map(s => [s.key, s.label]), "All pages"]]) {
        const select = panel.querySelector(`[data-field="${field}"]`);
        select.replaceChildren(new Option(empty, ""), ...entries.map(([value, label]) => new Option(label, value)));
        if (settings[field] && !entries.some(([value]) => value === settings[field])) select.appendChild(new Option("Selection unavailable", settings[field]));
      }
      fill();
    } };
  };
})();
