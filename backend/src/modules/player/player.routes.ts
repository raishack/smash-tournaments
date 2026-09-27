import { ladderReviewSchema } from "../ladder/ladder.schemas.js";
import type { RequestHandler } from "express";
import type { ParsedQs } from "qs";
import { Router } from "express";
import {
  createMobileStartggAuthSchema,
  playerLadderDetailedReportSchema,
  playerLadderQueueSchema,
  playerPushTokenSchema,
  playerLadderReadySchema,
  playerReportDetailedResultSchema,
  playerRecordGameWinSchema,
  playerReportResultSchema,
  playerResolveAbsenceSchema,
  playerUpdateCharactersSchema,
} from "./player.schemas.js";
import { PlayerService } from "./player.service.js";

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function readBearerToken(request: Parameters<RequestHandler>[0]): string {
  const header = request.header("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return "";
  }
  return header.slice("Bearer ".length).trim();
}

function takeFirstParam(value: string | ParsedQs | (string | ParsedQs)[] | undefined): string {
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : "";
  }
  return typeof value === "string" ? value : "";
}

function isPlayerSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message === "Player session required"
    || error.message === "Player session not found"
    || error.message === "Player account not found"
    || /^start\.gg OAuth refresh failed \((400|401|403)\)$/.test(error.message);
}

export function createPlayerRouter(service: PlayerService): Router {
  const router = Router();

  router.post("/auth/startgg/mobile/start", asyncRoute(async (request, response) => {
    const parsed = createMobileStartggAuthSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      return response.json(await service.createMobileStartggAuth(parsed.data.redirectUri));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.get("/auth/startgg/callback", asyncRoute(async (request, response) => {
    const code = takeFirstParam(request.query.code);
    const state = takeFirstParam(request.query.state);
    if (!code || !state) {
      return response.status(400).send("Missing code or state");
    }

    try {
      const redirectUrl = await service.finishStartggOAuth(code, state);
      return response.redirect(302, redirectUrl);
    } catch (error) {
      const fallbackRedirect = await service.buildFailedOAuthRedirect(
        state,
        error instanceof Error ? error.message : "Unexpected error",
      );
      if (fallbackRedirect) {
        return response.redirect(302, fallbackRedirect);
      }
      return response.status(400).send(error instanceof Error ? error.message : "Unexpected error");
    }
  }));

  router.post("/auth/logout", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }

    await service.logout(token);
    return response.status(204).send();
  }));

  router.get("/me", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }

    try {
      return response.json(await service.getSessionProfile(token));
    } catch (error) {
      console.error("[player] /me failed:", error);
      const status = isPlayerSessionError(error) ? 401 : 500;
      return response.status(status).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.get("/tournaments", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }

    try {
      return response.json(await service.listMyTournaments(token));
    } catch (error) {
      console.error("[player] /tournaments failed:", error);
      const status = isPlayerSessionError(error) ? 401 : 500;
      return response.status(status).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/push/register", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }

    const parsed = playerPushTokenSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      await service.registerPushToken(token, parsed.data);
      return response.status(204).send();
    } catch (error) {
      const status = isPlayerSessionError(error) ? 401 : 400;
      return response.status(status).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/push/unregister", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }

    const parsed = playerPushTokenSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      await service.unregisterPushToken(token, parsed.data);
      return response.status(204).send();
    } catch (error) {
      const status = isPlayerSessionError(error) ? 401 : 400;
      return response.status(status).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.get("/tournaments/:tournamentId", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    const tournamentId = takeFirstParam(request.params.tournamentId);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }

    try {
      return response.json(await service.getMyTournament(token, tournamentId));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/tournaments/:tournamentId/matches/:matchId/characters", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }

    const parsed = playerUpdateCharactersSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      return response.json(await service.updateMatchCharacters(token, tournamentId, matchId, parsed.data));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/tournaments/:tournamentId/matches/:matchId/game-win", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }

    const parsed = playerRecordGameWinSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      return response.json(await service.recordGameWin(token, tournamentId, matchId, parsed.data));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/tournaments/:tournamentId/matches/:matchId/report", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }

    const parsed = playerReportResultSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      return response.json(await service.reportResult(token, tournamentId, matchId, parsed.data));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/tournaments/:tournamentId/matches/:matchId/report-detailed", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }

    const parsed = playerReportDetailedResultSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      return response.json(await service.reportDetailedResult(token, tournamentId, matchId, parsed.data));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/tournaments/:tournamentId/matches/:matchId/absence", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }

    const parsed = playerResolveAbsenceSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      return response.json(await service.resolveAbsence(token, tournamentId, matchId, parsed.data));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/tournaments/:tournamentId/matches/:matchId/reset", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }

    try {
      return response.json(await service.resetMatch(token, tournamentId, matchId));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/tournaments/:tournamentId/ladder/join", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    const tournamentId = takeFirstParam(request.params.tournamentId);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }
    const parsed = playerLadderQueueSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }
    try {
      return response.json(await service.joinLadderQueue(token, tournamentId, parsed.data));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/tournaments/:tournamentId/ladder/leave", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    const tournamentId = takeFirstParam(request.params.tournamentId);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }
    const parsed = playerLadderQueueSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }
    try {
      return response.json(await service.leaveLadderQueue(token, tournamentId, parsed.data));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/tournaments/:tournamentId/ladder/matches/:matchId/ready", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }
    const parsed = playerLadderReadySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }
    try {
      return response.json(await service.readyLadderMatch(token, tournamentId, matchId, parsed.data));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/tournaments/:tournamentId/ladder/matches/:matchId/cancel", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }
    const parsed = playerLadderReadySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }
    try {
      return response.json(await service.cancelLadderMatch(token, tournamentId, matchId, parsed.data));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/tournaments/:tournamentId/ladder/matches/:matchId/report-detailed", asyncRoute(async (request, response) => {
    const token = readBearerToken(request);
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    if (!token) {
      return response.status(401).json({ message: "Player session required" });
    }
    const parsed = playerLadderDetailedReportSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }
    try {
      return response.json(await service.reportLadderDetailedResult(token, tournamentId, matchId, parsed.data));
    } catch (error) {
      return response.status(isPlayerSessionError(error) ? 401 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/tournaments/:tournamentId/ladder/matches/:matchId/review", asyncRoute(async (request,response) => {
    const token = readBearerToken(request);
    if (!token) return response.status(401).json({message:"Player session required"});
    const parsed = ladderReviewSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(parsed.error.flatten());
    try { return response.json(await service.reviewLadderResult(token,takeFirstParam(request.params.tournamentId),takeFirstParam(request.params.matchId),parsed.data)); }
    catch(error) { return response.status(isPlayerSessionError(error) ? 401 : 400).json({message:error instanceof Error ? error.message : "Unexpected error"}); }
  }));
  return router;
}
