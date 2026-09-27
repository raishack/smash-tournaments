import { Router } from 'express';
import { TeamError, TeamsService, teamActionSchema } from './teams.service.js';

export function createTeamsRouter(service: TeamsService) {
  const router = Router({mergeParams:true});
  router.use((_req,res,next) => { res.setHeader('Cache-Control','no-store'); next(); });
  router.get('/', (req: import('express').Request,res,next) => { service.overview(String(req.params.tournamentId)).then(data=>res.json(data)).catch(next); });
  router.post('/', (req: import('express').Request,res,next) => {
    const input = teamActionSchema.safeParse(req.body);
    if (!input.success) { res.status(400).json({message:'Invalid roster data'}); return; }
    service.action(String(req.params.tournamentId),input.data).then(data=>res.json(data)).catch(next);
  });
  router.use((error: unknown,_req: import('express').Request,res: import('express').Response,next: import('express').NextFunction) => {
    if (error instanceof TeamError) res.status(error.status).json({message:error.message});
    else if (error instanceof Error && !('code' in error)) res.status(409).json({message:error.message});
    else next(error);
  });
  return router;
}
