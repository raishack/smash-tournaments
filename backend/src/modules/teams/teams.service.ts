import { randomUUID } from 'node:crypto';
import { assertTournamentWritable } from '../tournaments/tournament-archive.js';
import { z } from 'zod';
import type { Tournament } from '../../shared/types.js';
import type { TournamentsPostgresRepository } from '../tournaments/tournaments.postgres-repository.js';
import type { TournamentsService } from '../tournaments/tournaments.service.js';
import { nickKey, teamSettings, type TeamMember, type TeamRegistration } from './team-types.js';

export class TeamError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
const nickname = z.string().trim().min(2).max(80).refine(v => !/[\u0000-\u001f\u007f]/u.test(v));
const role = z.enum(['PLAYER', 'RESERVE']);
export const teamActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('CREATE_TEAM'), name: nickname, members: z.array(z.object({ id: z.string(), role })).max(40).default([]) }).strict(),
  // Gson clients omit null map values. An absent destination means the solo pool.
  z.object({ action: z.literal('ADD_MEMBER'), nickname, teamId: z.string().min(1).nullable().default(null), role }).strict(),
  z.object({ action: z.literal('MOVE_MEMBER'), id: z.string(), revision: z.number().int(), teamId: z.string().min(1).nullable().default(null), role }).strict(),
  z.object({ action: z.literal('REMOVE_MEMBER'), id: z.string(), revision: z.number().int() }).strict(),
  z.object({action:z.literal('SUBSTITUTE'),starterId:z.string(),reserveId:z.string(),starterRevision:z.number().int(),reserveRevision:z.number().int()}).strict(),
  z.object({action:z.literal('CAPTAIN'),id:z.string(),revision:z.number().int()}).strict(),
  z.object({action:z.literal('ROTATE_CODE'),teamId:z.string(),code:z.string()}).strict(),
  z.object({action:z.literal('CHECK_IN'),teamId:z.string(),checkedIn:z.boolean()}).strict(),
  z.object({ action: z.literal('SOLO_OPTION'), enabled: z.boolean() }).strict(),
]);

export class TeamsService {
  constructor(private readonly repo: TournamentsPostgresRepository, private readonly tournaments: TournamentsService) {}

  private async tournament(id: string, edit = false): Promise<Tournament> {
    const t = await this.repo.getTournament(id);
    if (!t || t.importSource || t.settings.importJob || (t.settings.teamSize ?? 1) <= 1) throw new TeamError('This is not a local team tournament', 404);
    if (edit && (!['DRAFT','PUBLISHED','CHECK_IN'].includes(t.status) || (await this.repo.listMatches(id)).length)) throw new TeamError('Rosters are locked. Edit them before generating the bracket');
    return t;
  }

  async overview(id: string) {
    return this.repo.withTournamentTransaction(id, async () => {
      const t = await this.tournament(id);
      const members = await this.repo.listTeamMembers(id);
      const participants = await this.repo.listParticipants(id);
      const codes = new Map((await this.repo.listTeamCodes(id)).map(row => [row.teamId,row.code]));
      const rosters = new Map<string,TeamMember[]>();
      for (const member of members) if (member.teamId) {
        const roster = rosters.get(member.teamId) ?? [];
        roster.push(member); rosters.set(member.teamId,roster);
      }
      const teams = [];
      for (const p of participants) teams.push({ id: p.id, name: p.displayName, checkedIn:p.checkedIn,complete:(rosters.get(p.id)??[]).filter(m=>m.role==='PLAYER').length===teamSettings(t.settings).teamSize,code: codes.get(p.id) ?? (t.status === 'ARCHIVED' ? '' : await this.repo.ensureTeamCode(id,p.id)), members: rosters.get(p.id) ?? [] });
      return { ...teamSettings(t.settings),canSubstitute:['READY','IN_PROGRESS','CHECK_IN','PUBLISHED','DRAFT'].includes(t.status), canEdit: ['DRAFT','PUBLISHED','CHECK_IN'].includes(t.status) && !(await this.repo.listMatches(id)).length,
        teams, unassigned: members.filter(m => !m.teamId) };
    });
  }

  private async capacity(t: Tournament, teamId: string | null, targetRole: TeamMember['role'], exclude?: string) {
    const members = (await this.repo.listTeamMembers(t.id)).filter(m => m.id !== exclude);
    if (!teamId) {
      if (members.filter(m => !m.teamId).length >= 5000) throw new TeamError('The solo player list is full');
      return;
    }
    if (!(await this.repo.listParticipants(t.id)).some(p => p.id === teamId)) throw new TeamError('The team is no longer available');
    const limit = targetRole === 'PLAYER' ? teamSettings(t.settings).teamSize : teamSettings(t.settings).reserveCount;
    if (members.filter(m => m.teamId === teamId && m.role === targetRole).length >= limit) throw new TeamError(targetRole === 'PLAYER' ? 'The team already has all its starters' : 'The team has no reserve places available');
  }

