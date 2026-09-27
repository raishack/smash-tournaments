import { randomInt, randomUUID } from 'node:crypto';
import type { TournamentSettings } from '../../shared/types.js';

export const FORTNITE_POINTS = { first:10, second:6, third:4, kill:1, vip:5 };
export type FortniteRow = { participantId:string; placement:number; kills:number; vipKill:boolean; absent?:boolean };
export type FortniteGame = { number:number; revision:string; status:'PENDING'|'PLAYING'|'COMPLETED'; vipName:string; rows:FortniteRow[] };
export type FortniteGroup = { id:string; number:number; qualifyCount:number; excluded?:Record<string,'DQ'|'WITHDRAWN'>; slots:{participantId:string;seat:number}[]; games:FortniteGame[] };
export type FortniteRound = { number:number; final:boolean; closed:boolean; groups:FortniteGroup[] };
export type FortniteState = { revision:string; rounds:FortniteRound[] };
export function fortniteConfig(settings:TournamentSettings) {
  const lobbySize = settings.fortniteLobbySize ?? 20, gamesPerRound = settings.fortniteGamesPerRound ?? 3;
  if (!Number.isInteger(lobbySize) || lobbySize < 5 || lobbySize > 100 || lobbySize % 5 || !Number.isInteger(gamesPerRound) || gamesPerRound < 1 || gamesPerRound > 20) throw Error('Fortnite: groups of 5 to 100 seats, in multiples of 5, and 1 to 20 games per round');
  if ((settings.teamSize ?? 1) > 1) throw Error('Fortnite is an individual format; disable team mode');
  return { lobbySize,gamesPerRound };
}
export function shuffle<T>(values:T[]):T[] {
  const result = [...values];
  for (let i=result.length-1;i>0;i--) { const j=randomInt(i+1); [result[i],result[j]]=[result[j],result[i]]; }
  return result;
}
export function createFortniteRound(ids:string[], number:number, config:ReturnType<typeof fortniteConfig>):FortniteRound {
  const {lobbySize,gamesPerRound}=config, count=Math.ceil(ids.length/lobbySize), entrants=shuffle(ids);
  // Every group gets at least one qualifier. Large events shrink in intermediate rounds.
  const target=count===1?0:count<=lobbySize?lobbySize:count*Math.floor(lobbySize/2);
  const groups:FortniteGroup[]=[];
  let offset=0;
  for(let i=0;i<count;i++) {
    const size=Math.floor(ids.length/count)+(i<ids.length%count?1:0);
    const seats=shuffle(Array.from({length:lobbySize},(_,j)=>j+1));
    const slots=entrants.slice(offset,offset+size).map((participantId,j)=>({participantId,seat:seats[j]})); offset+=size;
    groups.push({id:randomUUID(),number:i+1,qualifyCount:Math.floor(target/count)+(i<target%count?1:0),slots,
      games:Array.from({length:gamesPerRound},(_,j)=>({number:j+1,revision:randomUUID(),status:'PENDING',vipName:'VIP',rows:[]}))});
  }
  return {number,final:count===1,closed:false,groups};
}
export function fortniteStandings(group:FortniteGroup) {
  const rows=group.slots.map(slot=>({...slot,excluded:(group.excluded?.[slot.participantId]??null) as string|null,points:0,kills:0,vips:0,firsts:0,seconds:0,thirds:0,played:0}));
  const byId=new Map(rows.map(r=>[r.participantId,r]));
  for(const game of group.games.filter(g=>g.status==='COMPLETED')) for(const result of game.rows) {
    const row=byId.get(result.participantId); if(!row||result.absent)continue; row.played++; row.kills+=result.kills; row.vips+=Number(result.vipKill);
    row.firsts+=Number(result.placement===1);row.seconds+=Number(result.placement===2);row.thirds+=Number(result.placement===3);
    row.points+=([0,FORTNITE_POINTS.first,FORTNITE_POINTS.second,FORTNITE_POINTS.third][result.placement]??0)+result.kills*FORTNITE_POINTS.kill+Number(result.vipKill)*FORTNITE_POINTS.vip;
  }
  if(group.games.every(g=>g.status==='COMPLETED'))for(const row of rows)if(!row.played&&!row.excluded)row.excluded='DNS';
  const sorted=rows.sort((a,b)=>Number(Boolean(a.excluded))-Number(Boolean(b.excluded))||b.points-a.points||b.firsts-a.firsts||b.seconds-a.seconds||b.thirds-a.thirds||b.kills-a.kills||b.vips-a.vips||a.seat-b.seat);
  const cut=sorted[group.qualifyCount-1],next=sorted[group.qualifyCount];
  const tied=Boolean(cut&&next&&!cut.excluded&&!next.excluded&&['points','firsts','seconds','thirds','kills','vips'].every(k=>cut[k as 'points']===next[k as 'points']));
  return sorted.map((row,index)=>({...row,rank:index+1,qualifies:!row.excluded&&group.qualifyCount>index,cutTie:tied&&(index===group.qualifyCount-1||index===group.qualifyCount),gapToCut:cut&&!row.excluded?Math.max(0,cut.points-row.points):null}));
}
export function fortniteSummary(state:FortniteState|null) {
  if(!state)return null;
  return {revision:state.revision,points:FORTNITE_POINTS,rounds:state.rounds.map(round=>({...round,groups:round.groups.map(group=>({
    id:group.id,number:group.number,qualifyCount:group.qualifyCount,slots:group.slots,
    games:group.games.map(({rows,...game})=>game),standings:fortniteStandings(group)
  }))}))};
}
