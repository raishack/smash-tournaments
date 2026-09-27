import { ladderControlSchema } from "../ladder/ladder.schemas.js";
import type { RequestHandler } from "express";
import { Router } from "express";
import { operationRequest, OperationConflict } from "./tournament-operations.js";
import {
  callMatchSchema,
  createParticipantSchema,
  createTournamentSchema,
  createStartggImportSchema,
  deleteParticipantSchema,
  deleteTournamentSchema,
  importStartggEventSchema,
  recordGameWinSchema,
  reportDetailedResultSchema,
  resetTournamentSchema,
  resetMatchSchema,
  resolveAbsenceSchema,
  reportResultSchema,
  selectMkAdvancerSchema,
  startggPreviewSchema,
  startLadderSchema,
  finalizeLadderSchema,
  updateMatchCharactersSchema,
  startTournamentSchema,
  startMatchSchema,
  updateParticipantSchema,
  updateTournamentSchema,
  updateSetupsSchema,
} from "./tournament.schemas.js";
import { TournamentsService } from "./tournaments.service.js";
import { LadderService } from "../ladder/ladder.service.js";

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function takeFirstParam(value: string | string[] | undefined): string {
  if (!value) {
    return "";
  }

  return Array.isArray(value) ? value[0] ?? "" : value;
}

function shouldIgnoreLadderOverviewError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message === "La ladder no esta disponible en torneos cerrados"
    || error.message === "La ladder solo esta disponible para torneos importados de start.gg"
    || error.message === "La ladder no esta activa en este torneo";
}