  async addMember(id: string, name: string, teamId: string | null, targetRole: TeamMember['role']) {
    const t = await this.tournament(id,true);
    const valid = nickname.safeParse(name);
    if (!valid.success) throw new TeamError('Nicknames must contain 2 to 80 characters',400);
    if ((await this.repo.listTeamMembers(id)).some(m => nickKey(m.nickname) === nickKey(valid.data))) throw new TeamError('This nickname is already in a roster or the solo player list');
    await this.capacity(t,teamId,targetRole);
    const member: TeamMember = { id: randomUUID(), tournamentId:id, nickname:valid.data, teamId, role:teamId ? targetRole : 'PLAYER', revision:1 };
    await this.repo.saveTeamMember(member);
    return member;
  }

  async action(id: string, input: z.infer<typeof teamActionSchema>) {
    input = teamActionSchema.parse(input);
    return this.repo.withTournamentTransaction(id,async () => {
      const operational=['SUBSTITUTE','CAPTAIN','ROTATE_CODE'].includes(input.action);
      const t = await this.tournament(id,!operational);
      assertTournamentWritable(t);
      if(operational&&['COMPLETED','CANCELLED'].includes(t.status))throw new TeamError('The tournament is closed');
      const before=await this.repo.listTeamMembers(id);
      if(input.action==='SUBSTITUTE') {
        const starter=before.find(m=>m.id===input.starterId),reserve=before.find(m=>m.id===input.reserveId);
        if(!starter||!reserve||starter.revision!==input.starterRevision||reserve.revision!==input.reserveRevision)throw new TeamError('The roster has changed. Refresh before substituting');
        if(!starter.teamId||starter.teamId!==reserve.teamId||starter.role!=='PLAYER'||reserve.role!=='RESERVE')throw new TeamError('Select a starter and a reserve from the same team');
        await this.repo.saveTeamMember({...starter,role:'RESERVE',revision:starter.revision+1});
        await this.repo.saveTeamMember({...reserve,role:'PLAYER',revision:reserve.revision+1});
      } else if(input.action==='CAPTAIN') {
        const selected=before.find(m=>m.id===input.id);
        if(!selected?.teamId||selected.revision!==input.revision)throw new TeamError('The player has changed or has no team');
        for(const member of before.filter(m=>m.teamId===selected.teamId))await this.repo.saveTeamMember({...member,revision:member.revision+1,meta:{...member.meta,captain:member.id===selected.id}});
      } else if(input.action==='ROTATE_CODE') {
        const code=(await this.repo.listTeamCodes(id)).find(c=>c.teamId===input.teamId);
        if(!code||code.code!==input.code)throw new TeamError('The code has changed. Refresh before regenerating it');
        await this.repo.rotateTeamCode(id,input.teamId);
      } else if(input.action==='CHECK_IN') {
        const participants=await this.repo.listParticipants(id);
        if(!participants.some(p=>p.id===input.teamId))throw new TeamError('Team unavailable');
        await this.repo.replaceParticipants(id,participants.map(p=>p.id===input.teamId?{...p,checkedIn:input.checkedIn}:p));
      } else if (input.action === 'SOLO_OPTION') {
        await this.repo.saveTournament({ ...t, settings:{...t.settings,allowSoloRegistration:input.enabled}, updatedAt:new Date().toISOString() });
      } else if (input.action === 'CREATE_TEAM') {
        if (new Set(input.members.map(m => m.id)).size !== input.members.length) throw new TeamError('The selection contains duplicate players');
        const members = await this.repo.listTeamMembers(id);
        for (const row of input.members) if (!members.some(m => m.id === row.id && !m.teamId)) throw new TeamError('A selected player has already been assigned. Refresh the list');
        const team = await this.tournaments.addParticipant(id,{ displayName:input.name });
        for (const row of input.members) {
          await this.capacity(t,team.id,row.role);
          const member = members.find(m => m.id === row.id)!;
          await this.repo.saveTeamMember({ ...member,meta:{...member.meta,captain:false},teamId:team.id,role:row.role,revision:member.revision+1 });
        }
      } else if (input.action === 'ADD_MEMBER') {
        await this.addMember(id,input.nickname,input.teamId,input.role);
      } else {
        const member = (await this.repo.listTeamMembers(id)).find(m => m.id === input.id);
        if (!member || member.revision !== input.revision) throw new TeamError('Another device changed this player. Refresh the list');
        if (input.action === 'REMOVE_MEMBER') await this.repo.deleteTeamMember(id,member.id);
        else {
          await this.capacity(t,input.teamId,input.role,member.id);
          await this.repo.saveTeamMember({ ...member,meta:{...member.meta,captain:member.teamId===input.teamId&&Boolean(member.meta?.captain)},teamId:input.teamId,role:input.teamId ? input.role : 'PLAYER',revision:member.revision+1 });
        }
      }
      const updatedMembers=await this.repo.listTeamMembers(id);
      for(const teamId of new Set(updatedMembers.map(m=>m.teamId).filter(Boolean))) {
        const members=updatedMembers.filter(m=>m.teamId===teamId);
        if(!members.some(m=>m.meta?.captain)){const captain=members.find(m=>m.role==='PLAYER')??members[0];await this.repo.saveTeamMember({...captain,revision:captain.revision+1,meta:{...captain.meta,captain:true}});}
      }
      const after=await this.repo.listTeamMembers(id);
      await this.repo.appendActivity({id:randomUUID(),tournamentId:id,action:'team'+input.action,createdAt:new Date().toISOString(),platform:'team management',before:{members:before},after:{members:after}});
      const registrations=await this.repo.listRegistrations(id),participants=await this.repo.listParticipants(id);
      for(const member of after) {
        const previous=before.find(m=>m.id===member.id),record=registrations.find(r=>r.memberId===member.id&&!r.meta?.cancelledAt);
        if(!record||(!previous)||(previous.teamId===member.teamId&&previous.role===member.role&&Boolean(previous.meta?.captain)===Boolean(member.meta?.captain)&&input.action!=='ROTATE_CODE'))continue;
        if(input.action==='ROTATE_CODE'&&(member.teamId!==input.teamId||!member.meta?.captain))continue;
        const team=participants.find(p=>p.id===member.teamId);
        const base=process.env.PUBLIC_BASE_URL||'';
        await this.repo.enqueueRegistrationMail(id,'team:'+member.id+':'+member.revision+':'+input.action+':'+(input.action==='ROTATE_CODE'?input.code:''),record.email,t.title,base+'/register/?tournamentId='+encodeURIComponent(id),input.action==='ROTATE_CODE'?'Your team code has changed. Recover your registration to view the new code.':team?'Your assignment: '+team.displayName+' · '+(member.role==='PLAYER'?'starter':'reserve')+'. Recover your registration using the link to view the details.':'You are now on the solo player list. You can view your registration using the link.');
      }
      return this.overview(id);
    });
  }

