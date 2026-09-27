import { randomUUID } from 'node:crypto';
import { assertTournamentWritable } from '../tournaments/tournament-archive.js';
import { z } from 'zod';
import type { TournamentsPostgresRepository } from '../tournaments/tournaments.postgres-repository.js';
import { createFortniteRound, fortniteConfig, fortniteStandings, fortniteSummary, FORTNITE_POINTS, type FortniteState } from './fortnite-model.js';

export class FortniteError extends Error { constructor(message:string,readonly status=409) { super(message); } }
const target={revision:z.string().uuid(),groupId:z.string().uuid(),gameNumber:z.number().int().min(1).max(20)};
export const fortniteActionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('GENERATE')}).strict(),
  z.object({action:z.literal('START'),...target,vipName:z.string().trim().min(1).max(80).default('VIP')}).strict(),
  z.object({action:z.literal('GAME'),...target,vipName:z.string().trim().min(1).max(80).default('VIP'),complete:z.boolean(),rows:z.array(z.object({
    participantId:z.string(),placement:z.number().int().min(0).max(3),kills:z.number().int().min(0).max(100),vipKill:z.boolean(),absent:z.boolean().optional()
  }).strict()).min(1).max(100)}).strict(),
  z.object({action:z.literal('ADVANCE'),revision:z.string().uuid(),acceptTies:z.boolean().optional()}).strict(),
  z.object({action:z.literal('ANNUL'),...target,reason:z.string().trim().min(3).max(300)}).strict(),
  z.object({action:z.literal('REOPEN'),revision:z.string().uuid(),reason:z.string().trim().min(3).max(300)}).strict(),
  z.object({action:z.literal('EXCLUDE'),revision:z.string().uuid(),participantId:z.string(),status:z.enum(['DQ','WITHDRAWN','ACTIVE']),reason:z.string().trim().min(3).max(300)}).strict(),
]);

