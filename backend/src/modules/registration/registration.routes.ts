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
      console.error("[registration] No se pudo completar la operación");
      response.status(503).json({ message: "No se ha podido completar la operación. Inténtalo de nuevo" });
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
    response.status(202).json({ message: "Si tu dirección aún no está confirmada y no has pedido otro enlace recientemente, recibirás un correo. Revisa también la carpeta de spam. La plaza se asigna al confirmar." });
  }));
  router.post('/:id/recover',route(async(req,res)=>{await service.recover(String(req.params.id),req.body?.email,req.ip||'unknown');res.status(202).json({message:'Si ese correo tiene una inscripción, recibirás un enlace para consultarla. Revisa también spam.'});}));
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
      response.status(403).json({ message: "Inicia sesión para cambiar estas opciones" });
      return;
    }
    const input = publicOptionsSchema.safeParse(request.body);
    if (!input.success) { response.status(400).json({ message: "Opciones no válidas" }); return; }
    response.json(await service.updateOptions(String(request.params.tournamentId), input.data));
  }));
  return router;
}
