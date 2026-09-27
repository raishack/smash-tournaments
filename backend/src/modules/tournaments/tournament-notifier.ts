import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import type { DisplayAdminStore, DisplayMessageTemplates } from "../display-admin/display-admin.store.js";
import type { Match, Tournament } from "../../shared/types.js";
import type { LadderMatch, LadderStanding } from "../ladder/ladder.types.js";
import { renderBracketExport, renderSvgPng } from "./bracket-export.js";

const execFileAsync = promisify(execFile);

export interface TournamentNotifier {
  notifyMatchCalled(tournament: Tournament, match: Match): Promise<void>;
  notifyLadderMatchFound(tournament: Tournament, match: LadderMatch): Promise<void>;
  notifyTournamentStarted(tournament: Tournament, matches: Match[]): Promise<void>;
  notifyGameWin(tournament: Tournament, match: Match, participantId: string): Promise<void>;
  notifyMatchResolved(tournament: Tournament, match: Match): Promise<void>;
  notifyRoundCompleted(tournament: Tournament, matches: Match[], resolvedMatch: Match): Promise<void>;
  notifyTournamentCompleted(tournament: Tournament, matches: Match[], winnerName: string): Promise<void>;
  notifyLadderCompleted(tournament: Tournament, matches: Match[], winnerName: string, standings: LadderStanding[]): Promise<void>;
}

export class NoopTournamentNotifier implements TournamentNotifier {
  async notifyMatchCalled(): Promise<void> {}
  async notifyLadderMatchFound(): Promise<void> {}
  async notifyTournamentStarted(): Promise<void> {}
  async notifyGameWin(): Promise<void> {}
  async notifyMatchResolved(): Promise<void> {}
  async notifyRoundCompleted(): Promise<void> {}
  async notifyTournamentCompleted(): Promise<void> {}
  async notifyLadderCompleted(): Promise<void> {}
}

export class CompositeTournamentNotifier implements TournamentNotifier {
  private readonly queues = new Map<TournamentNotifier, Promise<void>>();
  constructor(private readonly notifiers: TournamentNotifier[]) {}

  // One queue per channel preserves event order without delaying HTTP responses.
  // Failures are isolated, so a failed WhatsApp send cannot stop Telegram or later events.
  private enqueue(action: (notifier: TournamentNotifier) => Promise<void>): void {
    for (const notifier of this.notifiers) {
      const pending = (this.queues.get(notifier) ?? Promise.resolve())
        .then(() => action(notifier))
        .catch((error) => { console.error('[notification]', notifier.constructor.name, error); });
      this.queues.set(notifier, pending);
      void pending.then(() => {
        if (this.queues.get(notifier) === pending) this.queues.delete(notifier);
      });
    }
  }

  async drain(): Promise<void> {
    await Promise.all(this.queues.values());
  }

  async notifyMatchCalled(tournament: Tournament, match: Match): Promise<void> {
    this.enqueue((notifier) => notifier.notifyMatchCalled(tournament, match));
  }

  async notifyLadderMatchFound(tournament: Tournament, match: LadderMatch): Promise<void> {
    this.enqueue((notifier) => notifier.notifyLadderMatchFound(tournament, match));
  }

  async notifyTournamentStarted(tournament: Tournament, matches: Match[]): Promise<void> {
    this.enqueue((notifier) => notifier.notifyTournamentStarted(tournament, matches));
  }

  async notifyGameWin(tournament: Tournament, match: Match, participantId: string): Promise<void> {
    this.enqueue((notifier) => notifier.notifyGameWin(tournament, match, participantId));
  }

  async notifyMatchResolved(tournament: Tournament, match: Match): Promise<void> {
    this.enqueue((notifier) => notifier.notifyMatchResolved(tournament, match));
  }

  async notifyRoundCompleted(tournament: Tournament, matches: Match[], resolvedMatch: Match): Promise<void> {
    this.enqueue((notifier) => notifier.notifyRoundCompleted(tournament, matches, resolvedMatch));
  }

  async notifyTournamentCompleted(tournament: Tournament, matches: Match[], winnerName: string): Promise<void> {
    this.enqueue((notifier) => notifier.notifyTournamentCompleted(tournament, matches, winnerName));
  }

  async notifyLadderCompleted(tournament: Tournament, matches: Match[], winnerName: string, standings: LadderStanding[]): Promise<void> {
    this.enqueue((notifier) => notifier.notifyLadderCompleted(tournament, matches, winnerName, standings));
  }
}

