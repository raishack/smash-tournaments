import express from "express";
import { requireManagement } from "../management-auth/management-auth.routes.js";
import { createTournamentRouter } from "../tournaments/tournaments.routes.js";
import { TournamentsService } from "../tournaments/tournaments.service.js";
import { LadderService } from "../ladder/ladder.service.js";
import { DisplayAdminStore } from "../display-admin/display-admin.store.js";
import { SMASH_ULTIMATE_CHARACTERS } from "../tournaments/smash-ultimate.characters.js";

function extractToken(request: express.Request): string | null {
  const header = request.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export function createManageRouter(
  tournamentsService: TournamentsService,
  ladderService: LadderService,
  displayAdminStore: DisplayAdminStore,
  panels: Array<[string, express.Router]> = [],
) {
  const router = express.Router();

  router.use(requireManagement(displayAdminStore.accounts));

  for (const [route, panel] of panels) router.use(route, panel);

  router.get("/smash-characters", (_request, response) => {
    response.json(SMASH_ULTIMATE_CHARACTERS);
  });

  router.use("/tournaments", createTournamentRouter(tournamentsService, ladderService));

  return router;
}
