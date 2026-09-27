import crypto from "crypto";
import { ManagementAuthStore } from "../management-auth/management-auth.store.js";
import fs from "fs/promises";
import path from "path";
import { setTimeout as delay } from "node:timers/promises";
import { createId } from "../../shared/id.js";
import { normalizeDisplayPreferences, type DisplayPreferences } from "./display-settings.js";

export type DisplayAssetKind = "sound" | "image" | "sponsor";

export interface DisplayAssetRecord {
  id: string;
  kind: DisplayAssetKind;
  name: string;
  fileName: string;
  mimeType: string;
  url: string;
  createdAt: string;
}

export interface DisplaySponsorRecord extends DisplayAssetRecord {
  active: boolean;
}

export interface DisplayThemeRecord {
  id: string;
  key: string;
  name: string;
  matchers: string[];
  cssVars: Record<string, string>;
  assets: {
    background?: string;
    bracketOverlay?: string;
    resultOverlay?: string;
    championOverlay?: string;
    idle?: string;
  };
}

export interface DisplayBuiltinAssetRecord {
  id: string;
  name: string;
  url: string;
  fileName: string;
}

export interface DisplayAdminState {
  auth: {
    username: string;
    passwordHash: string;
    tokenSecret: string;
  };
  bracketRenderMode: "classic" | "modern";
  displaySettings: DisplayPreferences;
  notifications: {
    telegramEnabled: boolean;
    whatsappEnabled: boolean;
  };
  selectedSoundId: string | null;
  sounds: DisplayAssetRecord[];
  images: DisplayAssetRecord[];
  sponsors: DisplaySponsorRecord[];
  themes: DisplayThemeRecord[];
  messageTemplates: DisplayMessageTemplates;
}

