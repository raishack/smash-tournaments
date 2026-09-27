(function (root) {
  "use strict";
  const defaults = {
    bracketLayout: "separate", bracketDensity: "balanced", bracketViewport: "focus",
    bracketRounds: 4, bracketRows: 6, textScale: 100, compactHeader: true,
    showSponsors: true, showCharacters: true, includeSetups: true, includeLadder: true, showResults: true,
    showCalls: true, reduceMotion: false, bracketSeconds: 19, resultSeconds: 11,
    callSeconds: 12, soundVolume: 75,
  };
  const choices = { bracketLayout: ["separate", "combined"], bracketDensity: ["comfortable", "balanced", "compact"], bracketViewport: ["focus", "overview"] };
  const ranges = { bracketRounds: [2, 8], bracketRows: [2, 12], textScale: [80, 150], bracketSeconds: [5, 120], resultSeconds: [5, 60], callSeconds: [5, 60], soundVolume: [0, 100] };
  function normalize(value = {}) {
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
      const item = value?.[key];
      if (choices[key]) return [key, choices[key].includes(item) ? item : fallback];
      if (ranges[key]) return [key, typeof item === "number" && Number.isFinite(item) ? Math.round(Math.max(ranges[key][0], Math.min(ranges[key][1], item))) : fallback];
      return [key, typeof item === "boolean" ? item : fallback];
    }));
  }
  const presets = {
    balanced: { ...defaults },
    overview: { ...defaults, bracketDensity: "compact", bracketViewport: "overview", includeSetups: false },
    venue: { ...defaults, bracketDensity: "comfortable", bracketRows: 4, bracketRounds: 3, textScale: 120, bracketSeconds: 25 },
    dense: { ...defaults, bracketDensity: "compact", bracketRows: 8, bracketRounds: 5, includeSetups: false },
  };
  const api = { defaults, normalize, presets };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GTDisplaySettings = api;
})(typeof window !== "undefined" ? window : globalThis);