export class TelegramTournamentNotifier implements TournamentNotifier {
  private readonly token?: string;
  private readonly chatId?: string;
  private readonly enabled: boolean;
  private readonly templates?: DisplayAdminStore;

  constructor(config: { token?: string; chatId?: string; templates?: DisplayAdminStore }) {
    this.token = config.token;
    this.chatId = config.chatId;
    this.enabled = Boolean(this.token && this.chatId);
    this.templates = config.templates;
  }

  async notifyMatchCalled(tournament: Tournament, match: Match): Promise<void> {
    if (!(await this.canSend())) return;
    await this.sendMessage(await buildMatchCalledMessage(tournament, match, "telegram", this.templates));
  }

  async notifyLadderMatchFound(): Promise<void> {}

  async notifyTournamentStarted(tournament: Tournament, matches: Match[]): Promise<void> {
    if (!(await this.canSend())) return;
    await this.sendBracket(tournament, matches,
      `${sanitizeFileName(tournament.title)}-inicio-bracket.png`,
      await buildTournamentStartedCaption(tournament, "telegram", this.templates),
    );
  }

  async notifyGameWin(tournament: Tournament, match: Match, participantId: string): Promise<void> {
    if (!(await this.canSend())) return;
    await this.sendMessage(await buildGameWinMessage(tournament, match, participantId, "telegram", this.templates));
  }

  async notifyMatchResolved(tournament: Tournament, match: Match): Promise<void> {
    if (!(await this.canSend())) return;
    await this.sendMessage(await buildMatchResolvedMessage(tournament, match, "telegram", this.templates));
  }

  async notifyRoundCompleted(tournament: Tournament, matches: Match[], resolvedMatch: Match): Promise<void> {
    if (!(await this.canSend())) return;
    const roundTitle = roundCaption(resolvedMatch);
    const roundMatches = selectRoundNotificationMatches(tournament, matches, resolvedMatch);
    await this.sendBracket(tournament, roundMatches,
      `${sanitizeFileName(tournament.title)}-${sanitizeFileName(roundTitle)}.png`,
      await buildRoundCompletedCaption(tournament, resolvedMatch, "telegram", this.templates),
    );
  }

  async notifyTournamentCompleted(tournament: Tournament, matches: Match[], winnerName: string): Promise<void> {
    if (!(await this.canSend())) return;
    await this.sendMessage(await buildTournamentCompletedMessage(tournament, winnerName, "telegram", this.templates));
    await this.sendBracket(tournament, matches,
      `${sanitizeFileName(tournament.title)}-final.png`,
      await buildTournamentCompletedCaption(tournament, winnerName, "telegram", this.templates),
    );
  }

  async notifyLadderCompleted(tournament: Tournament, _matches: Match[], winnerName: string, standings: LadderStanding[]): Promise<void> {
    if (!(await this.canSend())) return;
    await this.sendMessage(await buildLadderCompletedMessage(tournament, winnerName, standings, "telegram", this.templates));
    await this.sendDocument(
      await renderLadderStandingsPng(tournament, standings),
      `${sanitizeFileName(tournament.title)}-ladder-standings.png`,
      await buildLadderCompletedCaption(tournament, winnerName, standings, "telegram", this.templates),
    );
  }

  private async sendMessage(text: string): Promise<void> {
    await this.telegramRequest("sendMessage", {
      chat_id: this.chatId,
      text,
      disable_web_page_preview: true,
    });
  }

  private async sendBracket(tournament: Tournament, matches: Match[], filename: string, caption: string): Promise<void> {
    await this.sendDocument(await renderBracketExport(tournament, matches), filename, caption);
  }

