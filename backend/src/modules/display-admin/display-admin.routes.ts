import express from "express";
import { requireManagement } from "../management-auth/management-auth.routes.js";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { DisplayAdminStore, type DisplayMessageTemplates, type DisplayThemeRecord } from "./display-admin.store.js";
import { displaySettingsSchema } from "./display-settings.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const credentialsSchema = z.object({
  currentPassword: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

const selectSoundSchema = z.object({
  soundId: z.string().nullable(),
});

const sponsorToggleSchema = z.object({
  active: z.boolean(),
});

const messageTemplatesSchema = z.object({
  telegramMatchCalled: z.string(),
  telegramTournamentStartedCaption: z.string(),
  telegramGameWin: z.string(),
  telegramMatchResolved: z.string(),
  telegramRoundCompletedCaption: z.string(),
  telegramTournamentCompleted: z.string(),
  telegramTournamentCompletedCaption: z.string(),
  telegramLadderCompleted: z.string().optional(),
  telegramLadderCompletedCaption: z.string().optional(),
  whatsappMatchCalled: z.string(),
  whatsappTournamentStartedCaption: z.string(),
  whatsappGameWin: z.string(),
  whatsappMatchResolved: z.string(),
  whatsappRoundCompletedCaption: z.string(),
  whatsappTournamentCompleted: z.string(),
  whatsappTournamentCompletedCaption: z.string(),
  whatsappLadderCompleted: z.string().optional(),
  whatsappLadderCompletedCaption: z.string().optional(),
  webCallEyebrow: z.string(),
  webCallTitle: z.string(),
  webCallBody: z.string(),
  webCallMeta: z.string(),
  webCallNote: z.string(),
});

const themeSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(1),
  name: z.string().min(1),
  matchers: z.array(z.string()).default([]),
  cssVars: z.record(z.string()).default({}),
  assets: z.object({
    background: z.string().optional(),
    bracketOverlay: z.string().optional(),
    resultOverlay: z.string().optional(),
    championOverlay: z.string().optional(),
    idle: z.string().optional(),
  }).default({}),
});

