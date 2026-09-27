import { Top8Assets, createTop8AssetRouter } from "./modules/top8/top8-assets.js";
import { createRegistrationAdminRouters } from './modules/registration/registration-admin.routes.js';
import cors from "cors";
import { ArchivedTournamentError } from "./modules/tournaments/tournament-archive.js";
import { createManagementAuthRouter, requireManagement } from "./modules/management-auth/management-auth.routes.js";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Pool } from "pg";
import { createDatabasePool } from "./database.js";
import { createDisplayAdminRouter } from "./modules/display-admin/display-admin.routes.js";
import { createManageRouter } from "./modules/manage/manage.routes.js";
import { AndroidAppUpdatesStore } from "./modules/app-updates/android-updates.js";
import { WindowsAppUpdatesStore } from "./modules/app-updates/windows-updates.js";
import { PlayerPushNotifier } from "./modules/player/player-push-notifier.js";
import { PlayerPostgresRepository } from "./modules/player/player.postgres-repository.js";
import { createPlayerRouter } from "./modules/player/player.routes.js";
import { PlayerService } from "./modules/player/player.service.js";
import { StartggOAuthClient } from "./modules/player/startgg-oauth.client.js";
import { LadderPostgresRepository } from "./modules/ladder/ladder.postgres-repository.js";
import { LadderService } from "./modules/ladder/ladder.service.js";
import { StartggClient } from "./modules/tournaments/startgg.client.js";
import { DisplayAdminStore } from "./modules/display-admin/display-admin.store.js";
import { createTournamentRouter } from "./modules/tournaments/tournaments.routes.js";
import { TournamentsPostgresRepository } from "./modules/tournaments/tournaments.postgres-repository.js";
import {
  CompositeTournamentNotifier,
  TelegramTournamentNotifier,
  WhatsAppTournamentNotifier,
} from "./modules/tournaments/tournament-notifier.js";
import { TournamentsService } from "./modules/tournaments/tournaments.service.js";
import { SmtpRegistrationMailer } from "./modules/registration/registration-mailer.js";
import { RegistrationService } from "./modules/registration/registration.service.js";
import { createTop8Routers } from "./modules/top8/top8.routes.js";
import { createFortniteRouters } from './modules/fortnite/fortnite.routes.js';
import { FortniteService } from './modules/fortnite/fortnite.service.js';
import { TeamsService } from './modules/teams/teams.service.js';
import { createTeamsRouter } from './modules/teams/teams.routes.js';
import { createRegistrationOptionsRouter, createRegistrationRouter } from "./modules/registration/registration.routes.js";

