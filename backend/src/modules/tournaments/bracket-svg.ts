import type { Match, MatchParticipant, Tournament } from "../../shared/types.js";
import { withBracketLabels } from "./bracket-labels.js";

const FONT_FAMILY = "'DejaVu Sans', 'Noto Sans', sans-serif";
const PAGE_PADDING = 30;
const HEADER_HEIGHT = 112;
const SECTION_GAP = 22;
const SECTION_PADDING = 26;
const SECTION_HEADER_HEIGHT = 62;
const COLUMN_WIDTH = 390;
const COLUMN_GAP = 104;
const COLUMN_TITLE_HEIGHT = 48;
const MATCH_GAP = 24;
const CARD_PADDING = 13;
const PARTICIPANT_HEIGHT = 44;
const PARTICIPANT_GAP = 8;

type BracketColumn = {
  stage: Match["bracketStage"];
  roundNumber: number;
  title: string;
  matches: Match[];
};

type BracketSection = {
  label: string;
  columns: BracketColumn[];
};

type PositionedCard = {
  match: Match;
  x: number;
  y: number;
  width: number;
  height: number;
};

type SectionLayout = {
  section: BracketSection;
  width: number;
  height: number;
  cards: PositionedCard[];
  connectors: Array<{ source: PositionedCard; target: PositionedCard }>;
};

type MatchScope = {
  key: string;
  label: string;
  order: number;
  matches: Match[];
};

export function renderBracketSvg(tournament: Tournament, matches: Match[]): string {
  matches = withBracketLabels(matches, tournament.settings.format);
  const visibleMatches = tournament.importSource?.provider === "START_GG"
    ? matches
    : matches.filter((match) => !isAutomaticAdvanceDisplayMatch(match));
  return renderSectionsSvg(tournament, buildSections(tournament, visibleMatches));
}