  private async sendDocument(fileBytes: Uint8Array, filename: string, caption: string, mime = "image/png"): Promise<void> {
    const normalizedBuffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength,
    ) as ArrayBuffer;
    const form = new FormData();
    form.append("chat_id", this.chatId ?? "");
    form.append("caption", Array.from(caption).slice(0, 1024).join(""));
    form.append("document", new Blob([normalizedBuffer], { type: mime }), filename);
    form.append("disable_content_type_detection", "true");
    await this.telegramRequest("sendDocument", form);
  }

  private async telegramRequest(method: string, body: Record<string, unknown> | FormData): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        body: body instanceof FormData ? body : JSON.stringify(body),
        headers: body instanceof FormData ? undefined : { "content-type": "application/json" },
      });
      if (response.ok) return;
      const payload = await response.text();
      // Only retry an explicit rate-limit rejection; ambiguous failures might
      // already have delivered the message. Respect Telegram's requested pause.
      if (response.status === 429 && attempt < 3) {
        let retryAfter: unknown;
        try { retryAfter = JSON.parse(payload)?.parameters?.retry_after; } catch { /* Keep original error. */ }
        if (typeof retryAfter === "number" && Number.isInteger(retryAfter) && retryAfter >= 0 && retryAfter <= 2147483) {
          await delay(retryAfter * 1000);
          continue;
        }
      }
      throw new Error(`Telegram ${method} failed: ${response.status} ${payload}`);
    }
  }

  private async canSend(): Promise<boolean> {
    if (!this.enabled) return false;
    if (!this.templates) return true;
    const settings = await this.templates.getNotificationSettings();
    return settings.telegramEnabled;
  }
}

export class WhatsAppTournamentNotifier implements TournamentNotifier {
  private readonly bin: string;
  private readonly groupJid?: string;
  private readonly enabled: boolean;
  private readonly templates?: DisplayAdminStore;

  constructor(config: { bin?: string; groupJid?: string; templates?: DisplayAdminStore }) {
    this.bin = config.bin ?? "wacli";
    this.groupJid = config.groupJid;
    this.enabled = Boolean(this.groupJid);
    this.templates = config.templates;
  }

  async notifyMatchCalled(tournament: Tournament, match: Match): Promise<void> {
    if (!(await this.canSend())) return;
    await this.sendText(await buildMatchCalledMessage(tournament, match, "whatsapp", this.templates));
  }

  async notifyLadderMatchFound(): Promise<void> {}

  async notifyTournamentStarted(tournament: Tournament, matches: Match[]): Promise<void> {
    if (!(await this.canSend())) return;
    await this.sendBracket(tournament, matches,
      `${sanitizeFileName(tournament.title)}-inicio-bracket.png`,
      await buildTournamentStartedCaption(tournament, "whatsapp", this.templates),
    );
  }

  async notifyGameWin(tournament: Tournament, match: Match, participantId: string): Promise<void> {
    if (!(await this.canSend())) return;
    await this.sendText(await buildGameWinMessage(tournament, match, participantId, "whatsapp", this.templates));
  }

  async notifyMatchResolved(tournament: Tournament, match: Match): Promise<void> {
    if (!(await this.canSend())) return;
    await this.sendText(await buildMatchResolvedMessage(tournament, match, "whatsapp", this.templates));
  }

  async notifyRoundCompleted(tournament: Tournament, matches: Match[], resolvedMatch: Match): Promise<void> {
    if (!(await this.canSend())) return;
    const roundTitle = roundCaption(resolvedMatch);
    const roundMatches = selectRoundNotificationMatches(tournament, matches, resolvedMatch);
    await this.sendBracket(tournament, roundMatches,
      `${sanitizeFileName(tournament.title)}-${sanitizeFileName(roundTitle)}.png`,
      await buildRoundCompletedCaption(tournament, resolvedMatch, "whatsapp", this.templates),
    );
  }

  async notifyTournamentCompleted(tournament: Tournament, matches: Match[], winnerName: string): Promise<void> {
    if (!(await this.canSend())) return;
    await this.sendText(await buildTournamentCompletedMessage(tournament, winnerName, "whatsapp", this.templates));
    await this.sendBracket(tournament, matches,
      `${sanitizeFileName(tournament.title)}-final.png`,
      await buildTournamentCompletedCaption(tournament, winnerName, "whatsapp", this.templates),
    );
  }

  async notifyLadderCompleted(tournament: Tournament, matches: Match[], winnerName: string, standings: LadderStanding[]): Promise<void> {
    if (!(await this.canSend())) return;
    await this.sendText(await buildLadderCompletedMessage(tournament, winnerName, standings, "whatsapp", this.templates));
    await this.sendDocument(
      await renderLadderStandingsPng(tournament, standings),
      `${sanitizeFileName(tournament.title)}-ladder-standings.png`,
      await buildLadderCompletedCaption(tournament, winnerName, standings, "whatsapp", this.templates),
    );
  }