export interface DisplayMessageTemplates {
  telegramMatchCalled: string;
  telegramTournamentStartedCaption: string;
  telegramGameWin: string;
  telegramMatchResolved: string;
  telegramRoundCompletedCaption: string;
  telegramTournamentCompleted: string;
  telegramTournamentCompletedCaption: string;
  telegramLadderCompleted: string;
  telegramLadderCompletedCaption: string;
  whatsappMatchCalled: string;
  whatsappTournamentStartedCaption: string;
  whatsappGameWin: string;
  whatsappMatchResolved: string;
  whatsappRoundCompletedCaption: string;
  whatsappTournamentCompleted: string;
  whatsappTournamentCompletedCaption: string;
  whatsappLadderCompleted: string;
  whatsappLadderCompletedCaption: string;
  webCallEyebrow: string;
  webCallTitle: string;
  webCallBody: string;
  webCallMeta: string;
  webCallNote: string;
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildToken(username: string, passwordHash: string, tokenSecret: string): string {
  return hashValue(`${username}:${passwordHash}:${tokenSecret}`);
}

function defaultThemes(): DisplayThemeRecord[] {
  return [
    {
      id: "theme_base",
      key: "base",
      name: "Tema base",
      matchers: [],
      assets: {
        background: "/display-assets/builtin/base-bg-tech.png",
        bracketOverlay: "/display-assets/builtin/base-bracket-overlay.png",
        resultOverlay: "/display-assets/builtin/base-result-overlay.png",
        championOverlay: "/display-assets/builtin/base-champion-overlay.png",
      },
      cssVars: {
        "--bg": "#08111f",
        "--panel": "rgba(15, 23, 42, 0.86)",
        "--panel-2": "rgba(17, 24, 39, 0.92)",
        "--line": "rgba(148, 163, 184, 0.24)",
        "--text": "#f8fafc",
        "--muted": "#cbd5e1",
        "--soft": "#94a3b8",
        "--win": "#22c55e",
        "--lose": "#ef4444",
        "--accent": "#93c5fd",
        "--gold": "#fbbf24",
        "--electric": "#60a5fa",
        "--teal": "#2dd4bf",
        "--idle-bg": "#ffffff",
        "--idle-fit": "cover",
      },
    },
    {
      id: "theme_mario_kart",
      key: "mario-kart",
      name: "Mario Kart",
      matchers: ["mario kart", "mkart", "mariokart"],
      assets: {
        background: "/display-assets/builtin/mario-kart-bg.png",
        bracketOverlay: "/display-assets/builtin/mario-kart-bracket.png",
        resultOverlay: "/display-assets/builtin/mario-kart-result.png",
        championOverlay: "/display-assets/builtin/mario-kart-champion.png",
      },
      cssVars: {
        "--accent": "#facc15",
        "--electric": "#38bdf8",
        "--teal": "#2dd4bf",
        "--gold": "#fb7185",
        "--panel": "rgba(10, 26, 53, 0.88)",
        "--panel-2": "rgba(16, 25, 51, 0.94)",
        "--line": "rgba(125, 211, 252, 0.26)",
        "--entrant-bg": "rgba(255, 255, 255, 0.12)",
        "--entrant-border": "rgba(255, 255, 255, 0.2)",
        "--entrant-win-bg": "rgba(250, 204, 21, 0.2)",
        "--entrant-win-border": "rgba(250, 204, 21, 0.48)",
        "--entrant-win-text": "#fff5b1",
        "--entrant-lose-bg": "rgba(59, 130, 246, 0.16)",
        "--entrant-lose-border": "rgba(56, 189, 248, 0.44)",
        "--entrant-lose-text": "#d7f3ff",
      },
    },
  ];
}

function defaultMessageTemplates(): DisplayMessageTemplates {
  return {
    telegramMatchCalled: "Llamada a jugar en {{tournament_title}}\n{{players_vs}} en {{station_label}}.\nTeneis {{timeout_minutes}} minutos para presentaros o sereis desclasificados.\nSi hay una partida en curso en esa estacion, esperad a que termine para empezar.",
    telegramTournamentStartedCaption: "Comienza {{tournament_title}}. Bracket inicial adjunta.",
    telegramGameWin: "{{completion_text}} {{tournament_title}}\n{{match_label}} · {{score_text}}",
    telegramMatchResolved: "{{resolved_title}}\n{{resolved_body}}",
    telegramRoundCompletedCaption: "Fase completada en {{tournament_title}}: {{round_title}}. Bracket actualizada adjunta.",
    telegramTournamentCompleted: "Torneo completado: {{tournament_title}}\nCampeon: {{winner_name}}",
    telegramTournamentCompletedCaption: "Bracket final de {{tournament_title}}. Campeon: {{winner_name}}",
    telegramLadderCompleted: "Ladder finalizada: {{tournament_title}}\nGanador: {{winner_name}}\n{{ladder_top3}}",
    telegramLadderCompletedCaption: "Clasificacion final de la ladder de {{tournament_title}}. Ganador: {{winner_name}}",
    whatsappMatchCalled: "Llamada a jugar en {{tournament_title}}\n{{players_vs}} en {{station_label}}.\nTeneis {{timeout_minutes}} minutos para presentaros o sereis desclasificados.\nSi hay una partida en curso en esa estacion, esperad a que termine para empezar.",
    whatsappTournamentStartedCaption: "Comienza {{tournament_title}}. Bracket inicial adjunta.",
    whatsappGameWin: "{{completion_text}} {{tournament_title}}\n{{match_label}} · {{score_text}}",
    whatsappMatchResolved: "{{resolved_title}}\n{{resolved_body}}",
    whatsappRoundCompletedCaption: "Fase completada en {{tournament_title}}: {{round_title}}. Bracket actualizada adjunta.",
    whatsappTournamentCompleted: "Torneo completado: {{tournament_title}}\nCampeon: {{winner_name}}",
    whatsappTournamentCompletedCaption: "Bracket final de {{tournament_title}}. Campeon: {{winner_name}}",
    whatsappLadderCompleted: "Ladder finalizada: {{tournament_title}}\nGanador: {{winner_name}}\n{{ladder_top3}}",
    whatsappLadderCompletedCaption: "Clasificacion final de la ladder de {{tournament_title}}. Ganador: {{winner_name}}",
    webCallEyebrow: "Llamada a jugar",
    webCallTitle: "{{tournament_title}}",
    webCallBody: "{{players_vs}}",
    webCallMeta: "Estacion {{station_label}} · {{timeout_minutes}} min",
    webCallNote: "Presentaos dentro del tiempo asignado. Si la estacion esta ocupada, esperad a que termine la partida en curso.",
  };
}

function defaultNotificationSettings() {
  return {
    telegramEnabled: true,
    whatsappEnabled: true,
  };
}

export class DisplayAdminStore {
  readonly accounts: ManagementAuthStore;
  readonly dataDir: string;
  readonly soundsDir: string;
  readonly imagesDir: string;
  readonly sponsorsDir: string;
  readonly stateFile: string;
  readonly builtinImagesDir: string;
  readonly displayWebDir: string;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(baseDir: string) {
    this.accounts = new ManagementAuthStore(baseDir);
    this.dataDir = baseDir;
    this.soundsDir = path.join(baseDir, "sounds");
    this.imagesDir = path.join(baseDir, "images");
    this.sponsorsDir = path.join(baseDir, "sponsors");
    this.stateFile = path.join(baseDir, "state.json");
    this.displayWebDir = path.resolve(baseDir, "..", "..", "display-web");
    this.builtinImagesDir = path.join(this.displayWebDir, "themes", "assets");
  }