function renderSectionsSvg(tournament: Tournament, sections: BracketSection[]): string {
  if (sections.length === 0) {
    return emptyBracketSvg(tournament);
  }

  const layouts = sections.map(layoutSection);
  const contentWidth = Math.max(...layouts.map((layout) => layout.width));
  const width = Math.max(960, contentWidth + PAGE_PADDING * 2);
  const height = HEADER_HEIGHT
    + layouts.reduce((total, layout) => total + layout.height, 0)
    + SECTION_GAP * Math.max(layouts.length - 1, 0)
    + PAGE_PADDING;

  let sectionY = HEADER_HEIGHT;
  const content = layouts.map((layout) => {
    const markup = renderSection(layout, PAGE_PADDING, sectionY, width - PAGE_PADDING * 2, tournament.settings.bracketMode === "MKART");
    sectionY += layout.height + SECTION_GAP;
    return markup;
  }).join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="page-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#07111f" />
          <stop offset="0.52" stop-color="#0a1729" />
          <stop offset="1" stop-color="#06101d" />
        </linearGradient>
        <linearGradient id="section-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0f1c30" stop-opacity="0.96" />
          <stop offset="1" stop-color="#0b1728" stop-opacity="0.94" />
        </linearGradient>
        <linearGradient id="card-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#14243a" />
          <stop offset="0.55" stop-color="#0f1d31" />
          <stop offset="1" stop-color="#12243a" />
        </linearGradient>
        <radialGradient id="header-glow" cx="0.15" cy="0.1" r="0.9">
          <stop offset="0" stop-color="#2563eb" stop-opacity="0.34" />
          <stop offset="1" stop-color="#2563eb" stop-opacity="0" />
        </radialGradient>
        <filter id="card-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000814" flood-opacity="0.45" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#page-bg)" />
      <rect width="100%" height="260" fill="url(#header-glow)" />
      <path d="M 0 91 H ${width}" stroke="#263b56" stroke-width="1" />
      <rect x="${PAGE_PADDING}" y="27" width="5" height="52" rx="2.5" fill="#3b82f6" />
      <text x="${PAGE_PADDING + 22}" y="52" font-family="${FONT_FAMILY}" font-size="28" font-weight="800" fill="#f8fafc">${escapeXml(shorten(tournament.title, headerTitleLength(width)))}</text>
      <text x="${PAGE_PADDING + 22}" y="77" font-family="${FONT_FAMILY}" font-size="14" font-weight="600" fill="#9fb2ca">${escapeXml(shorten(`${tournament.gameTitle} · ${describeFormat(tournament)}`, 112))}</text>
      <g transform="translate(${width - PAGE_PADDING - 220}, 31)">
        <rect width="220" height="38" rx="19" fill="#10243c" stroke="#2d4a6b" />
        <circle cx="22" cy="19" r="5" fill="#38bdf8" />
        <text x="38" y="24" font-family="${FONT_FAMILY}" font-size="13" font-weight="800" letter-spacing="0.6" fill="#dcecff">BRACKET MODERNA</text>
      </g>
      ${content}
    </svg>
  `.trim();
}

function buildSections(tournament: Tournament, matches: Match[]): BracketSection[] {
  if (matches.length === 0) return [];
  const scopes = tournament.importSource?.provider === "START_GG"
    ? buildImportedScopes(matches)
    : [{ key: "local", label: "Main bracket", order: 0, matches }];

  const sections: BracketSection[] = [];
  scopes.forEach((scope) => {
    const pools = scope.matches.filter((match) => match.bracketStage === "POOLS");
    const winners = scope.matches.filter((match) => match.bracketStage === "WINNERS");
    const finals = scope.matches.filter((match) => match.bracketStage === "FINALS");
    const losers = scope.matches.filter((match) => match.bracketStage === "LOSERS");

    if (pools.length > 0) {
      sections.push({
        label: scope.label === "Main bracket" ? "Pools" : scope.label,
        columns: buildColumnsForStageGroups([{ stage: "POOLS", matches: pools }]),
      });
    }
    if (winners.length > 0 || finals.length > 0) {
      const suffix = losers.length > 0 ? " · Winners bracket" : "";
      sections.push({
        label: `${scope.label}${suffix}`,
        columns: buildColumnsForStageGroups([
          { stage: "WINNERS", matches: winners },
          { stage: "FINALS", matches: finals },
        ]),
      });
    }
    if (losers.length > 0) {
      sections.push({
        label: `${scope.label} · Losers bracket`,
        columns: buildColumnsForStageGroups([{ stage: "LOSERS", matches: losers }]),
      });
    }
  });
  return sections.filter((section) => section.columns.length > 0);
}

function buildImportedScopes(matches: Match[]): MatchScope[] {
  const scopes = new Map<string, MatchScope>();
  matches.forEach((match) => {
    const phaseId = match.externalRef?.phaseId?.trim() || match.externalRef?.phaseName?.trim() || match.bracketStage;
    const groupId = match.externalRef?.phaseGroupId?.trim() || match.externalRef?.phaseGroupName?.trim() || "";
    const key = `${phaseId}::${groupId}`;
    const phaseLabel = match.externalRef?.phaseName?.trim();
    const groupLabel = match.externalRef?.phaseGroupName?.trim();
    const label = groupLabel || phaseLabel || defaultSectionLabel(match.bracketStage);
    const orderValue = Number(match.externalRef?.phaseOrder);
    const order = Number.isFinite(orderValue) ? orderValue : Number.MAX_SAFE_INTEGER;
    const scope = scopes.get(key);
    if (scope) {
      scope.matches.push(match);
      scope.order = Math.min(scope.order, order);
    } else {
      scopes.set(key, { key, label, order, matches: [match] });
    }
  });
  return [...scopes.values()].sort((left, right) =>
    (left.order - right.order) || left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" }));
}

function buildColumnsForStageGroups(groups: Array<{ stage: Match["bracketStage"]; matches: Match[] }>): BracketColumn[] {
  return groups.flatMap(({ stage, matches }) => {
    const rounds = [...new Set(matches.map((match) => match.roundNumber))].sort((left, right) => left - right);
    return rounds.map((roundNumber) => {
      const roundMatches = matches
        .filter((match) => match.roundNumber === roundNumber)
        .sort((left, right) => left.matchNumber - right.matchNumber);
      return {
        stage,
        roundNumber,
        title: modernRoundTitle(stage, roundNumber, roundMatches),
        matches: roundMatches,
      };
    });
  });
}

function modernRoundTitle(stage: Match["bracketStage"], roundNumber: number, matches: Match[]): string {
  const externalTitle = matches[0]?.roundLabel ?? matches[0]?.externalRef?.fullRoundText?.trim();
  if (externalTitle) return externalTitle;
  if (stage === "FINALS") return roundNumber > 1 ? "Grand Final Reset" : "Grand Final";
  if (stage === "LOSERS") return `Losers Round ${roundNumber}`;
  if (stage === "POOLS") return `Pools Round ${roundNumber}`;
  return `Winners Round ${roundNumber}`;
}

function layoutSection(section: BracketSection): SectionLayout {
  const columnAreaWidth = section.columns.length * COLUMN_WIDTH + Math.max(0, section.columns.length - 1) * COLUMN_GAP;
  const width = Math.max(720, SECTION_PADDING * 2 + columnAreaWidth);
  const cards: PositionedCard[] = [];
  const positionedById = new Map<string, PositionedCard>();
  const candidateMatches = section.columns.flatMap((column) => column.matches);
  let maxBottom = SECTION_HEADER_HEIGHT + COLUMN_TITLE_HEIGHT + 280;

  section.columns.forEach((column, columnIndex) => {
    const x = SECTION_PADDING + columnIndex * (COLUMN_WIDTH + COLUMN_GAP);
    const baseTop = SECTION_HEADER_HEIGHT + COLUMN_TITLE_HEIGHT;
    let previousBottom = baseTop - MATCH_GAP;
    column.matches.forEach((match, matchIndex) => {
      const height = matchCardHeight(match);
      const sources = sourceMatchIdsForMatch(match, candidateMatches)
        .map((sourceId) => positionedById.get(sourceId))
        .filter((source): source is PositionedCard => Boolean(source));
      let y = baseTop + matchIndex * (height + MATCH_GAP);
      if (sources.length > 0) {
        const sourceCenter = sources.reduce((sum, source) => sum + source.y + source.height / 2, 0) / sources.length;
        y = sourceCenter - height / 2;
      }
      y = Math.max(baseTop, y, previousBottom + MATCH_GAP);
      const card = { match, x, y, width: COLUMN_WIDTH, height };
      cards.push(card);
      positionedById.set(match.id, card);
      previousBottom = y + height;
      maxBottom = Math.max(maxBottom, previousBottom);
    });
  });

  const connectors: Array<{ source: PositionedCard; target: PositionedCard }> = [];
  const connectorKeys = new Set<string>();
  cards.forEach((target) => {
    sourceMatchIdsForMatch(target.match, candidateMatches).forEach((sourceId) => {
      const source = positionedById.get(sourceId);
      const key = `${sourceId}->${target.match.id}`;
      if (!source || source.x >= target.x || connectorKeys.has(key)) return;
      connectors.push({ source, target });
      connectorKeys.add(key);
    });
  });

  return {
    section,
    width,
    height: maxBottom + SECTION_PADDING,
    cards,
    connectors,
  };
}

function renderSection(layout: SectionLayout, x: number, y: number, availableWidth: number, marioKart: boolean): string {
  const sectionWidth = Math.max(layout.width, availableWidth);
  const columnTitles = layout.section.columns.map((column, index) => {
    const titleX = x + SECTION_PADDING + index * (COLUMN_WIDTH + COLUMN_GAP);
    return `
      <text x="${titleX}" y="${y + SECTION_HEADER_HEIGHT + 25}" font-family="${FONT_FAMILY}" font-size="19" font-weight="750" fill="#f1f5f9">${escapeXml(shorten(column.title, 34))}</text>
      <line x1="${titleX}" y1="${y + SECTION_HEADER_HEIGHT + 39}" x2="${titleX + COLUMN_WIDTH}" y2="${y + SECTION_HEADER_HEIGHT + 39}" stroke="#29415e" stroke-width="1.4" />
    `;
  }).join("");
  const connectors = layout.connectors.map(({ source, target }) => {
    const x1 = x + source.x + source.width;
    const y1 = y + source.y + source.height / 2;
    const x2 = x + target.x;
    const y2 = y + target.y + target.height / 2;
    const midX = x1 + (x2 - x1) * 0.5;
    return `<path d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" fill="none" stroke="#7088a7" stroke-opacity="0.78" stroke-width="3" stroke-linecap="round" />`;
  }).join("");
  const cards = layout.cards.map((card) => renderMatchCard(card.match, x + card.x, y + card.y, card.width, card.height, marioKart)).join("");

  return `
    <g>
      <rect x="${x}" y="${y}" width="${sectionWidth}" height="${layout.height}" rx="25" fill="url(#section-bg)" stroke="#223852" stroke-width="1.5" />
      <text x="${x + SECTION_PADDING}" y="${y + 39}" font-family="${FONT_FAMILY}" font-size="25" font-weight="800" fill="#f8fafc">${escapeXml(shorten(layout.section.label, 76))}</text>
      <circle cx="${x + sectionWidth - 35}" cy="${y + 32}" r="5" fill="#2dd4bf" />
      ${columnTitles}
      ${connectors}
      ${cards}
    </g>
  `;
}