  private async sendText(message: string): Promise<void> {
    await execFileAsync(this.bin, [
      "send",
      "text",
      "--to",
      this.groupJid ?? "",
      "--message",
      message,
    ], { timeout: 60000, killSignal: "SIGKILL", windowsHide: true });
  }

  private async sendBracket(tournament: Tournament, matches: Match[], filename: string, caption: string): Promise<void> {
    await this.sendDocument(await renderBracketExport(tournament, matches), filename, caption);
  }

  private async sendDocument(fileBytes: Uint8Array, filename: string, caption: string, mime = "image/png"): Promise<void> {
    const tempDir = await mkdtemp(join(tmpdir(), "gtt-wacli-"));
    const filePath = join(tempDir, filename);

    try {
      await writeFile(filePath, fileBytes);
      await execFileAsync(this.bin, whatsappDocumentArgs(this.groupJid ?? "", filePath, caption, mime), { timeout: 60000, killSignal: "SIGKILL", windowsHide: true });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async canSend(): Promise<boolean> {
    if (!this.enabled) return false;
    if (!this.templates) return true;
    const settings = await this.templates.getNotificationSettings();
    return settings.whatsappEnabled;
  }
}

export function whatsappDocumentArgs(group: string, file: string, caption: string, mime: string): string[] {
  return ["send", "file", "--to", group, "--file", file, "--caption", caption, "--as", "document", "--mime", mime];
}

async function renderLadderStandingsPng(tournament: Tournament, standings: LadderStanding[]): Promise<Uint8Array> {
  return renderSvgPng(renderLadderStandingsSvg(tournament, standings));
}

async function loadTemplates(store?: DisplayAdminStore): Promise<DisplayMessageTemplates | null> {
  if (!store) return null;
  try {
    const state = await store.readState();
    return state.messageTemplates;
  } catch {
    return null;
  }
}

function renderTemplate(template: string, values: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_full, key) => String(values[key] ?? ""));
}

function templateValues(tournament: Tournament, match?: Match, winnerName?: string, participantId?: string): Record<string, string | number | undefined> {
  const playersVs = match?.participants.map((participant) => participant.displayName).join(" vs ") ?? "";
  const setupLabel = match?.call?.stationLabel?.trim() || "?";
  const playAreaName = tournament.settings.playAreaName?.trim() || "";
  const stationLabel = playAreaName ? `${setupLabel} · ${playAreaName}` : setupLabel;
  const timeoutMinutes = tournament.settings.callTimeoutMinutes;
  const roundTitle = match ? roundCaption(match) : "";
  const scoreText = match ? describeScore(match) : "";
  const matchWinner = match && participantId
    ? match.participants.find((participant) => participant.participantId === participantId)?.displayName
    : "";
  const completionText = match
    ? match.status === "COMPLETED"
      ? `Match won by ${matchWinner || winnerName || ""}.`
      : `Game won by ${matchWinner || winnerName || ""}.`
    : "";
  const resolvedTitle = match
    ? match.advancersRequired > 1 || match.participants.length > 2
      ? (match.bracketStage === "FINALS" ? `Final completed in ${tournament.title}` : `Heat completed in ${tournament.title}`)
      : `Result confirmed in ${tournament.title}`
    : "";
  const resolvedBody = match
    ? match.advancersRequired > 1 || match.participants.length > 2
      ? `${matchLabel(match)} · Clasifican: ${((match.advancingParticipantIds ?? [])
        .map((id) => match.participants.find((participant) => participant.participantId === id)?.displayName)
        .filter((name): name is string => Boolean(name))
        .join(", ")) || "no qualifiers"}`
      : (() => {
        const resolvedWinner = match.participants.find((participant) => participant.participantId === match.winnerParticipantId)?.displayName || "";
        const extra = match.status === "WALKOVER" ? "due to absence" : `with ${describeScore(match)}`;
        return `${matchLabel(match)} · ${resolvedWinner} gana ${extra}.`;
      })()
    : "";

  return {
    tournament_title: tournament.title,
    tournament_game: tournament.gameTitle,
    players_vs: playersVs,
    station_label: stationLabel,
    setup_label: setupLabel,
    play_area_name: playAreaName,
    timeout_minutes: timeoutMinutes,
    match_label: match ? matchLabel(match) : "",
    score_text: scoreText,
    winner_name: winnerName || matchWinner || "",
    round_title: roundTitle,
    completion_text: completionText.trim(),
    resolved_title: resolvedTitle,
    resolved_body: resolvedBody,
  };
}

