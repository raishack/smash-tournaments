import { Router, type RequestHandler } from "express";
import { RegistrationError, RegistrationService, publicOptionsSchema } from "./registration.service.js";
import { TeamError } from '../teams/teams.service.js';
import { ArchivedTournamentError } from '../tournaments/tournament-archive.js';

const route = (handler: RequestHandler): RequestHandler => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(error => {
    if (error instanceof RegistrationError || error instanceof TeamError || error instanceof ArchivedTournamentError) {
      if (error.status === 429) response.setHeader("Retry-After", "600");
      response.status(error.status).json({ message: error.message });
    } else {
      // Never include raw request bodies, email addresses, tokens or SMTP errors in logs.
      console.error("[registration] Could not complete the operation");
      response.status(503).json({ message: "Could not complete the operation. Try again" });
    }
  });
};

export function createRegistrationRouter(service: RegistrationService) {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  router.get("/:id", route(async (request, response) => {
    response.json(await service.publicInfo(String(request.params.id)));
  }));
  router.post("/:id/request", route(async (request, response) => {
    await service.request(String(request.params.id), request.body, request.ip || request.socket.remoteAddress || "unknown");
    response.status(202).json({ message: "If your email is not verified and you have not requested another link recently, you will receive an email. Check spam too. Your place is assigned on confirmation." });
  }));
  router.post('/:id/recover',route(async(req,res)=>{await service.recover(String(req.params.id),req.body?.email,req.ip||'unknown');res.status(202).json({message:'If that email has a registration, you will receive a link to view it. Check spam too.'});}));
  router.post('/status',route(async(req,res)=>{res.json(await service.status(String(req.body?.token||'')));}));
  router.post('/cancel',route(async(req,res)=>{res.json(await service.cancel(String(req.body?.token||'')));}));
  router.post("/confirm", route(async (request, response) => {
    response.json(await service.confirm(typeof request.body?.token === "string" ? request.body.token : ""));
  }));
  return router;
}

export function createRegistrationOptionsRouter(service: RegistrationService) {
  const router = Router({ mergeParams: true });
  router.post("/", route(async (request, response) => {
    if (!response.locals.managementUser) {
      response.status(403).json({ message: "Sign in to change these settings" });
      return;
    }
    const input = publicOptionsSchema.safeParse(request.body);
    if (!input.success) { response.status(400).json({ message: "Invalid options" }); return; }
    response.json(await service.updateOptions(String(request.params.tournamentId), input.data));
  }));
  return router;
}