  async resolveRegistration(id: string, name: string, input: { mode?: string; teamName?: string; teamCode?: string; role?: TeamMember['role'] }, allowWaiting=false): Promise<TeamRegistration> {
    const t = await this.tournament(id,true);
    if ((await this.repo.listTeamMembers(id)).some(m => nickKey(m.nickname) === nickKey(name))) throw new TeamError('That nickname is already registered for this tournament');
    if (input.mode === 'TEAM_CREATE') {
      const parsed = nickname.safeParse(input.teamName);
      if (!parsed.success) throw new TeamError('Enter a team name of 2 to 80 characters',400);
      const teams = await this.repo.listParticipants(id);
      if (!allowWaiting && teams.length >= t.maxParticipants) throw new TeamError('No places remain for new teams');
      if (teams.some(p => nickKey(p.displayName) === nickKey(parsed.data))) throw new TeamError('A team with that name already exists');
      return { mode:'TEAM_CREATE',teamName:parsed.data,role:'PLAYER' };
    }
    if (input.mode === 'TEAM_JOIN') {
      const teamId = await this.repo.findTeamByCode(id,input.teamCode || '');
      if (!teamId) throw new TeamError('Invalid team code');
      if(!allowWaiting)await this.capacity(t,teamId,input.role ?? 'PLAYER');
      return { mode:'TEAM_JOIN',teamId,role:input.role ?? 'PLAYER' };
    }
    if (input.mode === 'SOLO') {
      if (!t.settings.allowSoloRegistration) throw new TeamError('Solo registration is disabled');
      await this.capacity(t,null,'PLAYER');
      return { mode:'SOLO',role:'PLAYER' };
    }
    throw new TeamError('Choose to create a team, join using a code or register alone',400);
  }

  async confirmRegistration(id: string, name: string, input: TeamRegistration) {
    const t = await this.tournament(id,true);
    let teamId = input.teamId ?? null;
    if (input.mode === 'TEAM_CREATE') {
      const teams = await this.repo.listParticipants(id);
      if (teams.length >= t.maxParticipants) throw new TeamError('No places remain for new teams');
      if (teams.some(p => nickKey(p.displayName) === nickKey(input.teamName!))) throw new TeamError('A team with that name already exists. Request another link using a different name');
      teamId = (await this.tournaments.addParticipant(id,{displayName:input.teamName!})).id;
    }
    if (input.mode === 'SOLO' && !t.settings.allowSoloRegistration) throw new TeamError('Solo registration is disabled');
    const member = await this.addMember(id,name,teamId,input.role ?? 'PLAYER');
    if(input.mode==='TEAM_CREATE'){member.meta={captain:true};await this.repo.saveTeamMember(member);}
    return member;
  }
}