function ladderTemplateValues(tournament: Tournament, winnerName: string, standings: LadderStanding[]): Record<string, string | number | undefined> {
  const topThree = standings.slice(0, 3).map((standing, index) =>
    `${index + 1}. ${standing.displayName} (${standing.wins}-${standing.losses}, ${standing.rankingMode === "COMPETITIVE" ? `rating ${standing.rating}${standing.eligible ? "" : " provisional"}` : `diff ${formatDifferential(standing.gameDifferential)}`})`,
  ).join("\n");
  const rows = standings.map((standing, index) =>
    `${index + 1}. ${standing.displayName} · ${standing.wins}-${standing.losses} · Games ${standing.gamesWon}-${standing.gamesLost} · ${standing.rankingMode === "COMPETITIVE" ? `Rating ${standing.rating}${standing.eligible ? "" : " · provisional"}` : `Diff ${formatDifferential(standing.gameDifferential)}`}`,
  ).join("\n");
  return {
    tournament_title: tournament.title,
    tournament_game: tournament.gameTitle,
    winner_name: winnerName,
    ladder_entries_count: standings.length,
    ladder_top3: topThree,
    ladder_rows: rows,
  };
}

async function buildMatchCalledMessage(tournament: Tournament, match: Match, channel: "telegram" | "whatsapp", store?: DisplayAdminStore): Promise<string> {
  const templates = await loadTemplates(store);
  const players = match.participants.map((participant) => participant.displayName);
  const timeout = tournament.settings.callTimeoutMinutes;
  const playAreaName = tournament.settings.playAreaName?.trim();
  const station = match.call?.stationLabel?.trim()
    ? `estacion ${match.call.stationLabel}${playAreaName ? `, en ${playAreaName}` : ""}`
    : "the assigned station";
  const fallback = [
    `Match call in ${tournament.title}`,
    `${players.join(" vs ")} at ${station}.`,
    `You have ${timeout} minutes to arrive or you may be disqualified.`,
    "If a match is in progress at that station, wait for it to finish before starting.",
  ].join("\n");
  const template = channel === "telegram" ? templates?.telegramMatchCalled : templates?.whatsappMatchCalled;
  return renderTemplate(template || fallback, templateValues(tournament, match));
}

async function buildTournamentStartedCaption(tournament: Tournament, channel: "telegram" | "whatsapp", store?: DisplayAdminStore): Promise<string> {
  const templates = await loadTemplates(store);
  const template = channel === "telegram" ? templates?.telegramTournamentStartedCaption : templates?.whatsappTournamentStartedCaption;
  return renderTemplate(template || "Comienza {{tournament_title}}. Bracket inicial adjunta.", templateValues(tournament));
}

async function buildGameWinMessage(tournament: Tournament, match: Match, participantId: string, channel: "telegram" | "whatsapp", store?: DisplayAdminStore): Promise<string> {
  const templates = await loadTemplates(store);
  const winner = match.participants.find((participant) => participant.participantId === participantId);
  if (!winner) {
    return `Score update in ${tournament.title}`;
  }
  const template = channel === "telegram" ? templates?.telegramGameWin : templates?.whatsappGameWin;
  return renderTemplate(template || "{{completion_text}} {{tournament_title}}\n{{match_label}} · {{score_text}}", templateValues(tournament, match, winner.displayName, participantId));
}

async function buildMatchResolvedMessage(tournament: Tournament, match: Match, channel: "telegram" | "whatsapp", store?: DisplayAdminStore): Promise<string> {
  const templates = await loadTemplates(store);
  const template = channel === "telegram" ? templates?.telegramMatchResolved : templates?.whatsappMatchResolved;
  if (template) {
    return renderTemplate(template, templateValues(tournament, match));
  }

  if (match.advancersRequired > 1 || match.participants.length > 2) {
    const advancingNames = (match.advancingParticipantIds ?? [])
      .map((participantId) =>
        match.participants.find((participant) => participant.participantId === participantId)?.displayName)
      .filter((name): name is string => Boolean(name));

    return [
      match.bracketStage === "FINALS"
        ? `Final completed in ${tournament.title}`
        : `Heat completed in ${tournament.title}`,
      `${matchLabel(match)} · Qualifiers: ${advancingNames.join(", ") || "no qualifiers"}`,
    ].join("\n");
  }

  const winner = match.participants.find((participant) => participant.participantId === match.winnerParticipantId);
  if (!winner) {
    return `Result updated in ${tournament.title}`;
  }

  const extra = match.status === "WALKOVER" ? "due to absence" : `with ${describeScore(match)}`;
  return [
    `Result confirmed in ${tournament.title}`,
    `${matchLabel(match)} · ${winner.displayName} gana ${extra}.`,
  ].join("\n");
}