function renderMatchCard(match: Match, x: number, y: number, width: number, height: number, marioKart: boolean): string {
  const participants = visibleParticipants(match);
  const isMarioKart = marioKart || match.advancersRequired > 1 || participants.length > 2;
  const participantsMarkup = participants.map((participant, index) => {
    const rowY = y + 67 + participants.slice(0, index).reduce((sum, item) => sum + participantRowHeight(item) + PARTICIPANT_GAP, 0);
    return renderParticipantRow(match, participant, x + CARD_PADDING, rowY, width - CARD_PADDING * 2, participantRowHeight(participant), isMarioKart);
  }).join("");
  const effectiveBestOf = match.reportedBestOf ?? match.bestOf;
  const meta = isMarioKart
    ? `Heat of ${participants.length} · ${match.advancersRequired} advance`
    : `Bo${effectiveBestOf}`;

  return `
    <g data-match-id="${escapeXml(match.id)}" filter="url(#card-shadow)">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="url(#card-bg)" stroke="#2a405c" stroke-width="1.4" />
      <path d="M ${x + 1} ${y + 18} Q ${x + 1} ${y + 1} ${x + 18} ${y + 1} H ${x + width - 1}" fill="none" stroke="#3b82f6" stroke-opacity="0.5" stroke-width="2" />
      <text x="${x + CARD_PADDING}" y="${y + 23}" font-family="${FONT_FAMILY}" font-size="13" font-weight="800" fill="#a9bbd0">${escapeXml((match.displayIdentifier ?? `M${match.matchNumber}`) + (match.startggStreamLabel ? " · Stream gg" : ""))}</text>
      <text x="${x + width - CARD_PADDING}" y="${y + 23}" text-anchor="end" font-family="${FONT_FAMILY}" font-size="11" font-weight="700" letter-spacing="0.5" fill="#93a9c2">${escapeXml(normalizeStatus(match.status))}</text>
      <text x="${x + CARD_PADDING}" y="${y + 47}" font-family="${FONT_FAMILY}" font-size="13" font-weight="650" fill="#7890aa">${escapeXml(meta)}</text>
      ${participantsMarkup}
    </g>
  `;
}