export class FortniteService {
  constructor(private readonly repo:TournamentsPostgresRepository) {}
  private async tournament(id:string) {
    const t=await this.repo.getTournament(id);
    if(!t||t.importSource||t.settings.bracketMode!=='FORTNITE')throw new FortniteError('This tournament does not use the Fortnite format',404);
    return t;
  }
  async overview(id:string) {
    return this.repo.withTournamentTransaction(id,async()=>{
      const tournament=await this.tournament(id),state=await this.repo.getFortniteState(id);
      const participants=await this.repo.listParticipants(id);
      return {tournament:{id,title:tournament.title,status:tournament.status,maxParticipants:tournament.maxParticipants},config:fortniteConfig(tournament.settings),
        participants:participants.map(p=>({id:p.id,name:p.displayName})),points:FORTNITE_POINTS,state,summary:fortniteSummary(state)};
    });
  }
  async action(id:string,raw:z.input<typeof fortniteActionSchema>) {
    const input=fortniteActionSchema.parse(raw);
    return this.repo.withTournamentTransaction(id,async()=>{
      const t=await this.tournament(id),config=fortniteConfig(t.settings);
      assertTournamentWritable(t);
      let state=await this.repo.getFortniteState(id);
      const participants=await this.repo.listParticipants(id);
      const audit=()=>{
        const round=state?.rounds.at(-1),group='groupId' in input?round?.groups.find(g=>g.id===input.groupId):undefined;
        const game=group&&'gameNumber' in input?group.games.find(g=>g.number===input.gameNumber):undefined;
        return {title:`${round?.final?'Final':'Round '+(round?.number??1)}${group?' · Group '+group.number:''}${game?' · Game '+game.number:''}`,
          status:game?.status??t.status,fortnite:game?{vipName:game.vipName,rows:game.rows.map(row=>({...row,name:participants.find(p=>p.id===row.participantId)?.displayName}))}:undefined};
      };
      const before=structuredClone(audit());
      const priorState = ['REOPEN','ANNUL','EXCLUDE'].includes(input.action) ? structuredClone(state) : undefined;
      if(input.action==='GENERATE') {
        if(state)throw new FortniteError('Groups have already been generated. Reset the tournament in the app to draw them again');
        if(!['DRAFT','PUBLISHED','CHECK_IN'].includes(t.status))throw new FortniteError('Groups cannot be generated in the current tournament state');
        if(participants.length<2||participants.length>t.maxParticipants)throw new FortniteError('At least two entrants are required, within capacity');
        const eligible=participants.filter(p=>p.status==='ACTIVE'&&(!t.settings.checkInRequired||p.checkedIn));
        if(eligible.length<2)throw new FortniteError('At least two active players with confirmed attendance are required when check-in is mandatory');
        state={revision:randomUUID(),rounds:[createFortniteRound(eligible.map(p=>p.id),1,config)]};
        t.status='READY';t.settings={...t.settings,registrationEnabled:false};
      } else {
        if(!state||(['ADVANCE','REOPEN','EXCLUDE'].includes(input.action)&&state.revision!==input.revision))throw new FortniteError('Another device changed the tournament. Refresh before saving');
        if(!['READY','IN_PROGRESS'].includes(t.status)&&!(input.action==='REOPEN'&&t.status==='COMPLETED'))throw new FortniteError('Results cannot be changed in the current tournament state');
        if(input.action==='REOPEN') {
          const latest=state.rounds.at(-1)!;
          if(!latest.closed) {
            if(state.rounds.length<2||latest.groups.some(g=>g.games.some(p=>p.status!=='PENDING'||p.rows.length)))throw new FortniteError('The previous round can only be reopened before starting or saving score sheets in the next round');
            state.rounds.pop();
          }
          const reopened=state.rounds.at(-1)!;reopened.closed=false;t.status='IN_PROGRESS';
          for(const g of reopened.groups)for(const p of g.games)p.revision=randomUUID();
          const active=new Set(reopened.groups.flatMap(g=>g.slots.filter(s=>!g.excluded?.[s.participantId]).map(s=>s.participantId)));
          await this.repo.replaceParticipants(id,participants.map(p=>({...p,status:active.has(p.id)?'ACTIVE':p.status==='DISQUALIFIED'?'DISQUALIFIED':'ELIMINATED'})));
        }
        const round=state.rounds.at(-1)!;
        if(round.closed)throw new FortniteError('The round is already closed');
        if(input.action==='REOPEN') {
          // Reopening is handled above; no scores are discarded.
        } else if(input.action==='EXCLUDE') {
          const g=round.groups.find(g=>g.slots.some(s=>s.participantId===input.participantId));
          if(!g)throw new FortniteError('The player is not part of this round');
          g.excluded??={};
          if(input.status==='ACTIVE')delete g.excluded[input.participantId];else g.excluded[input.participantId]=input.status;
          for(const game of g.games)game.revision=randomUUID();
          await this.repo.replaceParticipants(id,participants.map(p=>p.id===input.participantId?{...p,status:input.status==='ACTIVE'?'ACTIVE':input.status==='DQ'?'DISQUALIFIED':'ELIMINATED'}:p));
        } else if(input.action==='ADVANCE') {
          if(round.groups.some(g=>g.games.some(game=>game.status!=='COMPLETED')))throw new FortniteError('Confirm all games in every group before closing the round');
          if(round.groups.some(g=>fortniteStandings(g).some(r=>r.cutTie))&&!input.acceptTies)throw new FortniteError('There is a tie at the cutoff. Review the published tiebreaker and confirm before closing');
          if(round.groups.every(g=>fortniteStandings(g).every(r=>r.excluded)))throw new FortniteError('No eligible players remain');
          round.closed=true;
          if(round.final) {
            t.status='COMPLETED';
            const champion=fortniteStandings(round.groups[0])[0].participantId;
            await this.repo.replaceParticipants(id,participants.map(p=>({...p,status:p.status==='DISQUALIFIED'?'DISQUALIFIED':p.id===champion?'ACTIVE':'ELIMINATED'})));
          } else {
            const qualifiers=round.groups.flatMap(group=>fortniteStandings(group).filter(row=>row.qualifies).map(row=>row.participantId));
            state.rounds.push(createFortniteRound(qualifiers,round.number+1,config));
            const remaining=new Set(qualifiers);
            await this.repo.replaceParticipants(id,participants.map(p=>({...p,status:p.status==='DISQUALIFIED'?'DISQUALIFIED':remaining.has(p.id)?'ACTIVE':'ELIMINATED'})));
          }
        } else {
          const group=round.groups.find(g=>g.id===input.groupId),game=group?.games.find(g=>g.number===input.gameNumber);
          if(!group||!game)throw new FortniteError('The game is not part of the current round');
          if(game.revision!==input.revision)throw new FortniteError('Another device changed this game. Refresh before saving');
          if(group.games.some(g=>g.number<game.number&&g.status!=='COMPLETED'))throw new FortniteError('Complete earlier games in this group first');
          const ids=new Set(group.slots.map(s=>s.participantId));

          if(input.action==='ANNUL') {
            if(group.games.some(p=>p.number>game.number&&(p.status!=='PENDING'||p.rows.length)))throw new FortniteError('Annul later games in this group first');
            game.rows=[];game.status='PENDING';
          } else if(input.action==='START') {
            if(game.status!=='PENDING')throw new FortniteError('The game has already started');
            game.vipName=input.vipName;game.status='PLAYING';
          } else {
            if(game.status==='COMPLETED'&&!input.complete)throw new FortniteError('To correct a confirmed game, confirm the entire score sheet again');
            if(input.rows.length!==ids.size||new Set(input.rows.map(r=>r.participantId)).size!==ids.size||input.rows.some(r=>!ids.has(r.participantId)))throw new FortniteError('The score sheet must contain exactly one row for each player in the group');
            const present=input.rows.filter(r=>!r.absent);
            if(input.rows.some(r=>r.absent&&(r.placement||r.kills||r.vipKill)))throw new FortniteError('An absent player cannot have a podium placement, kills or VIP bonus');
            const podium=present.filter(r=>r.placement>0).map(r=>r.placement);
            if(new Set(podium).size!==podium.length)throw new FortniteError('Two players cannot occupy the same podium position');
            if(input.complete&&Array.from({length:Math.min(3,present.length)},(_,i)=>i+1).some(p=>!podium.includes(p)))throw new FortniteError('Enter first, second and third place (when there are at least three players)');
            if(input.rows.reduce((sum,r)=>sum+r.kills,0)>Math.max(0,present.length-1)+Number(input.rows.some(r=>r.vipKill)))throw new FortniteError('Kills cannot exceed eliminated participants plus the VIP if eliminated');
            const bonuses=input.rows.filter(r=>r.vipKill);
            if(bonuses.length>1||bonuses.some(r=>r.kills<1))throw new FortniteError('Only one player may eliminate the external VIP, and must have at least one kill');
            game.rows=input.rows;game.vipName=input.vipName;game.status=input.complete?'COMPLETED':'PLAYING';
          }
          t.status='IN_PROGRESS';
          game.revision=randomUUID();
        }
        state.revision=randomUUID();
      }
      await this.repo.saveFortniteState(id,state as FortniteState);
      await this.repo.saveTournament({...t,updatedAt:new Date().toISOString()});
      await this.repo.appendActivity({id:randomUUID(),tournamentId:id,action:'fortnite'+input.action,createdAt:new Date().toISOString(),platform:'panel Fortnite',before:{...before,...(priorState?{state:priorState}:{})},after:{...audit(),...('reason' in input?{reason:input.reason}:{})}});
      return this.overview(id);
    });
  }
}