async function buildRoundCompletedCaption(tournament: Tournament, match: Match, channel: "telegram" | "whatsapp", store?: DisplayAdminStore): Promise<string> {
  const templates = await loadTemplates(store);
  const template = channel === "telegram" ? templates?.telegramRoundCompletedCaption : templates?.whatsappRoundCompletedCaption;
  return renderTemplate(template || "Phase completed in {{tournament_title}}: {{round_title}}. Updated bracket attached.", templateValues(tournament, match));
}

async function buildTournamentCompletedMessage(tournament: Tournament, winnerName: string, channel: "telegram" | "whatsapp", store?: DisplayAdminStore): Promise<string> {
  const templates = await loadTemplates(store);
  const template = channel === "telegram" ? templates?.telegramTournamentCompleted : templates?.whatsappTournamentCompleted;
  return renderTemplate(template || "Tournament completed: {{tournament_title}}\nChampion: {{winner_name}}", templateValues(tournament, undefined, winnerName));
}

async function buildTournamentCompletedCaption(tournament: Tournament, winnerName: string, channel: "telegram" | "whatsapp", store?: DisplayAdminStore): Promise<string> {
  const templates = await loadTemplates(store);
  const template = channel === "telegram" ? templates?.telegramTournamentCompletedCaption : templates?.whatsappTournamentCompletedCaption;
  return renderTemplate(template || "Final bracket for {{tournament_title}}. Champion: {{winner_name}}", templateValues(tournament, undefined, winnerName));
}

async function buildLadderCompletedMessage(
  tournament: Tournament,
  winnerName: string,
  standings: LadderStanding[],
  channel: "telegram" | "whatsapp",
  store?: DisplayAdminStore,
): Promise<string> {
  const templates = await loadTemplates(store);
  const template = channel === "telegram" ? templates?.telegramLadderCompleted : templates?.whatsappLadderCompleted;
  if (template) {
    return renderTemplate(template, ladderTemplateValues(tournament, winnerName, standings));
  }
  const topLines = standings.slice(0, 3).map((standing, index) =>
    `${index + 1}. ${standing.displayName} (${standing.wins}-${standing.losses}, diff ${formatDifferential(standing.gameDifferential)})`);
  return [
    `Ladder completed in ${tournament.title}`,
    `Winner: ${winnerName}`,
    ...topLines,
  ].join("\n");
}

async function buildLadderCompletedCaption(
  tournament: Tournament,
  winnerName: string,
  standings: LadderStanding[],
  channel: "telegram" | "whatsapp",
  store?: DisplayAdminStore,
): Promise<string> {
  const templates = await loadTemplates(store);
  const template = channel === "telegram" ? templates?.telegramLadderCompletedCaption : templates?.whatsappLadderCompletedCaption;
  return renderTemplate(
    template || "Final ladder standings for {{tournament_title}}. Winner: {{winner_name}}",
    ladderTemplateValues(tournament, winnerName, standings),
  );
}

