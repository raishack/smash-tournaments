import type { ManagementAuthStore } from '../management-auth/management-auth.store.js';
import { Router, type RequestHandler } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import type { TournamentsPostgresRepository } from '../tournaments/tournaments.postgres-repository.js';
import { TeamsService, teamActionSchema } from '../teams/teams.service.js';
import { RegistrationService, publicOptionsSchema } from './registration.service.js';

export function createRegistrationAdminRouters(repo:TournamentsPostgresRepository,registration:RegistrationService,teams:TeamsService,baseUrl?:string,accounts?:ManagementAuthStore) {
  const tickets=new Map<string,{id:string;expires:number;ownerToken?:string}>(),sessions=new Map<string,{id:string;expires:number;ownerToken?:string}>();
  const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  const protectedRouter=Router({mergeParams:true}),publicRouter=Router();
  const run=(fn:RequestHandler):RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res,next)).catch(next);};
  const clean=()=>{for(const map of [tickets,sessions])for(const [key,value] of map)if(value.expires<=Date.now())map.delete(key);};
  async function view(id:string) {
    const t=await repo.getTournament(id);if(!t||t.importSource)throw Error('Only available for local tournaments');
    const waiting=(await repo.listRegistrations(id)).filter(r=>r.meta?.waitingAt&&!r.meta.cancelledAt).sort((a,b)=>a.meta!.waitingAt!.localeCompare(b.meta!.waitingAt!));
    const availability = await registration.publicInfo(id);
    return {title:t.title,readOnly:t.status==='ARCHIVED',canOpen:availability.canOpen,settings:{registrationEnabled:availability.open,registrationWaitlist:t.settings.registrationWaitlist??false,registrationClosesAt:t.settings.registrationClosesAt??null},waiting:waiting.map(r=>({nickname:r.nickname,since:r.meta!.waitingAt,mode:r.teamData?.mode??'INDIVIDUAL',teamName:r.teamData?.teamName})),roster:(t.settings.teamSize??1)>1?await teams.overview(id):null};
  }
  for(const router of [protectedRouter,publicRouter])router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();});
  protectedRouter.post('/session',run(async(req,res)=>{
    if(!res.locals.managementUser){res.status(403).json({message:'Sign in with your management account'});return;}
    let origin='';try{const u=new URL(baseUrl||'');if(u.protocol==='https:'&&!u.username&&!u.password)origin=u.origin;}catch{}
    if(!origin){res.status(503).json({message:'Public HTTPS URL missing'});return;}
    clean();if(tickets.size>=128||sessions.size>=256){res.status(429).json({message:'Too many open panels'});return;}
    const id=String(req.params.tournamentId);await view(id);const token=randomBytes(32).toString('hex');tickets.set(hash(token),{id,expires:Date.now()+300000,ownerToken:req.header('Authorization')?.replace(/^Bearer /,'')});
    res.json({url:origin+'/registration-admin/?tournamentId='+encodeURIComponent(id)+'#session='+token});
  }));
  publicRouter.post('/session',run(async(req,res)=>{
    clean();const key=hash(String(req.body?.token||'')),ticket=tickets.get(key);
    if(!ticket||(accounts&&!await accounts.userFor(ticket.ownerToken||''))||tickets.get(key)!==ticket||ticket.expires<=Date.now()){res.status(410).json({message:'Link expired. Open the panel from the app'});return;}
    if(sessions.size>=256){res.status(429).json({message:'Too many open panels'});return;}
    tickets.delete(key);const token=randomBytes(32).toString('hex');sessions.set(hash(token),{id:ticket.id,expires:Date.now()+8*3600000,ownerToken:ticket.ownerToken});res.json({token,tournamentId:ticket.id});
  }));
  publicRouter.use(run(async(req,res,next)=>{const access=sessions.get(hash(req.header('Authorization')?.replace(/^Bearer /,'')||''));if(!access||access.expires<=Date.now()||(accounts&&!await accounts.userFor(access.ownerToken||''))){res.status(401).json({message:'Reopen this panel from the app'});return;}res.locals.id=access.id;next();}));
  publicRouter.get('/view',run(async(_req,res)=>{res.json(await view(res.locals.id));}));
  publicRouter.post('/options',run(async(req,res)=>{const input=publicOptionsSchema.safeParse(req.body);if(!input.success){res.status(400).json({message:'Invalid options'});return;}await registration.updateOptions(res.locals.id,input.data);res.json(await view(res.locals.id));}));
  publicRouter.post('/team',run(async(req,res)=>{const input=teamActionSchema.safeParse(req.body);if(!input.success){res.status(400).json({message:'Invalid action'});return;}await teams.action(res.locals.id,input.data);res.json(await view(res.locals.id));}));
  for(const router of [protectedRouter,publicRouter])router.use((error:unknown,_req:import('express').Request,res:import('express').Response,_next:import('express').NextFunction)=>{res.status(409).json({message:error instanceof Error&&!('code' in error)?error.message:'Could not complete the operation'});});
  return {protectedRouter,publicRouter};
}
