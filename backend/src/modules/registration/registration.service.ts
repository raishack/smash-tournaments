import { createHash, randomBytes } from "node:crypto";
import { assertTournamentWritable } from '../tournaments/tournament-archive.js';
import { z } from "zod";
import type { Tournament } from "../../shared/types.js";
import type { TournamentsPostgresRepository } from "../tournaments/tournaments.postgres-repository.js";
import type { TournamentsService } from "../tournaments/tournaments.service.js";
import type { RegistrationMailer } from "./registration-mailer.js";
import { TeamsService } from '../teams/teams.service.js';
import type { RegistrationRecord } from './registration-record.js';
import type { TeamMember } from '../teams/team-types.js';

export class RegistrationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export const publicOptionsSchema = z.object({ displayEnabled: z.boolean().optional(), registrationEnabled: z.boolean().optional(), registrationClosesAt:z.string().datetime().nullable().optional(),registrationWaitlist:z.boolean().optional() })
  .strict().refine(value => Object.keys(value).length > 0);
export const registrationSchema = z.object({
  nickname: z.string().trim().min(2).max(80).refine(value => !/[\u0000-\u001f\u007f]/u.test(value)),
  email: z.string().trim().max(254).email().transform(value => value.toLowerCase()),
  mode: z.enum(['TEAM_CREATE','TEAM_JOIN','SOLO']).optional(),
  teamName: z.string().trim().min(2).max(80).optional(),
  teamCode: z.string().trim().max(32).optional(),
  role: z.enum(['PLAYER','RESERVE']).optional(),
  gameId:z.string().trim().max(100).optional(),preferredRole:z.string().trim().max(80).optional(),
}).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const normalizedNick = (value: string) => value.normalize("NFKC").trim().toLowerCase();