  async ensureReady(): Promise<void> {
    await fs.mkdir(this.soundsDir, { recursive: true });
    await fs.mkdir(this.imagesDir, { recursive: true });
    await fs.mkdir(this.sponsorsDir, { recursive: true });
    try {
      await fs.access(this.stateFile);
    } catch {
      const defaultPasswordHash = hashValue("admin");
      const state: DisplayAdminState = {
        auth: {
          username: "admin",
          passwordHash: defaultPasswordHash,
          tokenSecret: createId("display_token"),
        },
        bracketRenderMode: "classic",
        displaySettings: normalizeDisplayPreferences({}),
        notifications: defaultNotificationSettings(),
        selectedSoundId: null,
        sounds: [],
        images: [],
        sponsors: [],
        themes: defaultThemes(),
        messageTemplates: defaultMessageTemplates(),
      };
      await this.writeState(state);
    }
    await this.accounts.initialize((await this.readState()).auth, "admin");
  }

  async readState(): Promise<DisplayAdminState> {
    const raw = await fs.readFile(this.stateFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<DisplayAdminState>;
    return {
      auth: parsed.auth as DisplayAdminState["auth"],
      bracketRenderMode: parsed.bracketRenderMode === "modern" ? "modern" : "classic",
      displaySettings: normalizeDisplayPreferences(parsed.displaySettings),
      notifications: {
        ...defaultNotificationSettings(),
        ...(parsed.notifications ?? {}),
      },
      selectedSoundId: parsed.selectedSoundId ?? null,
      sounds: parsed.sounds ?? [],
      images: parsed.images ?? [],
      sponsors: parsed.sponsors ?? [],
      themes: parsed.themes ?? defaultThemes(),
      messageTemplates: {
        ...defaultMessageTemplates(),
        ...(parsed.messageTemplates ?? {}),
      },
    };
  }

  async writeState(state: DisplayAdminState): Promise<void> {
    const temporary = `${this.stateFile}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await fs.rename(temporary, this.stateFile);
          break;
        } catch (error) {
          // Windows can briefly deny replacement while a reader or antivirus has it open.
          const code = (error as NodeJS.ErrnoException).code;
          if (process.platform !== "win32" || !["EPERM", "EBUSY", "EACCES"].includes(code || "") || attempt >= 5) throw error;
          await delay(20 * (attempt + 1));
        }
      }
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  private mutate<T>(change: (state: DisplayAdminState) => T | Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(async () => {
      const state = await this.readState();
      const result = await change(state);
      await this.writeState(state);
      return result;
    });
    this.mutationQueue = next.catch(() => undefined);
    return next;
  }

  async verifyLogin(username: string, password: string): Promise<string | null> {
    return (await this.accounts.login(username, password)).token;
  }
  async isValidToken(token: string): Promise<boolean> { return Boolean(await this.accounts.userFor(token)); }

  async getNotificationSettings(): Promise<DisplayAdminState["notifications"]> {
    const state = await this.readState();
    return state.notifications;
  }

  async saveNotificationSettings(partial: Partial<DisplayAdminState["notifications"]>): Promise<DisplayAdminState["notifications"]> {
    return this.mutate(state => {
      state.notifications = {
        ...state.notifications,
        ...partial,
      };
      return state.notifications;
    });
  }

  async saveUploadedAsset(kind: DisplayAssetKind, originalName: string, mimeType: string, buffer: Buffer, customName?: string): Promise<DisplayAssetRecord | DisplaySponsorRecord> {
    return this.mutate(async state => {
      const ext = path.extname(originalName) || (mimeType.startsWith("audio/") ? ".wav" : ".png");
      const safeName = `${createId(kind)}${ext}`;
      const dir = kind === "sound"
        ? this.soundsDir
        : kind === "sponsor"
          ? this.sponsorsDir
          : this.imagesDir;
      await fs.writeFile(path.join(dir, safeName), buffer);
      const record: DisplayAssetRecord = {
        id: createId(`${kind}_asset`),
        kind,
        name: (customName?.trim() || path.parse(originalName).name || safeName).trim(),
        fileName: safeName,
        mimeType,
        url: `/api/display-admin/assets/${kind}/${safeName}`,
        createdAt: new Date().toISOString(),
      };
      if (kind === "sound") {
        state.sounds = [record, ...state.sounds];
      } else if (kind === "sponsor") {
        const sponsorRecord: DisplaySponsorRecord = {
          ...record,
          active: true,
        };
        state.sponsors = [sponsorRecord, ...state.sponsors];
        return sponsorRecord;
      } else {
        state.images = [record, ...state.images];
      }
      return record;
    });
  }

  async selectSound(soundId: string | null): Promise<void> {
    return this.mutate(state => {
      if (soundId && !state.sounds.some((sound) => sound.id === soundId)) {
        throw new Error("Sonido no encontrado");
      }
      state.selectedSoundId = soundId;
    });
  }

  async saveTheme(theme: DisplayThemeRecord): Promise<DisplayThemeRecord> {
    return this.mutate(state => {
      const normalized: DisplayThemeRecord = {
        ...theme,
        id: theme.id?.trim() || createId("theme"),
        key: theme.key.trim(),
        name: theme.name.trim(),
        matchers: theme.matchers.map((item) => item.trim()).filter(Boolean),
        cssVars: Object.fromEntries(Object.entries(theme.cssVars || {}).filter(([, value]) => String(value).trim().length > 0)),
        assets: theme.assets || {},
      };

      const index = state.themes.findIndex((item) => item.id === normalized.id);
      if (index >= 0) {
        state.themes[index] = normalized;
      } else {
        state.themes.push(normalized);
      }
      return normalized;
    });
  }

  async deleteTheme(themeId: string): Promise<void> {
    if (themeId === "theme_base") throw new Error("El tema base no se puede eliminar");
    return this.mutate(state => { state.themes = state.themes.filter((theme) => theme.id !== themeId); });
  }

  async getAdminState() {
    const state = await this.readState();
    return {
      username: state.auth.username,
      bracketRenderMode: state.bracketRenderMode,
      displaySettings: state.displaySettings,
      selectedSoundId: state.selectedSoundId,
      sounds: state.sounds,
      images: state.images,
      sponsors: state.sponsors,
      builtinImages: await this.listBuiltinImages(),
      themes: state.themes,
      messageTemplates: state.messageTemplates,
      notifications: state.notifications,
    };
  }

  async getPublicConfig() {
    const state = await this.readState();
    const baseTheme = state.themes.find((theme) => theme.key === "base") ?? state.themes[0] ?? null;
    return {
      bracketRenderMode: state.bracketRenderMode,
      displaySettings: state.displaySettings,
      selectedSoundUrl: state.sounds.find((sound) => sound.id === state.selectedSoundId)?.url ?? null,
      sponsors: state.sponsors.filter((sponsor) => sponsor.active).map((sponsor) => sponsor.url),
      messageTemplates: state.messageTemplates,
      default: baseTheme,
      themes: state.themes.filter((theme) => theme.key !== "base"),
    };
  }

  async saveMessageTemplates(partial: Partial<DisplayMessageTemplates>): Promise<void> {
    return this.mutate(state => {
      state.messageTemplates = {
        ...state.messageTemplates,
        ...Object.fromEntries(
          Object.entries(partial).map(([key, value]) => [key, String(value ?? "").trim()]),
        ),
      };
    });
  }

  async saveBracketRenderMode(mode: "classic" | "modern"): Promise<void> {
    return this.saveDisplaySettings({ bracketRenderMode: mode });
  }

  async saveDisplaySettings(input: { bracketRenderMode?: "classic" | "modern"; displaySettings?: Partial<DisplayPreferences> }): Promise<void> {
    return this.mutate(state => {
      if (input.bracketRenderMode) state.bracketRenderMode = input.bracketRenderMode;
      state.displaySettings = normalizeDisplayPreferences({ ...state.displaySettings, ...input.displaySettings });
    });
  }

  async setSponsorActive(sponsorId: string, active: boolean): Promise<void> {
    return this.mutate(state => {
      state.sponsors = state.sponsors.map((sponsor) =>
        sponsor.id === sponsorId ? { ...sponsor, active } : sponsor
      );
    });
  }

  async deleteSponsor(sponsorId: string): Promise<void> {
    return this.mutate(async state => {
      const sponsor = state.sponsors.find((item) => item.id === sponsorId);
      if (!sponsor) return;
      try {
        await fs.unlink(path.join(this.sponsorsDir, sponsor.fileName));
      } catch {
        // Ignore missing file.
      }
      state.sponsors = state.sponsors.filter((item) => item.id !== sponsorId);
    });
  }

  async listBuiltinImages(): Promise<DisplayBuiltinAssetRecord[]> {
    const records: DisplayBuiltinAssetRecord[] = [];
    try {
      const entries = await fs.readdir(this.builtinImagesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (![".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp4", ".webm", ".mov", ".m4v", ".ogv"].includes(ext)) continue;
        records.push({
          id: `builtin_${entry.name}`,
          name: path.parse(entry.name).name.replaceAll("-", " "),
          url: `/display-assets/builtin/${entry.name}`,
          fileName: entry.name,
        });
      }
    } catch {
      // Ignore missing builtin asset dir.
    }

    const idleImagePath = path.join(this.displayWebDir, "brand-logo.png");
    try {
      await fs.access(idleImagePath);
      records.unshift({
        id: "builtin_brand_logo",
        name: "Logo de la organización",
        url: "/brand-logo.png",
        fileName: "brand-logo.png",
      });
    } catch {
      // Ignore if not present.
    }

    return records;
  }
}