function renderLadderStandingsSvg(tournament: Tournament, standings: LadderStanding[]): string {
  const visibleStandings = standings.length > 0 ? standings : [{
    participantId: "empty",
    displayName: "No results",
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    gamesWon: 0,
    gamesLost: 0,
    gameDifferential: 0,
  }];
  const width = 1400;
  const rowHeight = 74;
  const headerHeight = 190;
  const footerHeight = 36;
  const height = headerHeight + visibleStandings.length * rowHeight + footerHeight;
  const rows = visibleStandings.map((standing, index) => {
    const y = headerHeight + index * rowHeight;
    const fill = index === 0 ? "#13281e" : index % 2 === 0 ? "#0f172a" : "#111c31";
    const stroke = index === 0 ? "#2dd4bf" : "rgba(148,163,184,0.18)";
    return `
      <rect x="44" y="${y}" width="${width - 88}" height="${rowHeight - 10}" rx="18" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <text x="86" y="${y + 40}" fill="#f8fafc" font-size="28" font-family="Arial, sans-serif" font-weight="700">${index + 1}</text>
      <text x="150" y="${y + 40}" fill="#f8fafc" font-size="28" font-family="Arial, sans-serif" font-weight="700">${escapeXml(standing.displayName)}</text>
      <text x="${width - 470}" y="${y + 40}" fill="#cbd5e1" font-size="22" font-family="Arial, sans-serif">W-L ${standing.wins}-${standing.losses}</text>
      <text x="${width - 300}" y="${y + 40}" fill="#cbd5e1" font-size="22" font-family="Arial, sans-serif">Games ${standing.gamesWon}-${standing.gamesLost}</text>
      <text x="${width - 110}" y="${y + 40}" fill="#fbbf24" font-size="22" font-family="Arial, sans-serif" text-anchor="end">${standing.rankingMode === "COMPETITIVE" ? `${standing.rating}${standing.eligible ? "" : " *"}` : `Diff ${escapeXml(formatDifferential(standing.gameDifferential))}`}</text>
    `;
  }).join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#08111f"/>
      <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="30" fill="#0f172a" stroke="rgba(148,163,184,0.24)" stroke-width="2"/>
      <text x="60" y="86" fill="#f8fafc" font-size="48" font-family="Arial, sans-serif" font-weight="800">${escapeXml(tournament.title)}</text>
      <text x="60" y="126" fill="#93c5fd" font-size="28" font-family="Arial, sans-serif" font-weight="700">Final ladder standings${standings[0]?.rankingMode === "COMPETITIVE" ? " · Rating (* provisional)" : ""}</text>
      <text x="60" y="160" fill="#cbd5e1" font-size="22" font-family="Arial, sans-serif">${escapeXml(tournament.gameTitle)}</text>
      ${rows}
    </svg>
  `.trim();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function formatDifferential(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function describeScore(match: Match): string {
  return match.participants.map((participant) => `${participant.displayName} ${participant.score}`).join(" - ");
}

function matchLabel(match: Match): string {
  if (match.displayIdentifier) return `${roundCaption(match)} ${match.displayIdentifier}`;
  if (match.bracketStage === "POOLS") {
    const poolLabel = match.externalRef?.phaseGroupName?.trim()
      || match.externalRef?.phaseName?.trim()
      || "Pool";
    return `${poolLabel} R${match.roundNumber} M${match.matchNumber}`;
  }
  const stage = match.bracketStage === "LOSERS"
    ? "Losers"
    : match.bracketStage === "FINALS"
      ? "Final"
      : "Winners";
  return `${stage} R${match.roundNumber} M${match.matchNumber}`;
}

function roundCaption(match: Match): string {
  if (match.roundLabel || match.externalRef?.fullRoundText) return match.roundLabel || match.externalRef!.fullRoundText!;
  const phaseGroupLabel = match.externalRef?.phaseGroupName?.trim();
  if (match.bracketStage === "POOLS") {
    const poolLabel = phaseGroupLabel
      || match.externalRef?.phaseName?.trim()
      || "Pool";
    return `${poolLabel} Round ${match.roundNumber}`;
  }
  const baseCaption = match.bracketStage === "FINALS"
    ? "Grand Final"
    : `${match.bracketStage === "LOSERS" ? "Losers" : "Winners"} Round ${match.roundNumber}`;
  return phaseGroupLabel ? `${phaseGroupLabel} - ${baseCaption}` : baseCaption;
}

function selectRoundNotificationMatches(tournament: Tournament, matches: Match[], resolvedMatch: Match): Match[] {
  if (tournament.importSource?.provider !== "START_GG") {
    return matches;
  }

  const phaseGroupId = resolvedMatch.externalRef?.phaseGroupId?.trim();
  if (phaseGroupId) {
    const phaseGroupMatches = matches.filter((match) => match.externalRef?.phaseGroupId?.trim() === phaseGroupId);
    if (phaseGroupMatches.length > 0) {
      return phaseGroupMatches;
    }
  }

  const phaseId = resolvedMatch.externalRef?.phaseId?.trim();
  if (phaseId) {
    const phaseMatches = matches.filter((match) => match.externalRef?.phaseId?.trim() === phaseId);
    if (phaseMatches.length > 0) {
      return phaseMatches;
    }
  }

  return matches;
}

function sanitizeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