function extractToken(request: express.Request): string | null {
  const header = request.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export function createDisplayAdminRouter(store: DisplayAdminStore) {
  const router = express.Router();
  function route(method: "get" | "post", routePath: string, ...handlers: express.RequestHandler[]) {
    router[method](routePath, ...handlers.map(handler => (request: express.Request, response: express.Response, next: express.NextFunction) => {
      try { Promise.resolve(handler(request, response, next)).catch(next); }
      catch (error) { next(error); }
    }));
  }
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  const requireAdmin = requireManagement(store.accounts);
  route("post", "/login", (_request, response) => response.redirect(307, '/api/management-auth/login'));

  route("get", "/public-config", async (_request, response) => {
    return response.json(await store.getPublicConfig());
  });

  route("get", "/state", requireAdmin, async (_request, response) => {
    return response.json({ ...await store.getAdminState(), username: response.locals.managementUser.username, user: response.locals.managementUser });
  });

  route("post", "/credentials", requireAdmin, async (request, response) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ message: "Invalid data" });
    }

    try {
      await store.accounts.changePassword(response.locals.managementUser.id, parsed.data.currentPassword, parsed.data.password);
      return response.json({ ok: true });
    } catch (error) {
      return response.status(400).json({ message: error instanceof Error ? error.message : "Could not update" });
    }
  });

  route("post", "/sounds/upload", requireAdmin, upload.single("file"), async (request, response) => {
    if (!request.file) {
      return response.status(400).json({ message: "File missing" });
    }
    if (!request.file.mimetype.startsWith("audio/")) {
      return response.status(400).json({ message: "Only audio files are allowed" });
    }
    const asset = await store.saveUploadedAsset("sound", request.file.originalname, request.file.mimetype, request.file.buffer, request.body?.name);
    return response.json(asset);
  });

  route("post", "/images/upload", requireAdmin, upload.single("file"), async (request, response) => {
    if (!request.file) {
      return response.status(400).json({ message: "File missing" });
    }
    if (!request.file.mimetype.startsWith("image/") && !request.file.mimetype.startsWith("video/")) {
      return response.status(400).json({ message: "Only images or videos are allowed" });
    }
    const asset = await store.saveUploadedAsset("image", request.file.originalname, request.file.mimetype, request.file.buffer, request.body?.name);
    return response.json(asset);
  });

  route("post", "/sponsors/upload", requireAdmin, upload.single("file"), async (request, response) => {
    if (!request.file) {
      return response.status(400).json({ message: "File missing" });
    }
    if (!request.file.mimetype.startsWith("image/")) {
      return response.status(400).json({ message: "Only images are allowed" });
    }
    const asset = await store.saveUploadedAsset("sponsor", request.file.originalname, request.file.mimetype, request.file.buffer, request.body?.name);
    return response.json(asset);
  });

  route("post", "/sounds/select", requireAdmin, async (request, response) => {
    const parsed = selectSoundSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ message: "Invalid selection" });
    }
    try {
      await store.selectSound(parsed.data.soundId);
      return response.json({ ok: true });
    } catch (error) {
      return response.status(400).json({ message: error instanceof Error ? error.message : "Could not select" });
    }
  });

  route("post", "/themes/save", requireAdmin, async (request, response) => {
    const parsed = themeSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ message: "Invalid theme" });
    }
    const themePayload: DisplayThemeRecord = {
      id: parsed.data.id ?? "",
      key: parsed.data.key,
      name: parsed.data.name,
      matchers: parsed.data.matchers,
      cssVars: parsed.data.cssVars,
      assets: parsed.data.assets,
    };
    const theme = await store.saveTheme(themePayload);
    return response.json(theme);
  });

  route("post", "/messages/save", requireAdmin, async (request, response) => {
    const parsed = messageTemplatesSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ message: "Invalid messages" });
    }
    await store.saveMessageTemplates(parsed.data as DisplayMessageTemplates);
    return response.json({ ok: true });
  });

  route("post", "/themes/:themeId/delete", requireAdmin, async (request, response) => {
    const themeId = Array.isArray(request.params.themeId)
      ? request.params.themeId[0]
      : request.params.themeId;
    try {
      await store.deleteTheme(themeId);
      return response.json({ ok: true });
    } catch (error) {
      return response.status(400).json({ message: error instanceof Error ? error.message : "Could not delete the theme" });
    }
  });

  route("post", "/sponsors/:sponsorId/active", requireAdmin, async (request, response) => {
    const parsed = sponsorToggleSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ message: "Invalid status" });
    }
    const sponsorId = Array.isArray(request.params.sponsorId)
      ? request.params.sponsorId[0]
      : request.params.sponsorId;
    await store.setSponsorActive(sponsorId, parsed.data.active);
    return response.json({ ok: true });
  });

  route("post", "/sponsors/:sponsorId/delete", requireAdmin, async (request, response) => {
    const sponsorId = Array.isArray(request.params.sponsorId)
      ? request.params.sponsorId[0]
      : request.params.sponsorId;
    await store.deleteSponsor(sponsorId);
    return response.json({ ok: true });
  });

  route("post", "/settings/save", requireAdmin, async (request, response) => {
    const parsed = displaySettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json({ message: "Invalid configuration" });
    }
    await store.saveDisplaySettings(parsed.data);
    return response.json({ ok: true });
  });

  route("get", "/assets/:kind/:fileName", async (request, response) => {
    const kind = request.params.kind;
    if (kind !== "sound" && kind !== "image" && kind !== "sponsor") {
      return response.status(404).end();
    }
    const baseDir = kind === "sound"
      ? store.soundsDir
      : kind === "sponsor"
        ? store.sponsorsDir
        : store.imagesDir;
    const fileName = Array.isArray(request.params.fileName) ? request.params.fileName[0] : request.params.fileName;
    const absolutePath = path.join(baseDir, path.basename(fileName));
    return response.sendFile(absolutePath);
  });

  router.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    if (response.headersSent) return next(error);
    if (error instanceof multer.MulterError) return response.status(400).json({ message: error.code === "LIMIT_FILE_SIZE" ? "The file exceeds the 20 MB limit" : "Could not upload the file" });
    console.error("[display-admin]", error);
    return response.status(500).json({ message: "Could not complete the display operation. Try again." });
  });
  return router;
}
