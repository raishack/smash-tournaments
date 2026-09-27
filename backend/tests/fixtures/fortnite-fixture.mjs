import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { TournamentsPostgresRepository } from '../../dist/modules/tournaments/tournaments.postgres-repository.js';
import { TournamentsService } from '../../dist/modules/tournaments/tournaments.service.js';
import { FortniteService } from '../../dist/modules/fortnite/fortnite.service.js';
export async function fortniteFixture(t,{count=43,size=20,games=2}={}) {
  const db=await PGlite.create();t.after(()=>db.close());
  await db.exec(await readFile(new URL('../../../infra/postgres/init/001_schema.sql',import.meta.url),'utf8'));
  let tail=Promise.resolve();
  const pool={async connect(){const previous=tail;let release;tail=new Promise(r=>{release=r;});await previous;return {release,query:async(sql,args=[])=>args.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]}};},async query(sql,args){const c=await this.connect();try{return await c.query(sql,args);}finally{c.release();}}};
  const repo=new TournamentsPostgresRepository(pool);await repo.ensureSchema();await repo.ensureSchema();
  const now=new Date().toISOString();
  const tournament={id:'fortnite-test',ownerId:'test',title:'Fortnite Tournament Platform',gameTitle:'Fortnite',description:'Battle royale local',platform:'PC',status:'DRAFT',startsAt:now,maxParticipants:count,isPublic:false,createdAt:now,updatedAt:now,
    settings:{format:'SINGLE_ELIMINATION',bracketMode:'FORTNITE',fortniteLobbySize:size,fortniteGamesPerRound:games,bestOf:3,setupCount:1,streamCount:0,registrationEnabled:true,hasThirdPlaceMatch:false,checkInRequired:false,allowRematchReview:true,seedingMethod:'RANDOM',autoCallMatches:false,callTimeoutMinutes:10,manualSeedingLocked:false}};
  await repo.saveTournament(tournament);
  const participants=Array.from({length:count},(_,i)=>({id:`player-${i+1}`,tournamentId:tournament.id,displayName:`Player ${i+1}`,checkedIn:false,status:'ACTIVE',createdAt:now}));
  await repo.replaceParticipants(tournament.id,participants);
  const service=new FortniteService(repo),tournaments=new TournamentsService(repo),action=input=>service.action(tournament.id,input),view=()=>service.overview(tournament.id);
  return {db,repo,service,tournaments,tournament,participants,action,view};
}
export const validRows=group=>group.slots.map((slot,i)=>({participantId:slot.participantId,placement:i<3?i+1:0,kills:0,vipKill:false}));
export const report=(group,number=1)=>({action:'GAME',revision:group.games[number-1].revision,groupId:group.id,gameNumber:number,vipName:'VIP externo',complete:true,rows:validRows(group)});