export async function createApp() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const workspaceRoot = path.resolve(__dirname, "..", "..");
  const displayWebDir = path.join(workspaceRoot, "display-web");
  const displayAdminDataDir = process.env.DISPLAY_ADMIN_DATA_DIR?.trim() || path.join(workspaceRoot, "data", "display-admin");
  const androidAppUpdatesDir = process.env.ANDROID_APP_UPDATES_DIR?.trim() || path.join(workspaceRoot, "data", "android-updates");
  const windowsAppUpdatesDir = process.env.WINDOWS_APP_UPDATES_DIR?.trim() || path.join(workspaceRoot, "data", "windows-updates");
  const appClientKey = process.env.APP_CLIENT_KEY?.trim();
  const displayAdminStore = new DisplayAdminStore(displayAdminDataDir);
  await displayAdminStore.ensureReady();
  const androidAppUpdatesStore = new AndroidAppUpdatesStore(androidAppUpdatesDir, process.env.PUBLIC_BASE_URL);
  await androidAppUpdatesStore.ensureReady();
  const windowsAppUpdatesStore = new WindowsAppUpdatesStore(windowsAppUpdatesDir, process.env.PUBLIC_BASE_URL);
  await windowsAppUpdatesStore.ensureReady();
  const pool: Pool = createDatabasePool();
  const repository = new TournamentsPostgresRepository(pool);
  await repository.ensureSchema();
  const playerRepository = new PlayerPostgresRepository(pool);
  await playerRepository.ensureSchema();
  const ladderRepository = new LadderPostgresRepository(pool);
  await ladderRepository.ensureSchema();
  const notifier = new CompositeTournamentNotifier([
    new PlayerPushNotifier(playerRepository, {
      serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
      serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    }),
    new TelegramTournamentNotifier({
      token: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
      templates: displayAdminStore,
    }),
    new WhatsAppTournamentNotifier({
      bin: process.env.WHATSAPP_WACLI_BIN,
      groupJid: process.env.WHATSAPP_GROUP_JID,
      templates: displayAdminStore,
    }),
  ]);
  const startggClient = new StartggClient(process.env.STARTGG_API_TOKEN);
  const tournamentsService = new TournamentsService(
    repository,
    notifier,
    startggClient,
  );
  const ladderService = new LadderService(
    ladderRepository,
    repository,
    notifier,
  );
  tournamentsService.setLadderCoordinator((id, match, station) => ladderService.reserveForBracket(id, match, station));
  const registrationService = new RegistrationService(repository, tournamentsService, new SmtpRegistrationMailer(), process.env.PUBLIC_BASE_URL);
  await repository.cleanExpiredRegistrations();
  const registrationCleanup = setInterval(() => {
    void repository.cleanExpiredRegistrations().catch(() => console.error("[registration] Could not complete cleanup"));
  }, 3600000);
  registrationCleanup.unref();
  const registrationWorker=setInterval(()=>{void registrationService.maintenance().catch(()=>console.error('[registration] Work pending; retrying later'));},30000);
  registrationWorker.unref();
  const playerService = new PlayerService(
    playerRepository,
    repository,
    tournamentsService,
    ladderService,
    new StartggOAuthClient(
      process.env.STARTGG_OAUTH_CLIENT_ID,
      process.env.STARTGG_OAUTH_CLIENT_SECRET,
    ),
    process.env.PUBLIC_BASE_URL,
  );
  await pool.query("select 1");
  // A fresh self-hosted installation starts empty unless sample data is requested.
  if (process.env.SEED_DEMO_DATA === 'true') await tournamentsService.seedDemoData();
  await tournamentsService.resumePendingSyncs();
  await tournamentsService.resumeBackgroundImports();
  const syncRecoveryTimer = setInterval(() => {
    void tournamentsService.resumePendingSyncs().catch(() => console.error("[startgg:recovery] Could not recover the pending queue"));
  }, 15000);
  syncRecoveryTimer.unref();
  void ladderService.tick().catch(error => console.error("[ladder-worker]", error));
  const ladderTimer = setInterval(() => { void ladderService.tick().catch(error => console.error("[ladder-worker]", error)); }, 5000);
  ladderTimer.unref();

  const app = express();
  app.use(cors());
  app.use("/api/top8/project",express.json({limit:"80mb"}));
  app.use(express.json());
  app.use((request, response, next) => {
    if (
      request.path === "/health"
      || request.path === "/"
      || request.path.startsWith("/admin")
      || request.path.startsWith("/display-assets/")
      || request.path.startsWith("/downloads/android/")
      || request.path.startsWith("/downloads/windows/")
      || request.path.startsWith("/api/management-auth/")
      || request.path.startsWith("/api/display-admin/")
      || request.path.startsWith("/api/manage/")
      || request.path.startsWith("/api/app-updates/")
      || request.path.startsWith("/api/player/auth/")
      || request.path.startsWith("/api/public-registration/")
      || request.path.startsWith("/api/top8/")
      || request.path.startsWith("/api/registration-admin/")
      || request.path.startsWith('/api/fortnite/')
      || !request.path.startsWith("/api/")
    ) {
      return next();
    }

    if (!appClientKey) {
      return next();
    }

    const headerKey = request.header("x-app-key");
    if (headerKey !== appClientKey) {
      return response.status(403).json({ message: "Forbidden client" });
    }

    return next();
  });

  app.get("/health", async (_request, response) => {
    try {
      await pool.query("select 1");
      response.json({ status: "ok", database: "up" });
    } catch {
      response.status(503).json({ status: "degraded", database: "down" });
    }
  });

  app.get("/", (_request, response) => {
    const indexPath = path.join(displayWebDir, "index.html");
    if (fs.existsSync(indexPath)) {
      return response.sendFile(indexPath);
    }
    return response.json({ name: "gestor-torneos-api", version: "0.1.0" });
  });

  if (fs.existsSync(displayWebDir)) {
    app.use("/display-assets/builtin", express.static(path.join(displayWebDir, "themes", "assets")));
    app.use("/downloads/android", express.static(androidAppUpdatesStore.filesDir));
    app.use("/downloads/windows", express.static(windowsAppUpdatesStore.filesDir));
    app.use("/display-web", express.static(displayWebDir));
    app.use("/admin", express.static(path.join(displayWebDir, "admin")));
    app.use("/manage", express.static(path.join(displayWebDir, "manage")));
    app.use(express.static(displayWebDir));
    app.get("/admin", (_request, response) => response.sendFile(path.join(displayWebDir, "admin", "index.html")));
    app.get("/manage", (_request, response) => response.sendFile(path.join(displayWebDir, "manage", "index.html")));
  }

  const managementGuard = requireManagement(displayAdminStore.accounts);
  app.use('/api/management-auth', createManagementAuthRouter(displayAdminStore.accounts));
  app.use('/api/tournaments', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.query.includeArchived === 'true' || /\/(team-roster|activity)(\/|$)/.test(req.path)) return managementGuard(req, res, next);
    next();
  });
  app.use('/api/admin', managementGuard);
  app.use("/api/display-admin", createDisplayAdminRouter(displayAdminStore));
  app.get("/api/app-updates/android/:applicationId", async (request, response, next) => {
    try {
      const update = await androidAppUpdatesStore.getUpdate(request.params.applicationId, request);
      if (!update) {
        return response.status(404).json({ message: "No update configured" });
      }
      return response.json(update);
    } catch (error) {
      return next(error);
    }
  });
  app.get("/api/app-updates/windows/:applicationId", async (request, response, next) => {
    try {
      const update = await windowsAppUpdatesStore.getUpdate(request.params.applicationId, request);
      if (!update) {
        return response.status(404).json({ message: "No update configured" });
      }
      return response.json(update);
    } catch (error) {
      return next(error);
    }
  });
  app.get("/api/admin/notification-settings", (request, response) => {
    if (!response.locals.managementUser) {
      return response.status(403).json({ message: "Admin access required" });
    }
    return displayAdminStore.getNotificationSettings().then((settings) => response.json(settings));
  });
  app.post("/api/admin/notification-settings", (request, response) => {
    if (!response.locals.managementUser) {
      return response.status(403).json({ message: "Admin access required" });
    }
    const telegramEnabled = request.body?.telegramEnabled;
    const whatsappEnabled = request.body?.whatsappEnabled;
    if (typeof telegramEnabled !== "boolean" || typeof whatsappEnabled !== "boolean") {
      return response.status(400).json({ message: "Notification settings are invalid" });
    }
    return displayAdminStore
      .saveNotificationSettings({ telegramEnabled, whatsappEnabled })
      .then((settings) => response.json(settings));
  });
  const registrationAdmin=createRegistrationAdminRouters(repository,registrationService,new TeamsService(repository,tournamentsService),process.env.PUBLIC_BASE_URL,displayAdminStore.accounts);
  app.use('/api/registration-admin',registrationAdmin.publicRouter);
  app.use('/api/tournaments/:tournamentId/registration-admin',registrationAdmin.protectedRouter);
  app.use("/api/public-registration", createRegistrationRouter(registrationService));
  const top8 = createTop8Routers(tournamentsService, startggClient, process.env.PUBLIC_BASE_URL,repository,displayAdminStore.accounts);
  app.use('/api/top8/assets', createTop8AssetRouter(new Top8Assets(path.join(displayWebDir, 'assets', 'top8-library'), path.join(displayAdminDataDir, 'top8-library-cache'))));
  app.use('/api/top8', top8.publicRouter);
  app.use('/api/tournaments/:tournamentId/top8-session', top8.protectedRouter);
  app.use("/api/tournaments/:tournamentId/public-options", createRegistrationOptionsRouter(registrationService));
  app.use('/api/tournaments/:tournamentId/team-roster', createTeamsRouter(new TeamsService(repository,tournamentsService)));
  const fortnite=createFortniteRouters(new FortniteService(repository),process.env.PUBLIC_BASE_URL,displayAdminStore.accounts);
  app.use('/api/fortnite',fortnite.publicRouter);
  app.use('/api/tournaments/:tournamentId/fortnite',fortnite.protectedRouter);
  app.use("/api/manage", createManageRouter(tournamentsService, ladderService, displayAdminStore, [
    ['/tournaments/:tournamentId/registration-admin', registrationAdmin.protectedRouter],
    ['/tournaments/:tournamentId/public-options', createRegistrationOptionsRouter(registrationService)],
    ['/tournaments/:tournamentId/team-roster', createTeamsRouter(new TeamsService(repository,tournamentsService))],
    ['/tournaments/:tournamentId/fortnite', fortnite.protectedRouter],
    ['/tournaments/:tournamentId/top8-session', top8.protectedRouter],
  ]));
  app.use("/api/tournaments", createTournamentRouter(tournamentsService, ladderService));
  app.use("/api/player", createPlayerRouter(playerService));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ArchivedTournamentError) { response.status(409).json({message:error.message}); return; }
    console.error(error);
    response.status(500).json({ message: "Internal server error" });
  });
  return app;
}
