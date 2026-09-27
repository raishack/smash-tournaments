import type { ManagementAuthStore } from '../management-auth/management-auth.store.js';
import { topDesignSchema } from './top8-project.js';
import { assertTournamentWritable } from '../tournaments/tournament-archive.js';
import type { TournamentsPostgresRepository } from '../tournaments/tournaments.postgres-repository.js';
import { Router, type RequestHandler } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import type { TournamentsService } from '../tournaments/tournaments.service.js';
import type { StartggClient } from '../tournaments/startgg.client.js';
import { buildTop8Data } from './top8-data.js';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export function createTop8Routers(service: TournamentsService, startgg: Pick<StartggClient, 'getTop8Standings' | 'isConfigured'>, baseUrl?: string,repo?:TournamentsPostgresRepository,accounts?:ManagementAuthStore) {
  const access=new Map<string,{id:string;expires:number;ownerToken?:string}>();
  const sessions = new Map<string, { expires: number; ownerToken?:string; data: ReturnType<typeof buildTop8Data> }>();
  const pending = new Map<string, Promise<ReturnType<typeof buildTop8Data>>>();
  const cache = new Map<string, { expires: number; value: Awaited<ReturnType<StartggClient['getTop8Standings']>> }>();
  const remoteRequests = new Map<string, Promise<Awaited<ReturnType<StartggClient['getTop8Standings']>>>>();
  const protectedRouter = Router({ mergeParams: true });
  const publicRouter = Router();
  const route = (handler: RequestHandler): RequestHandler => (req,res,next) => { Promise.resolve(handler(req,res,next)).catch(next); };
  let origin = '';
  try { const url = new URL(baseUrl || ''); if (url.protocol === 'https:' && !url.username && !url.password) origin = url.origin; } catch { /* Explicit configuration required. */ }
  async function prepare(id: string) {
    const overview = await service.getTournamentOverview(id);
    assertTournamentWritable(overview?.tournament);
    if (!overview || overview.tournament.status !== 'COMPLETED') throw Error('El cartel está disponible cuando termina el torneo');
    let standings;
    const eventId = overview.tournament.importSource?.eventId;
    if (eventId && startgg.isConfigured()) {
      const cached = cache.get(eventId);
      if (cached && cached.expires > Date.now()) standings = cached.value;
      else {
        // The shared start.gg client keeps its pagination/rate-limit retry machinery.
        // An unavailable remote must not block opening the visual editor.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          let remote = remoteRequests.get(eventId);
          if (!remote) {
            remote = startgg.getTop8Standings(eventId).catch(() => []).then(value => {
              cache.set(eventId, { expires: Date.now() + 60000, value });
              return value;
            }).finally(() => { remoteRequests.delete(eventId); });
            remoteRequests.set(eventId, remote);
          }
          standings = await Promise.race([
            remote,
            new Promise<[]>(resolve => { timer = setTimeout(() => resolve([]), 12000); }),
          ]);
          cache.set(eventId, { expires: Date.now() + 60000, value: standings });
          if (cache.size > 128) cache.delete(cache.keys().next().value!);
        } finally { clearTimeout(timer); }
      }
    }
    const data=buildTop8Data(overview.tournament, overview.participants, overview.matches, standings);
    const final=overview.fortnite?.rounds.find(r=>r.final&&r.closed);
    if(final) {
      data.players=final.groups[0].standings.filter(row=>!row.excluded).slice(0,8).map(row=>({id:row.participantId,name:overview.participants.find(p=>p.id===row.participantId)?.displayName??'Jugador',placement:row.rank,characters:[],roster:[]}));
      data.topCount=data.players.length;data.warnings=data.topCount<8?['La final tiene '+data.topCount+' clasificados. Se genera un Top '+data.topCount+'; no se inventan puestos entre grupos eliminados.']:[];data.source='Fortnite';
    }
    if(data.teamTournament&&repo){const members=await repo.listTeamMembers(id);for(const p of data.players)p.roster=members.filter(m=>m.teamId===p.id).map(m=>({nickname:m.nickname,role:m.role}));}
    return data;
  }
  protectedRouter.post('/', route(async (req,res) => {
    if (!origin) { res.status(503).json({ message: 'Falta configurar la URL pública HTTPS de Tournament Platform' }); return; }
    const id = String(req.params.tournamentId);
    for (const [key,value] of sessions) if (value.expires <= Date.now()) sessions.delete(key);
    if (sessions.size >= 128 || pending.size >= 6) { res.status(429).json({ message: 'Hay demasiadas solicitudes. Inténtalo en unos minutos' }); return; }
    let work = pending.get(id);
    if (!work) { work = prepare(id); pending.set(id,work); }
    try {
      const data = await work;
      if (sessions.size >= 128) { res.status(429).json({ message: 'Hay demasiadas solicitudes. Inténtalo en unos minutos' }); return; }
      const token = randomBytes(32).toString('hex');
      sessions.set(digest(token), { expires: Date.now() + 300000, data, ownerToken:req.header('Authorization')?.replace(/^Bearer /,'') });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ url: `${origin}/top8/?tournamentId=${encodeURIComponent(id)}#session=${token}` });
    } catch { res.status(409).json({ message: 'No se pudo preparar el cartel. Comprueba que el torneo ha terminado y vuelve a intentarlo' }); }
    finally { if (pending.get(id) === work) pending.delete(id); }
  }));
  publicRouter.post('/session', route(async (req,res) => {
    res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','no-referrer');
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const key = digest(token); const session = /^[a-f0-9]{64}$/.test(token) ? sessions.get(key) : undefined;
    if (!session || session.expires <= Date.now() || (accounts && !await accounts.userFor(session.ownerToken||'')) || sessions.get(key) !== session || session.expires <= Date.now()) { res.status(410).json({ message: 'El enlace ha caducado o ya se usó. Vuelve a abrir el editor desde la aplicación.' }); return; }
    for(const [key,value] of access)if(value.expires<=Date.now())access.delete(key);
    if(access.size>=256){res.status(429).json({message:'Hay demasiados editores abiertos'});return;}
    sessions.delete(key);const tokenAccess=randomBytes(32).toString('hex');access.set(digest(tokenAccess),{id:session.data.tournamentId,expires:Date.now()+8*3600000,ownerToken:session.ownerToken});
    res.json({...session.data,accessToken:tokenAccess});
  }));
  publicRouter.use(route(async(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');const session=access.get(digest(req.header('Authorization')?.replace(/^Bearer /,'')||''));
    if(!session||session.expires<=Date.now()||(accounts&&!await accounts.userFor(session.ownerToken||''))){res.status(401).json({message:'Vuelve a abrir el editor desde la aplicación'});return;}res.locals.id=session.id;next();
  }));
  publicRouter.get('/data',route(async(_req,res)=>{res.json(await prepare(res.locals.id));}));
  publicRouter.get('/project',route(async(_req,res)=>{res.json(repo?await repo.getTopProject(res.locals.id):null);}));
  publicRouter.post('/project',route(async(req,res)=>{
    const design=topDesignSchema.safeParse(req.body?.design),revision=req.body?.revision;
    if(!repo||!design.success||!Number.isInteger(revision)||revision<0){res.status(400).json({message:'Diseño o revisión no válidos'});return;}
    try{const data=await prepare(res.locals.id),project={version:2,tournamentId:res.locals.id,data,design:design.data};
      res.json({revision:await repo.saveTopProject(res.locals.id,revision,project)});
    }catch(error){res.status(409).json({message:error instanceof Error?error.message:'No se pudo guardar el diseño'});}
  }));
  return { protectedRouter, publicRouter };
}