export function createTournamentRouter(service: TournamentsService, ladderService?: LadderService): Router {
  const router = Router();
  router.use((request, response, next) => {
    const sendJson = response.json.bind(response);
    response.json = body => {
      if (body?.operationRevision) response.setHeader("X-Match-Revision", body.operationRevision);
      return sendJson(body);
    };
    const id = request.header("x-operation-id");
    const expectedRevision = request.header("x-match-revision");
    if ((id && !/^[a-zA-Z0-9_-]{8,100}$/.test(id)) || (expectedRevision && !/^[a-f0-9]{64}$/.test(expectedRevision))) {
      return response.status(400).json({ message: "Invalid operation metadata" });
    }
    operationRequest.run({ id, expectedRevision, platform: request.header("x-client-platform")?.slice(0, 40), appVersion: request.header("x-app-version")?.slice(0, 40) }, next);
  });

  router.use("/:tournamentId", asyncRoute(async (request, response, next) => {
    if (request.method !== "GET" && await service.isImporting(takeFirstParam(request.params.tournamentId))) {
      return response.status(409).json({ message: "La importacion sigue en curso. Espera a que termine antes de modificar el torneo." });
    }
    next();
  }));

  router.get("/", asyncRoute(async (request, response) => {
    const includeArchived = request.query.includeArchived === 'true';
    if (includeArchived && !response.locals.managementUser) return response.status(403).json({message:'Inicia sesión para consultar los torneos archivados'});
    response.json(await service.listTournaments(includeArchived));
  }));

  router.post('/:tournamentId/archive', asyncRoute(async (request,response) => {
    if (!response.locals.managementUser) return response.status(403).json({message:'Inicia sesión con tu cuenta de gestión'});
    if (typeof request.body?.archived !== 'boolean') return response.status(400).json({message:'Indica si quieres archivar o desarchivar'});
    try { return response.json(await service.setArchived(takeFirstParam(request.params.tournamentId),request.body.archived)); }
    catch(error) { return response.status(409).json({message:error instanceof Error?error.message:'No se pudo cambiar el archivo'}); }
  }));

  router.post("/admin/validate-delete-key", asyncRoute(async (request, response) => {
    if (!response.locals.managementUser) {
      return response.status(403).json({ message: "Admin access required" });
    }

    return response.status(204).send();
  }));

  router.get("/:tournamentId", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const overview = await service.getTournamentOverview(tournamentId);
    if (!overview) {
      return response.status(404).json({ message: "Tournament not found" });
    }

    let ladder;
    if (ladderService) {
      try {
        ladder = await ladderService.getOverview(tournamentId);
      } catch (error) {
        if (!shouldIgnoreLadderOverviewError(error)) {
          throw error;
        }
      }
    }
    return response.json({ ...overview, ladder });
  }));

  router.get("/:tournamentId/activity", asyncRoute(async (request, response) => {
    response.json(await service.getActivity(takeFirstParam(request.params.tournamentId)));
  }));

  router.get('/:tournamentId/review', asyncRoute(async (request, response) => {
    if (!response.locals.managementUser) return response.status(403).json({ message: 'Inicia sesión con tu cuenta de gestión' });
    response.setHeader('Cache-Control', 'no-store');
    const review = await service.getReview(takeFirstParam(request.params.tournamentId));
    return review ? response.json(review) : response.status(404).json({ message: 'Tournament not found' });
  }));

  router.post("/:tournamentId/matches/:matchId/retry-sync", asyncRoute(async (request, response) => {
    try {
      response.json(await service.retrySync(takeFirstParam(request.params.tournamentId), takeFirstParam(request.params.matchId)));
    } catch (error) {
      response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Sync retry failed" });
    }
  }));

  router.post("/", asyncRoute(async (request, response) => {
    const parsed = createTournamentSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    const tournament = await service.createTournament(parsed.data);
    return response.status(201).json(tournament);
  }));

  router.post("/import/startgg-preview", asyncRoute(async (request, response) => {
    const parsed = startggPreviewSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const preview = await service.previewStartggImport(parsed.data);
      return response.json(preview);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/import/startgg", asyncRoute(async (request, response) => {
    const parsed = createStartggImportSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0]?.message });
    return response.status(202).json(await service.createStartggImport(parsed.data));
  }));

  router.post("/:tournamentId/update", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const parsed = updateTournamentSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const tournament = await service.updateTournament(tournamentId, parsed.data);
      return response.json(tournament);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/setups", asyncRoute(async (request, response) => {
    const parsed = updateSetupsSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: "Los setups deben estar entre 1 y 256 y los streams entre 0 y 2" });
    try {
      return response.json(await service.updateSetups(takeFirstParam(request.params.tournamentId), parsed.data.setupCount, parsed.data.streamCount));
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/participants", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const parsed = createParticipantSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const participant = await service.addParticipant(tournamentId, parsed.data);
      return response.status(201).json(participant);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/import/startgg", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const parsed = importStartggEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const background = request.query.background === "true";
      const overview = background
        ? await service.startBackgroundImport(tournamentId, parsed.data)
        : await service.importFromStartgg(tournamentId, parsed.data);
      return response.status(background ? 202 : 200).json(overview);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/participants/:participantId/attendance", asyncRoute(async (request, response) => {
    if (typeof request.body?.checkedIn !== 'boolean') return response.status(400).json({ message: 'Indica si la asistencia está confirmada' });
    return response.json(await service.updateAttendance(takeFirstParam(request.params.tournamentId), takeFirstParam(request.params.participantId), request.body.checkedIn));
  }));

  router.post("/:tournamentId/participants/:participantId/update", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const participantId = takeFirstParam(request.params.participantId);
    const parsed = updateParticipantSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const participant = await service.updateParticipant(tournamentId, participantId, parsed.data);
      return response.json(participant);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/participants/:participantId/delete", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const participantId = takeFirstParam(request.params.participantId);
    const parsed = deleteParticipantSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      await service.deleteParticipant(tournamentId, participantId);
      return response.status(204).send();
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/reset", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const parsed = resetTournamentSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const tournament = await service.resetTournament(tournamentId);
      return response.json(tournament);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/start", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const parsed = startTournamentSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const tournament = await service.startTournament(tournamentId);
      return response.json(tournament);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.use("/:tournamentId/ladder", (request, response, next) => {
    if (request.method === "GET" || response.locals.managementUser) return next();
    return response.status(401).json({message:"Inicia sesión con tu cuenta de gestión"});
    return next();
  });
  router.get("/:tournamentId/ladder", asyncRoute(async (request,response) => {
    if (!ladderService) return response.status(404).json({message:"Ladder not available"});
    return response.json(await ladderService.getOverview(takeFirstParam(request.params.tournamentId)));
  }));
  router.post("/:tournamentId/ladder/control", asyncRoute(async (request, response) => {
    if (!ladderService) return response.status(404).json({message:"Ladder not available"});
    const parsed = ladderControlSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(parsed.error.flatten());
    try { return response.json(await ladderService.control(takeFirstParam(request.params.tournamentId), parsed.data)); }
    catch (error) { return response.status(400).json({message:error instanceof Error ? error.message : "Unexpected error"}); }
  }));
  router.post("/:tournamentId/ladder/start", asyncRoute(async (request, response) => {
    if (!ladderService) {
      return response.status(404).json({ message: "Ladder not available" });
    }
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const parsed = startLadderSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const overview = await ladderService.startLadder(tournamentId, parsed.data.startedByUserId);
      return response.json(overview);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/ladder/finalize", asyncRoute(async (request, response) => {
    if (!ladderService) {
      return response.status(404).json({ message: "Ladder not available" });
    }
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const parsed = finalizeLadderSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const overview = await ladderService.finalizeLadder(tournamentId, parsed.data.completedByUserId);
      return response.json(overview);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/delete", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const parsed = deleteTournamentSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    if (!response.locals.managementUser) {
      return response.status(403).json({ message: "Admin access required" });
    }

    try {
      await service.deleteTournament(tournamentId);
      return response.status(204).send();
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/bracket", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    try {
      const matches = await service.generateBracket(tournamentId);
      return response.status(201).json(matches);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/matches/:matchId/call", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    const parsed = callMatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const match = await service.callMatch(tournamentId, matchId, parsed.data);
      return response.json(match);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/matches/:matchId/cancel-call", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);

    try {
      const match = await service.cancelMatchCall(tournamentId, matchId);
      return response.json(match);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/matches/:matchId/start", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    const parsed = startMatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const match = await service.startMatch(tournamentId, matchId, parsed.data);
      return response.json(match);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/matches/:matchId/characters", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    const parsed = updateMatchCharactersSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const match = await service.updateMatchCharacters(tournamentId, matchId, parsed.data);
      return response.json(match);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/matches/:matchId/game-win", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    const parsed = recordGameWinSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const match = await service.recordGameWin(tournamentId, matchId, parsed.data);
      return response.json(match);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/matches/:matchId/mkart-advance", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    const parsed = selectMkAdvancerSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const match = await service.selectMarioKartAdvancer(tournamentId, matchId, parsed.data);
      return response.json(match);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/matches/:matchId/absence", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    const parsed = resolveAbsenceSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const match = await service.resolveAbsence(tournamentId, matchId, parsed.data);
      return response.json(match);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/matches/:matchId/reset", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    const parsed = resetMatchSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const match = await service.resetMatch(tournamentId, matchId);
      return response.json(match);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/matches/:matchId/result", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    const parsed = reportResultSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const match = await service.reportResult(tournamentId, matchId, parsed.data);
      return response.json(match);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  router.post("/:tournamentId/matches/:matchId/result-detailed", asyncRoute(async (request, response) => {
    const tournamentId = takeFirstParam(request.params.tournamentId);
    const matchId = takeFirstParam(request.params.matchId);
    const parsed = reportDetailedResultSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(parsed.error.flatten());
    }

    try {
      const match = await service.reportDetailedResult(tournamentId, matchId, parsed.data);
      return response.json(match);
    } catch (error) {
      return response.status(error instanceof OperationConflict ? 409 : 400).json({ message: error instanceof Error ? error.message : "Unexpected error" });
    }
  }));

  return router;
}