export class RegistrationService {
  private get teams() { return new TeamsService(this.repository,this.tournaments); }
  private sending = 0;
  private readonly base?: string;
  constructor(private readonly repository: TournamentsPostgresRepository,
    private readonly tournaments: TournamentsService, private readonly mailer: RegistrationMailer, baseUrl?: string) {
    try {
      const parsed = new URL(baseUrl || "");
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password) this.base = parsed.origin;
    } catch { /* Registration stays disabled until a public HTTPS URL is configured. */ }
  }

  private local(tournament: Tournament | undefined): Tournament {
    if (!tournament || tournament.importSource || tournament.settings.importJob) throw new RegistrationError("Torneo no disponible", 404);
    return tournament;
  }
  private ready(): boolean { return Boolean(this.base && this.mailer.configured); }
  private async accepting(tournament: Tournament): Promise<boolean> {
    return ["DRAFT", "PUBLISHED", "CHECK_IN"].includes(tournament.status)
      && (await this.repository.listMatches(tournament.id)).length === 0
      && !await this.repository.getFortniteState(tournament.id);
  }
  private async requireOpen(tournament: Tournament): Promise<void> {
    if (!tournament.settings.registrationEnabled || (tournament.settings.registrationClosesAt&&Date.parse(tournament.settings.registrationClosesAt)<=Date.now()) || !await this.accepting(tournament)) throw new RegistrationError("Las inscripciones están cerradas", 409);
    if (!tournament.settings.registrationWaitlist && (tournament.settings.teamSize ?? 1) === 1 && (await this.repository.listParticipants(tournament.id)).length >= tournament.maxParticipants) throw new RegistrationError("No quedan plazas disponibles", 409);
  }

  async updateOptions(tournamentId: string, input: z.infer<typeof publicOptionsSchema>): Promise<Tournament> {
    input = publicOptionsSchema.parse(input);
    return this.repository.withTournamentTransaction(tournamentId, async () => {
      const found = await this.repository.getTournament(tournamentId);
      if (!found) throw new RegistrationError("Torneo no disponible", 404);
      assertTournamentWritable(found);
      const visibilityOnly = Object.keys(input).every(key => key === 'displayEnabled');
      const tournament = visibilityOnly ? found : this.local(found);
      if (input.registrationEnabled) {
        const deadline=input.registrationClosesAt===undefined?tournament.settings.registrationClosesAt:input.registrationClosesAt;
        if(deadline&&Date.parse(deadline)<=Date.now())throw new RegistrationError('Cambia o elimina la fecha de cierre pasada antes de abrir inscripciones',409);
        if (!this.ready()) throw new RegistrationError("Falta configurar el correo de inscripciones y la URL pública del servidor", 503);
        if (!await this.accepting(tournament)) throw new RegistrationError("Solo se puede abrir la inscripción antes de generar la bracket", 409);
      }
      const updated = { ...tournament, settings: { ...tournament.settings, ...input,
        registrationUrl: !tournament.importSource && this.base ? `${this.base}/register/?tournamentId=${encodeURIComponent(tournament.id)}` : undefined },
        updatedAt: new Date().toISOString() };
      await this.repository.saveTournament(updated);
      return updated;
    });
  }

  async publicInfo(tournamentId: string) {
    const tournament = this.local(await this.repository.getTournament(tournamentId));
    const count = (await this.repository.listParticipants(tournamentId)).length;
    const canOpen = await this.accepting(tournament);
    const open = Boolean(this.ready() && tournament.settings.registrationEnabled && (!tournament.settings.registrationClosesAt||Date.parse(tournament.settings.registrationClosesAt)>Date.now()) && canOpen);
    // Explicit allowlist: never return participants, email addresses or private settings.
    return { title: tournament.title, gameTitle: tournament.gameTitle, platform: tournament.platform,
      startsAt: tournament.startsAt, maxParticipants: tournament.maxParticipants, availablePlaces: Math.max(0, tournament.maxParticipants - count), open,canOpen,registrationClosesAt:tournament.settings.registrationClosesAt,waitlistEnabled:tournament.settings.registrationWaitlist??false,
      teamSize: tournament.settings.teamSize ?? 1, reserveCount: tournament.settings.reserveCount ?? 0, allowSoloRegistration: tournament.settings.allowSoloRegistration ?? false,
      bracketMode:tournament.settings.bracketMode,fortniteLobbySize:tournament.settings.bracketMode==='FORTNITE'?(tournament.settings.fortniteLobbySize??20):undefined,
      fortniteGamesPerRound:tournament.settings.bracketMode==='FORTNITE'?(tournament.settings.fortniteGamesPerRound??3):undefined };
  }

  async request(tournamentId: string, input: z.infer<typeof registrationSchema>, ip: string): Promise<void> {
    const parsed = registrationSchema.safeParse(input);
    if (!parsed.success) throw new RegistrationError("Escribe un nick de 2 a 80 caracteres y un correo válido");
    if (!this.ready()) throw new RegistrationError("El registro online no está disponible en este momento", 503);
    if (this.sending >= 6) throw new RegistrationError("Hay muchas solicitudes. Inténtalo de nuevo en unos segundos", 429);
    this.sending++;
    try {
      const token = randomBytes(32).toString("hex");
      const now = Date.now();
      const message = await this.repository.withTournamentTransaction(tournamentId, async () => {
        const tournament = this.local(await this.repository.getTournament(tournamentId));
        await this.requireOpen(tournament);
        // Persistent quotas are shared by all workers. Keys contain hashes, not email/IP.
        for (const [key, seconds, max] of [["global", 600, 500], ["ip:" + ip, 600, 120], ["email:" + parsed.data.email, 3600, 5]] as const) {
          const window = Math.floor(now / (seconds * 1000)) * seconds;
          if (await this.repository.consumeRegistrationLimit(hash(key), window) > max) throw new RegistrationError("Demasiadas solicitudes. Inténtalo más tarde", 429);
        }
        const existing = await this.repository.registrationByEmail(tournamentId, parsed.data.email);
        const participants = await this.repository.listParticipants(tournamentId);
        if(existing?.meta?.waitingAt&&!existing.meta.cancelledAt)return;
        if (existing?.memberId && (await this.repository.listTeamMembers(tournamentId)).some(m => m.id === existing.memberId)) return;
        if (existing?.participantId && !existing.memberId && participants.some(p => p.id === existing.participantId)) return;
        if (existing && now - Date.parse(existing.sentAt) < 60000) return;
        let teamData;
        if ((tournament.settings.teamSize ?? 1) > 1) teamData = await this.teams.resolveRegistration(tournamentId,parsed.data.nickname,parsed.data,Boolean(tournament.settings.registrationWaitlist));
        else {
          if (parsed.data.mode || parsed.data.teamName || parsed.data.teamCode || parsed.data.role) throw new RegistrationError('Este torneo es individual');
          if (participants.some(p => normalizedNick(p.displayName) === normalizedNick(parsed.data.nickname))) throw new RegistrationError("Ese nick ya está inscrito en el torneo. Utiliza otro", 409);
        }
        await this.repository.saveRegistration({ tournamentId, email: parsed.data.email, nickname: parsed.data.nickname,
          tokenHash: hash(token), expiresAt: new Date(now + 86400000).toISOString(), sentAt: new Date(now).toISOString(), teamData,meta:{gameId:parsed.data.gameId,preferredRole:parsed.data.preferredRole} });
        return { title: tournament.title, email: parsed.data.email };
      });
      if (!message) return; // Same response for confirmed addresses and resend cooldown.
      try {
        await this.mailer.send(message.email, message.title,
          `${this.base}/register/?tournamentId=${encodeURIComponent(tournamentId)}#token=${token}`);
      } catch {
        await this.repository.expireFailedRegistration(hash(token));
        throw new RegistrationError("No se ha podido enviar el correo. Tu plaza aún no está confirmada; vuelve a intentarlo", 503);
      }
    } finally { this.sending--; }
  }

  private async teamConfirmation(tournament: Tournament, record: RegistrationRecord, member: TeamMember) {
    const team = (await this.repository.listParticipants(tournament.id)).find(p => p.id === member.teamId);
    return { nickname: member.nickname, title: tournament.title, kind: 'TEAM_MEMBER', teamName: team?.displayName,
      role: member.role, waitingForTeam: !team,
      teamCode: team && member.meta?.captain && tournament.status !== 'ARCHIVED' ? await this.repository.ensureTeamCode(tournament.id,team.id) : undefined };
  }

  async confirm(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new RegistrationError("El enlace de verificación no es válido");
    const initial = await this.repository.registrationByToken(hash(token));
    if (!initial) throw new RegistrationError("El enlace ha caducado o no es válido. Solicita otro desde el registro", 410);
    return this.repository.withTournamentTransaction(initial.tournamentId, async () => {
      const record = await this.repository.registrationByToken(hash(token));
      const tournament = this.local(await this.repository.getTournament(initial.tournamentId));
      if (!record || Date.parse(record.expiresAt) <= Date.now()) throw new RegistrationError("El enlace ha caducado. Solicita otro desde el registro", 410);
      const participants = await this.repository.listParticipants(tournament.id);
      if(record.meta?.cancelledAt)return {nickname:record.nickname,title:tournament.title,cancelled:true};
      if(record.meta?.waitingAt)return {nickname:record.nickname,title:tournament.title,waiting:true};
      if (record.confirmedAt) {
        if (record.memberId) {
          const member = (await this.repository.listTeamMembers(tournament.id)).find(m => m.id === record.memberId);
          if (!member) throw new RegistrationError('La organización ha retirado esta inscripción',409);
          return this.teamConfirmation(tournament,record,member);
        }
        const participant = participants.find(p => p.id === record.participantId);
        if (!participant) throw new RegistrationError("La organización ha retirado esta inscripción", 409);
        return { nickname: participant.displayName, title: tournament.title };
      }
      await this.requireOpen(tournament);
      await this.promoteWaiting(tournament);
      if(!await this.hasCapacity(tournament,record)) {
        if(!tournament.settings.registrationWaitlist)throw new RegistrationError('No quedan plazas disponibles',409);
        await this.repository.saveRegistration({...record,confirmedAt:new Date().toISOString(),meta:{...record.meta,waitingAt:new Date().toISOString()}});
        return {nickname:record.nickname,title:tournament.title,waiting:true};
      }
      return this.admit(tournament,record);

    });
  }
  private async hasCapacity(t:Tournament,record:RegistrationRecord):Promise<boolean> {
    if(!record.teamData||record.teamData.mode==='TEAM_CREATE')return (await this.repository.listParticipants(t.id)).length<t.maxParticipants;
    if(record.teamData.mode==='SOLO')return true;
    const members=await this.repository.listTeamMembers(t.id),role=record.teamData.role??'PLAYER';
    return members.filter(m=>m.teamId===record.teamData!.teamId&&m.role===role).length<(role==='PLAYER'?(t.settings.teamSize??1):(t.settings.reserveCount??0));
  }
  private async admit(tournament:Tournament,record:RegistrationRecord) {
    const meta={...record.meta};delete meta.waitingAt;delete meta.cancelledAt;
    if(record.teamData) {
      const member=await this.teams.confirmRegistration(tournament.id,record.nickname,record.teamData);
      member.meta={...member.meta,gameId:meta.gameId,preferredRole:meta.preferredRole};await this.repository.saveTeamMember(member);
      const confirmed={...record,meta,memberId:member.id,participantId:member.teamId,confirmedAt:new Date().toISOString()};
      await this.repository.saveRegistration(confirmed);
      return this.teamConfirmation(tournament,confirmed,member);
    }
    if((tournament.settings.teamSize??1)>1)throw new RegistrationError('El torneo ha cambiado a equipos. Solicita un nuevo enlace',409);
    const participants=await this.repository.listParticipants(tournament.id);
    if(participants.some(p=>normalizedNick(p.displayName)===normalizedNick(record.nickname)))throw new RegistrationError('Ese nick ya está inscrito. Solicita un nuevo enlace con otro nick',409);
    const participant=await this.tournaments.addParticipant(tournament.id,{displayName:record.nickname});
    await this.repository.saveRegistration({...record,meta,participantId:participant.id,confirmedAt:new Date().toISOString()});
    return {nickname:record.nickname,title:tournament.title};
  }
  private async verified(token:string) {
    const record=/^[a-f0-9]{64}$/.test(token)?await this.repository.registrationByToken(hash(token)):undefined;
    if(!record||Date.parse(record.expiresAt)<=Date.now())throw new RegistrationError('El enlace ha caducado. Recupera tu inscripción con tu correo',410);
    return record;
  }
  async status(token:string) {
    const record=await this.verified(token);
    return this.repository.withTournamentTransaction(record.tournamentId,async()=>{
      const r=await this.verified(token),t=this.local(await this.repository.getTournament(r.tournamentId));
      const basic={nickname:r.nickname,title:t.title,canCancel:Boolean(r.confirmedAt)&&await this.accepting(t),cancelled:Boolean(r.meta?.cancelledAt),waiting:Boolean(r.meta?.waitingAt),confirmed:Boolean(r.confirmedAt)};
      if (basic.confirmed && !basic.cancelled && !basic.waiting) {
        if (r.memberId) {
          const member = (await this.repository.listTeamMembers(t.id)).find(m => m.id === r.memberId);
          if (member) return {...basic, ...await this.teamConfirmation(t,r,member)};
        } else {
          const participant = (await this.repository.listParticipants(t.id)).find(p => p.id === r.participantId);
          if (participant) return {...basic, nickname: participant.displayName};
        }
        return {...basic, removed:true, confirmed:false, canCancel:false};
      }
      return basic;
    });
  }
  async recover(id:string,email:unknown,ip:string):Promise<void> {
    const parsed=z.string().trim().email().max(254).safeParse(email);if(!parsed.success)throw new RegistrationError('Introduce un correo válido');
    if(!this.ready())throw new RegistrationError('El correo no está configurado',503);
    const now=Date.now(),token=randomBytes(32).toString('hex');
    await this.repository.withTournamentTransaction(id,async()=>{
      const t=this.local(await this.repository.getTournament(id));
      assertTournamentWritable(t);
      for(const [key,seconds,max] of [['global',600,500],['ip:'+ip,600,120],['email:'+parsed.data.toLowerCase(),3600,5]] as const){
        if(await this.repository.consumeRegistrationLimit(hash(key),Math.floor(now/(seconds*1000))*seconds)>max)throw new RegistrationError('Demasiadas solicitudes. Inténtalo más tarde',429);
      }
      const record=await this.repository.registrationByEmail(id,parsed.data.toLowerCase());
      if(!record||now-Date.parse(record.sentAt)<60000)return;
      await this.repository.saveRegistration({...record,tokenHash:hash(token),sentAt:new Date(now).toISOString(),expiresAt:new Date(now+86400000).toISOString()});
      await this.repository.enqueueRegistrationMail(id,'recover:'+hash(token),record.email,t.title,`${this.base}/register/?tournamentId=${encodeURIComponent(id)}#token=${token}`,'Consulta tu inscripción y tu equipo o cancela antes de que empiece el torneo. Si aún no confirmaste el correo, podrás hacerlo desde este enlace. El enlace dura 24 horas.');
    });
  }
  async cancel(token:string) {
    const initial=await this.verified(token);
    await this.repository.withTournamentTransaction(initial.tournamentId,async()=>{
      const r=await this.verified(token),t=this.local(await this.repository.getTournament(r.tournamentId));
      if(r.meta?.cancelledAt)return;
      if(!await this.accepting(t))throw new RegistrationError('El torneo ya está generado. Contacta con la organización para tramitar tu baja',409);
      if(!r.confirmedAt)throw new RegistrationError('Esta inscripción todavía no está confirmada',409);
      if(r.memberId){
        const members=await this.repository.listTeamMembers(t.id),member=members.find(m=>m.id===r.memberId);
        if(member){await this.repository.deleteTeamMember(t.id,member.id);
          const others=members.filter(m=>m.teamId===member.teamId&&m.id!==member.id);
          if(member.teamId&&!others.length)await this.tournaments.deleteParticipant(t.id,member.teamId);
          else if(member.meta?.captain&&others.length)await this.repository.saveTeamMember({...others[0],revision:others[0].revision+1,meta:{...others[0].meta,captain:true}});
        }
      }else if(r.participantId&&(await this.repository.listParticipants(t.id)).some(p=>p.id===r.participantId))await this.tournaments.deleteParticipant(t.id,r.participantId);
      await this.repository.saveRegistration({...r,meta:{...r.meta,waitingAt:undefined,cancelledAt:new Date().toISOString()}});
    });
    return this.status(token);
  }
  private async promoteWaiting(t:Tournament) {
          const waiting=(await this.repository.listRegistrations(t.id)).filter(r=>r.meta?.waitingAt&&!r.meta.cancelledAt).sort((a,b)=>a.meta!.waitingAt!.localeCompare(b.meta!.waitingAt!));
          for(const r of waiting) {
            if (Boolean(r.teamData) !== ((t.settings.teamSize ?? 1) > 1)) continue;
            if(!await this.hasCapacity(t,r))continue;
            // Invalidated team invitations or nick collisions remain visible for the organiser.
            const participants=await this.repository.listParticipants(t.id);
            if(r.teamData?.mode==='TEAM_JOIN'&&!participants.some(p=>p.id===r.teamData?.teamId))continue;
            if(!r.teamData&&participants.some(p=>normalizedNick(p.displayName)===normalizedNick(r.nickname)))continue;
            if(r.teamData?.mode==='TEAM_CREATE'&&participants.some(p=>normalizedNick(p.displayName)===normalizedNick(r.teamData!.teamName!)))continue;
            if(r.teamData?.mode==='SOLO'&&!t.settings.allowSoloRegistration)continue;
            if(r.teamData&&(await this.repository.listTeamMembers(t.id)).some(m=>normalizedNick(m.nickname)===normalizedNick(r.nickname)))continue;
            await this.admit(t,r);
            await this.repository.enqueueRegistrationMail(t.id,'admitted:'+t.id+':'+hash(r.email)+':'+r.meta!.waitingAt,r.email,t.title,`${this.base}/register/?tournamentId=${encodeURIComponent(t.id)}`,'Ya tienes plaza. Recupera tu inscripción con tu correo desde el enlace para consultar los detalles.');
          }
  }
  private maintenanceRunning=false;
  async maintenance() {
    if(this.maintenanceRunning)return;this.maintenanceRunning=true;
    try {
      for(const candidate of await this.repository.listTournaments()) {
        if (candidate.status === 'ARCHIVED') continue;
        if(candidate.importSource||!candidate.settings.registrationEnabled)continue;
        try { await this.repository.withTournamentTransaction(candidate.id,async()=>{
          const t=this.local(await this.repository.getTournament(candidate.id));
          if (t.status === 'ARCHIVED') return;
          if(t.settings.registrationClosesAt&&Date.parse(t.settings.registrationClosesAt)<=Date.now()){
            await this.repository.saveTournament({...t,settings:{...t.settings,registrationEnabled:false},updatedAt:new Date().toISOString()});return;
          }
          if(!t.settings.registrationEnabled||!await this.accepting(t))return;
          await this.promoteWaiting(t);
        }); } catch { console.error('[registration] No se pudo procesar la espera de un torneo; se reintentará'); }
      }
      await this.repository.deliverRegistrationMail(p=>this.mailer.send(p.email,p.title,p.url,p.notice));
    } finally {this.maintenanceRunning=false;}
  }

}