function renderParticipantRow(
  match: Match,
  participant: MatchParticipant,
  x: number,
  y: number,
  width: number,
  height: number,
  isMarioKart: boolean,
): string {
  const isWinner = isMarioKart
    ? (match.advancingParticipantIds ?? []).includes(participant.participantId)
    : Boolean(participant.participantId) && participant.participantId === match.winnerParticipantId;
  const completed = match.status === "COMPLETED" || match.status === "WALKOVER";
  const isLoser = completed && Boolean(participant.participantId) && !isWinner;
  const fill = isWinner ? "#143a31" : isLoser ? "#3b2029" : "#17283d";
  const stroke = isWinner ? "#2d8b6d" : isLoser ? "#984557" : "#2b4058";
  const text = isWinner ? "#b7f7d6" : isLoser ? "#fecdd3" : "#f1f5f9";
  const score = match.status === "WALKOVER" && isLoser ? "DQ" : String(participant.score ?? 0);
  const nameLines = wrapParticipantName(participant.displayName || "Pending");
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="1.2" />
      ${isWinner ? `<rect x="${x}" y="${y + 8}" width="4" height="${height - 16}" rx="2" fill="#34d399" />` : ""}
      ${isLoser ? `<rect x="${x}" y="${y + 8}" width="4" height="${height - 16}" rx="2" fill="#fb7185" />` : ""}
      <text font-family="${FONT_FAMILY}" font-size="18" font-weight="750" fill="${text}">${nameLines.map((line, index) => `<tspan x="${x + 13}" y="${y + 28 + index * 23}">${escapeXml(line)}</tspan>`).join("")}</text>
      ${isMarioKart ? "" : `<text x="${x + width - 14}" y="${y + 30}" text-anchor="end" font-family="${FONT_FAMILY}" font-size="18" font-weight="850" fill="${text}">${escapeXml(score)}</text>`}
    </g>
  `;
}

function visibleParticipants(match: Match): MatchParticipant[] {
  if (match.participants.length > 0) return match.participants;
  return [
    { id: `${match.id}-pending-1`, participantId: "", displayName: "Pending", slot: 1, score: 0 },
    { id: `${match.id}-pending-2`, participantId: "", displayName: "Pending", slot: 2, score: 0 },
  ];
}

function matchCardHeight(match: Match): number {
  const participants = visibleParticipants(match);
  return 67 + participants.reduce((sum, participant) => sum + participantRowHeight(participant), 0)
    + Math.max(0, participants.length - 1) * PARTICIPANT_GAP + CARD_PADDING;
}

function participantRowHeight(participant: MatchParticipant): number {
  return Math.max(PARTICIPANT_HEIGHT, 21 + wrapParticipantName(participant.displayName || "Pending").length * 23);
}

function wrapParticipantName(name: string): string[] {
  // Weight wide glyphs conservatively; never discard a team member or long tag.
  const lines: string[] = [];
  let line = "";
  let width = 0;
  for (const character of Array.from(name)) {
    const weight = /[MW@\u2e80-\uffff]/u.test(character) ? 1.65 : /[il .,'|]/u.test(character) ? 0.5 : 1;
    if (width + weight > 25 && line) { lines.push(line); line = ""; width = 0; }
    line += character;
    width += weight;
  }
  if (line) lines.push(line);
  return lines;
}

function sourceMatchIdsForMatch(match: Match, candidateMatches: Match[]): string[] {
  if (match.externalRef?.phaseType?.trim().toUpperCase() === "ROUND_ROBIN") return [];
  const sourceIds = new Set<string>();
  match.participants.forEach((participant) => {
    const sourceId = sourceMatchIdFromPlaceholder(participant.participantId);
    if (sourceId) sourceIds.add(sourceId);
  });
  const targetIndex = candidateMatches.findIndex((candidate) => candidate.id === match.id);
  const earlierMatches = targetIndex >= 0
    ? candidateMatches.slice(0, targetIndex)
    : candidateMatches.filter((candidate) => candidate.id !== match.id);
  match.participants.forEach((participant) => {
    const participantId = participant.participantId.trim();
    if (!participantId || isPlaceholderParticipantId(participantId)) return;
    const source = [...earlierMatches].reverse().find((candidate) => feedsParticipantFromMatch(candidate, participantId));
    if (source?.id) sourceIds.add(source.id);
  });
  return [...sourceIds];
}

function sourceMatchIdFromPlaceholder(participantId: string): string {
  if (participantId.startsWith("winner_of_")) return participantId.slice("winner_of_".length);
  if (participantId.startsWith("loser_of_")) return participantId.slice("loser_of_".length);
  const advance = participantId.match(/^advance_\d+_of_(.+)$/);
  if (advance) return advance[1];
  const drop = participantId.match(/^drop_\d+_of_(.+)$/);
  return drop?.[1] ?? "";
}

function isPlaceholderParticipantId(participantId: string): boolean {
  return participantId.startsWith("winner_of_")
    || participantId.startsWith("loser_of_")
    || participantId.startsWith("advance_")
    || participantId.startsWith("drop_");
}

function feedsParticipantFromMatch(match: Match, participantId: string): boolean {
  if ((match.advancingParticipantIds ?? []).includes(participantId)) return true;
  if (match.winnerParticipantId === participantId) return true;
  return match.participants.some((participant) => participant.participantId === participantId);
}

function isAutomaticAdvanceDisplayMatch(match: Match): boolean {
  if (match.status !== "COMPLETED" || match.call?.calledAt || match.call?.startedAt) return false;
  if ((match.characterSelections?.length ?? 0) > 0 || (match.gameCharacterSelections?.length ?? 0) > 0) return false;
  const participantIds = match.participants
    .map((participant) => participant.participantId)
    .filter((participantId) => participantId !== "");
  if (participantIds.length === 0 || participantIds.length > match.advancersRequired) return false;
  const advancedIds = new Set([
    ...(match.advancingParticipantIds ?? []),
    ...(match.winnerParticipantId ? [match.winnerParticipantId] : []),
  ]);
  if (advancedIds.size !== participantIds.length) return false;
  return participantIds.every((participantId) => advancedIds.has(participantId))
    && match.participants.every((participant) => participant.participantId === "" || participant.score <= 1);
}

function defaultSectionLabel(stage: Match["bracketStage"]): string {
  if (stage === "POOLS") return "Pools";
  if (stage === "LOSERS") return "Losers bracket";
  if (stage === "FINALS") return "Final bracket";
  return "Winners bracket";
}

function normalizeStatus(status: Match["status"]): string {
  return status.replaceAll("_", " ");
}

function describeFormat(tournament: Tournament): string {
  if (tournament.importSource?.provider === "START_GG") {
    const entrantSize = tournament.importSource.entrantSize ?? 1;
    const teamLabel = entrantSize > 1 ? (entrantSize === 2 ? "Doubles" : `Teams ${entrantSize}v${entrantSize}`) : undefined;
    const formatLabel = tournament.importSource.hasPools
      ? tournament.settings.format === "DOUBLE_ELIMINATION"
        ? `Pools + playoff · W Bo${tournament.settings.winnersBestOf ?? tournament.settings.bestOf} / L Bo${tournament.settings.losersBestOf ?? tournament.settings.bestOf}`
        : `Pools + playoff · Bo${tournament.settings.winnersBestOf ?? tournament.settings.bestOf}`
      : tournament.settings.format === "DOUBLE_ELIMINATION"
        ? `Double elimination · W Bo${tournament.settings.winnersBestOf ?? tournament.settings.bestOf} / L Bo${tournament.settings.losersBestOf ?? tournament.settings.bestOf}`
        : `Single elimination · Bo${tournament.settings.winnersBestOf ?? tournament.settings.bestOf}`;
    return teamLabel ? `${teamLabel} · ${formatLabel}` : formatLabel;
  }
  if (tournament.settings.bracketMode === "MKART") {
    return `${tournament.settings.format === "DOUBLE_ELIMINATION" ? "MKART double" : "MKART single"} · pasan ${tournament.settings.mkartAdvanceCount ?? 1}`;
  }
  return tournament.settings.format === "DOUBLE_ELIMINATION"
    ? `Double elimination · W Bo${tournament.settings.winnersBestOf ?? tournament.settings.bestOf} / L Bo${tournament.settings.losersBestOf ?? tournament.settings.bestOf}`
    : `Single elimination · Bo${tournament.settings.winnersBestOf ?? tournament.settings.bestOf}`;
}

function emptyBracketSvg(tournament: Tournament): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="360" viewBox="0 0 960 360">
      <defs>
        <linearGradient id="empty-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#07111f" />
          <stop offset="1" stop-color="#0c1b2f" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#empty-bg)" />
      <rect x="38" y="42" width="5" height="58" rx="2.5" fill="#3b82f6" />
      <text x="62" y="72" font-family="${FONT_FAMILY}" font-size="28" font-weight="800" fill="#f8fafc">${escapeXml(shorten(tournament.title, 70))}</text>
      <text x="62" y="99" font-family="${FONT_FAMILY}" font-size="14" fill="#9fb2ca">${escapeXml(shorten(tournament.gameTitle, 90))}</text>
      <rect x="38" y="142" width="884" height="164" rx="24" fill="#0f1c30" stroke="#263d59" stroke-width="1.5" />
      <circle cx="78" cy="194" r="8" fill="#38bdf8" />
      <text x="102" y="202" font-family="${FONT_FAMILY}" font-size="22" font-weight="750" fill="#e8f2ff">The bracket has no generated matches yet.</text>
      <text x="102" y="239" font-family="${FONT_FAMILY}" font-size="15" fill="#8fa5be">The modern view will appear when matches exist.</text>
    </svg>
  `.trim();
}

function shorten(value: string, maxLength: number): string {
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function headerTitleLength(width: number): number {
  return Math.max(28, Math.min(74, Math.floor((width - 300) / 15)));
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}
