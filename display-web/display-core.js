(function (root) {
  "use strict";
  function characters(match, participantId) {
    const games = [...(match.gameCharacterSelections || [])].sort((a, b) => b.gameNum - a.gameNum);
    const selections = games.map(game => game.selections || []).find(items => items.some(item => item.participantId === participantId)) || match.characterSelections || [];
    return selections.filter(item => item.participantId === participantId).flatMap(item => String(item.characterName || "").split("/").map(name => name.trim()).filter(Boolean));
  }

  function paginateSections(sections, width, height, scale, options = {}) {
    const clusters = sections.flatMap(section => section.clusters.map(cluster => ({ ...cluster, label: cluster.label || section.label })));
    if (!clusters.length) return [];
    if (options.bracketViewport === "overview") return options.bracketLayout === "combined" ? [sections] : clusters.map(cluster => [{ id: cluster.id, label: cluster.label, clusters: [cluster] }]);
    const combined = options.bracketLayout === "combined";
    const density = options.bracketDensity || "balanced";
    const baseCardWidth = density === "comfortable" ? 370 : density === "compact" ? 300 : 320;
    const maxColumns = Math.max(1, Math.min(options.bracketRounds || 4, Math.floor((width / scale - 24) / (baseCardWidth + 36))));
    const clusterHeight = height / scale / (combined ? clusters.length : 1) - 75;
    const pages = clusters.map(cluster => {
      const result = [];
      for (let col = 0; col < cluster.columns.length; col += maxColumns) {
        const columns = cluster.columns.slice(col, col + maxColumns);
        const cardWidth = Math.max(baseCardWidth, Math.min(baseCardWidth * 1.25, (width / scale - 24 - 36 * (columns.length - 1)) / columns.length));
        const largestCard = Math.max(90, ...columns.flatMap(column => column.matches.map(match => {
          const entrants = match.participants || [];
          const line = density === "comfortable" ? 25 : density === "compact" ? 19 : 21;
          return 36 + entrants.reduce((sum, p) => {
            const iconWidth = options.showCharacters === false ? 0 : Math.min(4, characters(match, p.participantId).length) * 20;
            const chars = Math.max(14, Math.floor((cardWidth - 65 - iconWidth) / (line * 0.46)));
            return sum + 6 + Math.max(1, Math.ceil(Array.from(p.displayName || "Pending").length / chars)) * line;
          }, 0);
        })));
        const rows = Math.max(1, Math.min(options.bracketRows || 6, Math.floor(clusterHeight / (largestCard + 12))));
        const count = columns[0].matches.length;
        const windowIds = new Set(columns.flatMap(column => column.matches.map(match => match.id)));
        for (let row = 0; row < count; row += rows) {
          const selected = new Set();
          const branchColumns = columns.map((column, index) => {
            const matches = column.matches.filter((match, matchIndex) => {
              if (!index) return matchIndex >= row && matchIndex < row + rows;
              const sources = (match.displaySourceIds || []).filter(id => windowIds.has(id));
              if (sources.length) return sources.some(id => selected.has(id));
              // Unresolved imports can lack edges. Keep proportional round ranges
              // instead of cutting the same row indices from every round.
              const start = matchIndex * count / column.matches.length;
              const end = (matchIndex + 1) * count / column.matches.length;
              return start < row + rows && end > row;
            });
            matches.forEach(match => selected.add(match.id));
            return { ...column, sourceStartIndex: column.matches.indexOf(matches[0]), matches };
          }).filter(column => column.matches.length);
          result.push({ ...cluster, cardWidth, pageKey: `${cluster.id}:${col}:${row}`, branchIndex: Math.floor(row / rows), branchCount: Math.ceil(count / rows), roundStart: col, allRoundTitles: cluster.columns.map(column => column.title), columns: branchColumns });
        }
      }
      return result;
    });
    if (!combined) return pages.flat().map(cluster => [{ id: cluster.pageKey, label: cluster.label, clusters: [cluster] }]);
    const count = Math.max(...pages.map(items => items.length));
    return Array.from({ length: count }, (_, index) => [{
      id: `page:${index}`, label: sections[0].label,
      clusters: pages.map(items => items[index]).filter(Boolean),
    }]);
  }

  function validQueuedEvent(event, byTournament, now, selectedId = "") {
    if (selectedId && event.tournament.id !== selectedId) return false;
    if (now - event.queuedAt > 120000) return false;
    const match = byTournament.get(event.tournament.id)?.get(event.match.id);
    if (!match) return false;
    if (event.type === "call") return match.status === "CALLED" && match.call?.calledAt === event.match.call?.calledAt;
    return ["COMPLETED", "WALKOVER"].includes(match.status) && event.fingerprint === resultFingerprint(match);
  }

  function resultFingerprint(match) {
    return JSON.stringify([match.status, match.winnerParticipantId, match.advancingParticipantIds,
      (match.participants || []).map(p => [p.participantId, p.score]), match.reportedBestOf ?? match.bestOf]);
  }

  const core = { characters, paginateSections, validQueuedEvent, resultFingerprint };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  else root.GTDisplayCore = core;
})(typeof window !== "undefined" ? window : globalThis);
