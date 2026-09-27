import type { ManagementAuthStore } from '../management-auth/management-auth.store.js';
import { Router, type RequestHandler } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { FortniteService, FortniteError, fortniteActionSchema } from './fortnite.service.js';

const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function createFortniteRouters(service:FortniteService,baseUrl?:string,accounts?:ManagementAuthStore) {
  const tickets=new Map<string,{id:string;expires:number;ownerToken?:string}>(),sessions=new Map<string,{id:string;expires:number;ownerToken?:string}>();
  const protectedRouter=Router({mergeParams:true}),publicRouter=Router();
  const run=(handler:RequestHandler):RequestHandler=>(req,res,next)=>{Promise.resolve(handler(req,res,next)).catch(next);};
  let origin='';try { const url=new URL(baseUrl||'');if(url.protocol==='https:'&&!url.username&&!url.password)origin=url.origin; } catch {}
  const cleanup=()=>{for(const map of [tickets,sessions])for(const [key,value] of map)if(value.expires<=Date.now())map.delete(key);};
  for(const router of [protectedRouter,publicRouter])router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();});
  protectedRouter.post('/session',run(async(req,res)=>{
    if(!origin){res.status(503).json({message:'Configure the public HTTPS URL for Smash Tournaments'});return;}
    cleanup();if(tickets.size>=128||sessions.size>=256){res.status(429).json({message:'Too many panels are open. Try again later'});return;}
    const id=String(req.params.tournamentId);await service.overview(id);
    const token=randomBytes(32).toString('hex');tickets.set(hash(token),{id,expires:Date.now()+300000,ownerToken:req.header('Authorization')?.replace(/^Bearer /,'')});
    res.json({url:`${origin}/fortnite/?tournamentId=${encodeURIComponent(id)}#session=${token}`});
  }));
  protectedRouter.get('/',run(async(req,res)=>{res.json(await service.overview(String(req.params.tournamentId)));}));
  protectedRouter.post('/',run(async(req,res)=>{
    const input=fortniteActionSchema.safeParse(req.body);if(!input.success){res.status(400).json({message:'Invalid Fortnite data'});return;}
    res.json(await service.action(String(req.params.tournamentId),input.data));
  }));
  publicRouter.post('/session',run(async(req,res)=>{
    cleanup();const token=typeof req.body?.token==='string'?req.body.token:'';
    const key=hash(token),ticket=/^[a-f0-9]{64}$/.test(token)?tickets.get(key):undefined;
    if(!ticket||(accounts&&!await accounts.userFor(ticket.ownerToken||''))||tickets.get(key)!==ticket||ticket.expires<=Date.now()){res.status(410).json({message:'This link has expired or was already used. Reopen Fortnite from the app'});return;}
    if(sessions.size>=256){res.status(429).json({message:'Too many open panels'});return;}
    tickets.delete(key);const access=randomBytes(32).toString('hex'),expires=Date.now()+8*60*60*1000;
    sessions.set(hash(access),{id:ticket.id,expires,ownerToken:ticket.ownerToken});res.json({token:access,tournamentId:ticket.id,expires});
  }));
  publicRouter.use(run(async(req,res,next)=>{
    const token=req.header('Authorization')?.replace(/^Bearer /,'')||'',session=/^[a-f0-9]{64}$/.test(token)?sessions.get(hash(token)):undefined;
    if(!session||session.expires<=Date.now()||(accounts&&!await accounts.userFor(session.ownerToken||''))){res.status(401).json({message:'Your session has expired. Reopen Fortnite from the app; saved results are preserved'});return;}
    res.locals.tournamentId=session.id;next();
  }));
  publicRouter.get('/view',run(async(_req,res)=>{res.json(await service.overview(res.locals.tournamentId));}));
  publicRouter.post('/action',run(async(req,res)=>{
    const input=fortniteActionSchema.safeParse(req.body);if(!input.success){res.status(400).json({message:'Review placements, kills and score sheet data'});return;}
    res.json(await service.action(res.locals.tournamentId,input.data));
  }));
  for(const router of [protectedRouter,publicRouter])router.use((error:unknown,_req:import('express').Request,res:import('express').Response,next:import('express').NextFunction)=>{
    if(error instanceof FortniteError)res.status(error.status).json({message:error.message});else next(error);
  });
  return {protectedRouter,publicRouter};
}
