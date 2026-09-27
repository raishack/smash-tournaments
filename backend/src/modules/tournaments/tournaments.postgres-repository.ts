import type { Pool, PoolClient } from "pg";
import { assertTournamentWritable } from './tournament-archive.js';
import { AsyncLocalStorage } from "node:async_hooks";
import type { RegistrationRecord } from "../registration/registration-record.js";
import { randomBytes } from 'node:crypto';
import { nickKey, type TeamMember } from '../teams/team-types.js';
import type { FortniteState } from '../fortnite/fortnite-model.js';
import { stableJson, type TournamentActivity, type SyncJob } from "./tournament-operations.js";
import type {
  Match,
  MatchBracketStage,
  MatchCall,
  MatchCharacterSelection,
  MatchGameCharacterSelections,
  MatchExternalRef,
  MatchParticipant,
  Tournament,
  TournamentImportSource,
  TournamentParticipant,
  TournamentParticipantExternalRef,
} from "../../shared/types.js";

type TournamentRow = {
  id: string;
  owner_id: string;
  title: string;
  game_title: string;
  description: string;
  platform: string;
  status: Tournament["status"];
  starts_at: string;
  max_participants: number;
  is_public: boolean;
  settings: Tournament["settings"];
  import_source: TournamentImportSource | null;
  created_at: string;
  updated_at: string;
};

type ParticipantRow = {
  id: string;
  tournament_id: string;
  user_id: string | null;
  display_name: string;
  seed: number | null;
  checked_in: boolean;
  status: TournamentParticipant["status"];
  external_ref: TournamentParticipantExternalRef | null;
  created_at: string;
};

type MatchRow = {
  id: string;
  tournament_id: string;
  bracket_stage: MatchBracketStage;
  round_number: number;
  match_number: number;
  status: Match["status"];
  best_of: number;
  reported_best_of: number | null;
  advancers_required: number;
  game_results: string[] | null;
  character_selections: MatchCharacterSelection[] | null;
  game_character_selections: MatchGameCharacterSelections[] | null;
  advancing_participant_ids: string[] | null;
  winner_participant_id: string | null;
  external_ref: MatchExternalRef | null;
  call_data: MatchCall | null;
  created_at: string;
  updated_at: string;
};

type MatchParticipantRow = {
  id: string;
  match_id: string;
  participant_id: string;
  display_name: string;
  slot: number;
  score: number;
};

export class TournamentsPostgresRepository {
  private syncWorkers = 0;
  private readonly transactions = new AsyncLocalStorage<{ client: PoolClient; tournamentId: string; active: boolean; afterCommit: Array<() => void> }>();
  constructor(private readonly pool: Pool) {}

  private get connection(): Pool | PoolClient {
    const context = this.transactions.getStore();
    return context?.active ? context.client : this.pool;
  }

  afterCommit(action: () => void): void {
    const context = this.transactions.getStore();
    if (context?.active) context.afterCommit.push(action);
    else action();
  }

  get transactionClient(): PoolClient | undefined { const context = this.transactions.getStore(); return context?.active ? context.client : undefined; }

  get inTransaction(): boolean { return this.transactions.getStore()?.active ?? false; }

  async withTournamentTransaction<T>(tournamentId: string, action: () => Promise<T>): Promise<T> {
    const current = this.transactions.getStore();
    if (current?.active) {
      if (current.tournamentId !== tournamentId) throw new Error("Cross-tournament transaction");
      return action();
    }
    const client = await this.pool.connect();
    const context = { client, tournamentId, active: true, afterCommit: [] as Array<() => void> };
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [tournamentId]);
      const result = await this.transactions.run(context, action);
      await client.query("commit");
      context.active = false;
      context.afterCommit.forEach(callback => { try { callback(); } catch (error) { console.error("[after-commit]", error); } });
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      context.active = false;
      client.release();
    }
  }

  async getOperation(tournamentId: string, id: string): Promise<{ fingerprint: string; result: unknown } | undefined> {
    return (await this.connection.query("select fingerprint, result from tournament_operations where tournament_id=$1 and id=$2", [tournamentId, id])).rows[0];
  }

  async saveOperation(tournamentId: string, id: string, fingerprint: string, result: unknown): Promise<void> {
    await this.connection.query("insert into tournament_operations(tournament_id,id,fingerprint,result) values($1,$2,$3,$4::jsonb)", [tournamentId, id, fingerprint, JSON.stringify(result ?? null)]);
  }

  async appendActivity(event: TournamentActivity): Promise<void> {
    await this.connection.query("insert into tournament_activity(id,tournament_id,created_at,event) values($1,$2,$3,$4::jsonb)", [event.id, event.tournamentId, event.createdAt, JSON.stringify(event)]);
  }

  async listActivity(tournamentId: string): Promise<TournamentActivity[]> {
    return (await this.connection.query("select event from tournament_activity where tournament_id=$1 order by created_at desc,id desc limit 200", [tournamentId])).rows.map(row => row.event);
  }

  async saveSyncJob(job: SyncJob): Promise<void> {
    await this.connection.query(`insert into tournament_sync_jobs(id,tournament_id,job) values($1,$2,$3::jsonb)
      on conflict(id) do update set job=excluded.job`, [job.id, job.tournamentId, JSON.stringify(job)]);
  }

  async listSyncJobs(tournamentId?: string): Promise<SyncJob[]> {
    return (await this.connection.query(tournamentId
      ? "select job from tournament_sync_jobs where tournament_id=$1"
      : "select job from tournament_sync_jobs where job->>'state' in ('PENDING','RUNNING')", tournamentId ? [tournamentId] : [])).rows.map(row => row.job);
  }

  async withSyncWorker<T>(tournamentId: string, action: () => Promise<T>): Promise<T | undefined> {
    // Reserve pool capacity for UI operations while external requests are slow.
    if (this.syncWorkers >= 2) return undefined;
    this.syncWorkers++;
    try { return await this.withSyncWorkerSession(tournamentId, action); }
    finally { this.syncWorkers--; }
  }

  private async withSyncWorkerSession<T>(tournamentId: string, action: () => Promise<T>): Promise<T | undefined> {
    const client = await this.pool.connect();
    const key = `startgg-worker:${tournamentId}`;
    let acquired = false;
    try {
      acquired = (await client.query("select pg_try_advisory_lock(hashtextextended($1,0)) as acquired", [key])).rows[0].acquired;
      return acquired ? await action() : undefined;
    } finally {
      if (acquired) await client.query("select pg_advisory_unlock(hashtextextended($1,0))", [key]);
      client.release();
    }
  }

  async listTournaments(): Promise<Tournament[]> {
    const result = await this.connection.query<TournamentRow & {registered_participants:number}>(
      "select t.*, (select count(*)::int from tournament_participants p where p.tournament_id=t.id) as registered_participants from tournaments t order by created_at desc",
    );
    return result.rows.map((row) => ({...this.mapTournament(row),registeredParticipants:row.registered_participants}));
  }

  async hasActiveLadder(tournamentId: string): Promise<boolean> {
    const exists = (await this.connection.query("select to_regclass('ladder_sessions') is not null as present")).rows[0]?.present;
    if (!exists) return false;
    return (await this.connection.query("select 1 from ladder_sessions where tournament_id=$1 and status='ACTIVE' limit 1",[tournamentId])).rows.length > 0;
  }

  async registrationByEmail(tournamentId: string, email: string): Promise<RegistrationRecord | undefined> {
    return this.readRegistration("tournament_id=$1 and email=$2", [tournamentId, email]);
  }

  async registrationByToken(tokenHash: string): Promise<RegistrationRecord | undefined> {
    return this.readRegistration("token_hash=$1", [tokenHash]);
  }

  private async readRegistration(where: string, values: string[]): Promise<RegistrationRecord | undefined> {
    return (await this.connection.query<RegistrationRecord>(`select tournament_id as "tournamentId", email, nickname,
      token_hash as "tokenHash", expires_at::text as "expiresAt", sent_at::text as "sentAt",
      participant_id as "participantId", confirmed_at::text as "confirmedAt", member_id as "memberId", team_data as "teamData", meta
      from tournament_registrations where ${where}`, values)).rows[0];
  }

  async saveRegistration(record: RegistrationRecord): Promise<void> {
    await this.connection.query(`insert into tournament_registrations
      (tournament_id,email,nickname,token_hash,expires_at,sent_at,participant_id,confirmed_at,member_id,team_data,meta)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb) on conflict(tournament_id,email) do update set
      nickname=excluded.nickname, token_hash=excluded.token_hash, expires_at=excluded.expires_at,
      sent_at=excluded.sent_at, participant_id=excluded.participant_id, confirmed_at=excluded.confirmed_at,
      member_id=excluded.member_id, team_data=excluded.team_data,meta=excluded.meta`,
    [record.tournamentId, record.email, record.nickname, record.tokenHash, record.expiresAt, record.sentAt,
      record.participantId ?? null, record.confirmedAt ?? null, record.memberId ?? null, record.teamData ? JSON.stringify(record.teamData) : null,JSON.stringify(record.meta??{})]);
  }

  async listTeamMembers(tournamentId: string): Promise<TeamMember[]> {
    return (await this.connection.query(`select id,tournament_id as "tournamentId",nickname,team_id as "teamId",role,revision,meta
      from tournament_team_members where tournament_id=$1 order by nickname,id`, [tournamentId])).rows;
  }

  async getFortniteState(tournamentId:string):Promise<FortniteState|null> {
    return (await this.connection.query('select data from tournament_fortnite where tournament_id=$1',[tournamentId])).rows[0]?.data ?? null;
  }
  async saveFortniteState(tournamentId:string,state:FortniteState):Promise<void> {
    await this.connection.query('insert into tournament_fortnite(tournament_id,data) values($1,$2::jsonb) on conflict(tournament_id) do update set data=excluded.data',[tournamentId,JSON.stringify(state)]);
  }
  async deleteFortniteState(tournamentId:string):Promise<void> {
    await this.connection.query('delete from tournament_fortnite where tournament_id=$1',[tournamentId]);
  }

  async saveTeamMember(member: TeamMember): Promise<void> {
    await this.connection.query(`insert into tournament_team_members(id,tournament_id,nickname,nick_key,team_id,role,revision,meta)
      values($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict(id) do update set nickname=excluded.nickname,nick_key=excluded.nick_key,
      team_id=excluded.team_id,role=excluded.role,revision=excluded.revision,meta=excluded.meta`,
    [member.id,member.tournamentId,member.nickname,nickKey(member.nickname),member.teamId,member.role,member.revision,JSON.stringify(member.meta??{})]);
  }

  async deleteTeamMember(tournamentId: string, id: string): Promise<void> {
    await this.connection.query('delete from tournament_team_members where tournament_id=$1 and id=$2', [tournamentId,id]);
  }

  async ensureTeamCode(tournamentId: string, teamId: string): Promise<string> {
    const existing = (await this.connection.query('select code from tournament_team_codes where tournament_id=$1 and team_id=$2', [tournamentId,teamId])).rows[0];
    if (existing) return existing.code;
    const result = await this.connection.query(`insert into tournament_team_codes(tournament_id,team_id,code) values($1,$2,$3)
      on conflict(tournament_id,team_id) do update set team_id=excluded.team_id returning code`, [tournamentId,teamId,randomBytes(8).toString('hex').toUpperCase()]);
    return result.rows[0].code;
  }

  async findTeamByCode(tournamentId: string, code: string): Promise<string | undefined> {
    return (await this.connection.query('select team_id from tournament_team_codes where tournament_id=$1 and code=$2', [tournamentId,code.trim().toUpperCase()])).rows[0]?.team_id;
  }

  async listTeamCodes(tournamentId: string): Promise<Array<{teamId:string;code:string}>> {
    return (await this.connection.query('select team_id as "teamId",code from tournament_team_codes where tournament_id=$1',[tournamentId])).rows;
  }

  async disbandTeam(tournamentId: string, teamId: string): Promise<void> {
    await this.connection.query(`update tournament_team_members set team_id=null,role='PLAYER',meta=meta-'captain',revision=revision+1 where tournament_id=$1 and team_id=$2`, [tournamentId,teamId]);
    await this.connection.query('delete from tournament_team_codes where tournament_id=$1 and team_id=$2', [tournamentId,teamId]);
  }

  async expireFailedRegistration(tokenHash: string): Promise<void> {
    await this.connection.query(`update tournament_registrations set expires_at=now(),sent_at=now()-interval '2 minutes'
      where token_hash=$1 and confirmed_at is null`, [tokenHash]);
  }

  async consumeRegistrationLimit(key: string, windowStart: number): Promise<number> {
    const result = await this.connection.query(`insert into registration_request_limits(key,window_start,attempts)
      values($1,$2,1) on conflict(key) do update set window_start=excluded.window_start,
      attempts=case when registration_request_limits.window_start=excluded.window_start
      then registration_request_limits.attempts+1 else 1 end returning attempts`, [key, windowStart]);
    return result.rows[0].attempts;
  }

  async cleanExpiredRegistrations(): Promise<void> {
    await this.connection.query("delete from tournament_registrations where confirmed_at is null and expires_at < now()-interval '1 day'");
    await this.connection.query("delete from registration_request_limits where window_start < $1", [Math.floor(Date.now() / 1000) - 86400]);
  }

  async listRegistrations(id:string):Promise<RegistrationRecord[]> {
    return (await this.connection.query<RegistrationRecord>(`select tournament_id as "tournamentId", email,nickname,token_hash as "tokenHash",
      expires_at::text as "expiresAt",sent_at::text as "sentAt",participant_id as "participantId",confirmed_at::text as "confirmedAt",member_id as "memberId",team_data as "teamData",meta
      from tournament_registrations where tournament_id=$1`,[id])).rows;
  }
  async rotateTeamCode(id:string,teamId:string):Promise<void> {
    await this.connection.query('update tournament_team_codes set code=$3 where tournament_id=$1 and team_id=$2',[id,teamId,randomBytes(8).toString('hex').toUpperCase()]);
  }
  async getTopProject(id:string):Promise<{revision:number;project:unknown}|null> {
    return (await this.connection.query('select revision,project from tournament_top_projects where tournament_id=$1',[id])).rows[0]??null;
  }
  async saveTopProject(id:string,revision:number,project:unknown):Promise<number> {
    return this.withTournamentTransaction(id,async()=>{
      assertTournamentWritable(await this.getTournament(id));
      const previous=await this.getTopProject(id);
      if((previous?.revision??0)!==revision)throw Error('Another device saved the design. Load the server version before replacing it');
      await this.connection.query('insert into tournament_top_projects(tournament_id,revision,project) values($1,$2,$3::jsonb) on conflict(tournament_id) do update set revision=excluded.revision,project=excluded.project',[id,revision+1,JSON.stringify(project)]);
      return revision+1;
    });
  }
  async enqueueRegistrationMail(id:string,key:string,email:string,title:string,url:string,notice:string):Promise<void> {
    await this.connection.query('insert into registration_outbox(id,tournament_id,payload) values($1,$2,$3::jsonb) on conflict(id) do nothing',[key,id,JSON.stringify({email,title,url,notice})]);
  }
  async deliverRegistrationMail(send:(payload:{email:string;title:string;url:string;notice:string})=>Promise<void>):Promise<void> {
    // A lease prevents overlapping workers; failures retry without holding a tournament transaction.
    const jobs=await this.pool.query(`update registration_outbox set retry_at=now()+interval '2 minutes' where id in
      (select id from registration_outbox where retry_at<=now() order by created_at limit 5 for update skip locked) returning id,payload`);
    for(const job of jobs.rows)try{await send(job.payload);await this.pool.query('delete from registration_outbox where id=$1',[job.id]);}catch{await this.pool.query("update registration_outbox set retry_at=now()+interval '5 minutes' where id=$1",[job.id]);}
  }

  async ensureSchema(): Promise<void> {
    await this.connection.query(`create table if not exists tournament_top_projects (
      tournament_id text primary key references tournaments(id) on delete cascade, revision integer not null, project jsonb not null);
      create table if not exists registration_outbox (id text primary key,tournament_id text not null references tournaments(id) on delete cascade,
      payload jsonb not null,created_at timestamptz not null default now(),retry_at timestamptz not null default now());`);
    await this.connection.query(`create table if not exists tournament_fortnite (
      tournament_id text primary key references tournaments(id) on delete cascade, data jsonb not null)`);
    await this.connection.query(`
      create table if not exists tournament_registrations (
        tournament_id text not null references tournaments(id) on delete cascade,
        email text not null, nickname text not null, token_hash text not null unique,
        expires_at timestamptz not null, sent_at timestamptz not null,
        participant_id text, confirmed_at timestamptz,
        primary key(tournament_id,email)
      );
      create table if not exists registration_request_limits (
        key text primary key, window_start bigint not null, attempts integer not null
      );
      alter table tournament_registrations add column if not exists member_id text;
      alter table tournament_registrations add column if not exists team_data jsonb;
      alter table tournament_registrations add column if not exists meta jsonb not null default '{}';
      create table if not exists tournament_team_members (
        id text primary key, tournament_id text not null references tournaments(id) on delete cascade,
        nickname text not null,nick_key text not null,team_id text,role text not null check(role in ('PLAYER','RESERVE')),
        revision integer not null default 1, unique(tournament_id,nick_key)
      );
      alter table tournament_team_members add column if not exists meta jsonb not null default '{}';
      update tournament_team_members m set meta=m.meta||'{"captain":true}'::jsonb
        from tournament_registrations r where r.member_id=m.id and r.tournament_id=m.tournament_id
        and r.team_data->>'mode'='TEAM_CREATE' and r.participant_id=m.team_id and not (m.meta ? 'captain');
      create table if not exists tournament_team_codes (
        tournament_id text not null references tournaments(id) on delete cascade,
        team_id text not null, code text not null unique, primary key(tournament_id,team_id)
      );
      create table if not exists tournament_operations (
        tournament_id text not null references tournaments(id) on delete cascade,
        id text not null, fingerprint text not null, result jsonb, created_at timestamptz not null default now(),
        primary key(tournament_id,id)
      );
      create table if not exists tournament_activity (
        id text primary key, tournament_id text not null references tournaments(id) on delete cascade,
        created_at timestamptz not null, event jsonb not null
      );
      create index if not exists tournament_activity_recent on tournament_activity(tournament_id,created_at desc);
      create table if not exists tournament_sync_jobs (
        id text primary key, tournament_id text not null references tournaments(id) on delete cascade, job jsonb not null
      );
      create index if not exists tournament_sync_jobs_tournament on tournament_sync_jobs(tournament_id);
    `);
    await this.connection.query(`
      alter table matches
      add column if not exists bracket_stage text not null default 'WINNERS'
    `);
    await this.connection.query(`
      alter table matches
      add column if not exists advancers_required integer not null default 1
    `);
    await this.connection.query(`
      alter table matches
      add column if not exists game_results jsonb null
    `);
    await this.connection.query(`
      alter table matches
      add column if not exists character_selections jsonb null
    `);
    await this.connection.query(`
      alter table matches
      add column if not exists game_character_selections jsonb null
    `);
    await this.connection.query(`
      alter table matches
      add column if not exists advancing_participant_ids jsonb null
    `);
    await this.connection.query(`
      alter table matches
      add column if not exists reported_best_of integer null
    `);
    await this.connection.query(`
      alter table tournaments
      add column if not exists import_source jsonb null
    `);
    await this.connection.query(`
      alter table tournament_participants
      add column if not exists external_ref jsonb null
    `);
    await this.connection.query(`
      alter table matches
      add column if not exists external_ref jsonb null
    `);
  }

  async saveTournament(tournament: Tournament, transaction?: PoolClient): Promise<Tournament> {
    await (transaction ?? this.connection).query(
      `
        insert into tournaments (
          id, owner_id, title, game_title, description, platform, status,
          starts_at, max_participants, is_public, settings, import_source, created_at, updated_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14
        )
        on conflict (id) do update set
          owner_id = excluded.owner_id,
          title = excluded.title,
          game_title = excluded.game_title,
          description = excluded.description,
          platform = excluded.platform,
          status = excluded.status,
          starts_at = excluded.starts_at,
          max_participants = excluded.max_participants,
          is_public = excluded.is_public,
          settings = excluded.settings,
          import_source = excluded.import_source,
          updated_at = excluded.updated_at
      `,
      [
        tournament.id,
        tournament.ownerId,
        tournament.title,
        tournament.gameTitle,
        tournament.description,
        tournament.platform,
        tournament.status,
        tournament.startsAt,
        tournament.maxParticipants,
        tournament.isPublic,
        JSON.stringify(tournament.settings),
        tournament.importSource ? JSON.stringify(tournament.importSource) : null,
        tournament.createdAt,
        tournament.updatedAt,
      ],
    );

    return tournament;
  }

  async replaceOverview(tournament: Tournament, participants: TournamentParticipant[], matches: Match[]): Promise<void> {
    await this.withTournamentTransaction(tournament.id, async () => {
      await this.saveTournament(tournament);
      await this.replaceParticipants(tournament.id, participants);
      await this.replaceMatches(tournament.id, matches);
    });
  }

  async getTournament(tournamentId: string): Promise<Tournament | undefined> {
    const result = await this.connection.query<TournamentRow>(
      "select * from tournaments where id = $1",
      [tournamentId],
    );
    return result.rows[0] ? this.mapTournament(result.rows[0]) : undefined;
  }

  async deleteTournament(tournamentId: string): Promise<void> {
    await this.connection.query("delete from tournaments where id = $1", [tournamentId]);
  }

  async replaceParticipants(
    tournamentId: string,
    participants: TournamentParticipant[],
    transaction?: PoolClient,
  ): Promise<void> {
    transaction ??= this.transactions.getStore()?.active ? this.transactions.getStore()?.client : undefined;
    const client = transaction ?? await this.pool.connect();
    try {
      if (!transaction) await client.query("begin");
      await client.query("delete from tournament_participants where tournament_id = $1", [
        tournamentId,
      ]);

      for (const participant of participants) {
        await client.query(
          `
            insert into tournament_participants (
              id, tournament_id, user_id, display_name, seed, checked_in, status, external_ref, created_at
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
          `,
          [
            participant.id,
            participant.tournamentId,
            participant.userId ?? null,
            participant.displayName,
            participant.seed ?? null,
            participant.checkedIn,
            participant.status,
            participant.externalRef ? JSON.stringify(participant.externalRef) : null,
            participant.createdAt,
          ],
        );
      }

      if (!transaction) await client.query("commit");
    } catch (error) {
      if (!transaction) await client.query("rollback");
      throw error;
    } finally {
      if (!transaction) client.release();
    }
  }

  async listParticipants(tournamentId: string): Promise<TournamentParticipant[]> {
    const result = await this.connection.query<ParticipantRow>(
      `
        select * from tournament_participants
        where tournament_id = $1
        order by seed asc nulls last, created_at asc
      `,
      [tournamentId],
    );
    return result.rows.map((row) => this.mapParticipant(row));
  }

  async replaceMatches(tournamentId: string, matches: Match[], transaction?: PoolClient): Promise<void> {
    const sanitizedMatches = this.deduplicateMatchesForReplace(tournamentId, matches);
    transaction ??= this.transactions.getStore()?.active ? this.transactions.getStore()?.client : undefined;
    const client = transaction ?? await this.pool.connect();
    try {
      if (!transaction) await client.query("begin");
      const existing = new Map((await this.listMatches(tournamentId, client)).map(match => [match.id, match]));
      const nextIds = new Set(sanitizedMatches.map(match => match.id));
      const removed = [...existing.keys()].filter(id => !nextIds.has(id));
      const changed = sanitizedMatches.filter(match => stableJson(existing.get(match.id)) !== stableJson(match));
      const participantDeletes = [...removed, ...changed.filter(match => existing.has(match.id)).map(match => match.id)];
      if (participantDeletes.length) await client.query("delete from match_participants where match_id = any($1::text[])", [participantDeletes]);
      if (removed.length) await client.query("delete from matches where tournament_id=$1 and id = any($2::text[])", [tournamentId, removed]);
      for (const match of changed) {
        await client.query(
          `
            insert into matches (
              id, tournament_id, bracket_stage, round_number, match_number, status, best_of, reported_best_of,
              advancers_required, game_results, character_selections, game_character_selections, advancing_participant_ids, winner_participant_id, external_ref, call_data, created_at, updated_at
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15::jsonb, $16::jsonb, $17, $18)
            on conflict (id) do update set bracket_stage = excluded.bracket_stage, round_number = excluded.round_number, match_number = excluded.match_number, status = excluded.status, best_of = excluded.best_of, reported_best_of = excluded.reported_best_of, advancers_required = excluded.advancers_required, game_results = excluded.game_results, character_selections = excluded.character_selections, game_character_selections = excluded.game_character_selections, advancing_participant_ids = excluded.advancing_participant_ids, winner_participant_id = excluded.winner_participant_id, external_ref = excluded.external_ref, call_data = excluded.call_data, created_at = excluded.created_at, updated_at = excluded.updated_at
          `,
          [
            match.id,
            match.tournamentId,
            match.bracketStage,
            match.roundNumber,
            match.matchNumber,
            match.status,
            match.bestOf,
            match.reportedBestOf ?? null,
            match.advancersRequired,
            match.gameResults ? JSON.stringify(match.gameResults) : null,
            match.characterSelections ? JSON.stringify(match.characterSelections) : null,
            match.gameCharacterSelections ? JSON.stringify(match.gameCharacterSelections) : null,
            match.advancingParticipantIds ? JSON.stringify(match.advancingParticipantIds) : null,
            match.winnerParticipantId ?? null,
            match.externalRef ? JSON.stringify(match.externalRef) : null,
            match.call ? JSON.stringify(match.call) : null,
            match.createdAt,
            match.updatedAt,
          ],
        );

        for (const participant of match.participants) {
          await client.query(
            `
              insert into match_participants (
                id, match_id, participant_id, display_name, slot, score
              )
              values ($1, $2, $3, $4, $5, $6)
            `,
            [
              participant.id,
              match.id,
              participant.participantId,
              participant.displayName,
              participant.slot,
              participant.score,
            ],
          );
        }
      }

      if (!transaction) await client.query("commit");
    } catch (error) {
      if (!transaction) await client.query("rollback");
      throw error;
    } finally {
      if (!transaction) client.release();
    }
  }

  async listMatches(tournamentId: string, transaction?: PoolClient): Promise<Match[]> {
    const matchResult = await (transaction ?? this.connection).query<MatchRow>(
      `
        select * from matches
        where tournament_id = $1
        order by round_number asc, match_number asc
      `,
      [tournamentId],
    );

    const participantResult = await (transaction ?? this.connection).query<MatchParticipantRow>(
      `
        select mp.*
        from match_participants mp
        inner join matches m on m.id = mp.match_id
        where m.tournament_id = $1
        order by mp.slot asc
      `,
      [tournamentId],
    );

    const participantsByMatch = new Map<string, MatchParticipant[]>();
    for (const row of participantResult.rows) {
      const current = participantsByMatch.get(row.match_id) ?? [];
      current.push(this.mapMatchParticipant(row));
      participantsByMatch.set(row.match_id, current);
    }

    return matchResult.rows.map((row) => ({
      id: row.id,
      tournamentId: row.tournament_id,
      bracketStage: row.bracket_stage,
      roundNumber: row.round_number,
      matchNumber: row.match_number,
      status: row.status,
      bestOf: row.best_of,
      reportedBestOf: row.reported_best_of ?? undefined,
      advancersRequired: row.advancers_required,
      gameResults: row.game_results ?? undefined,
      characterSelections: row.character_selections ?? undefined,
      gameCharacterSelections: row.game_character_selections ?? undefined,
      advancingParticipantIds: row.advancing_participant_ids ?? undefined,
      participants: participantsByMatch.get(row.id) ?? [],
      winnerParticipantId: row.winner_participant_id ?? undefined,
      externalRef: row.external_ref ?? undefined,
      call: row.call_data ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async countTournaments(): Promise<number> {
    const result = await this.connection.query<{ count: string }>("select count(*)::text as count from tournaments");
    return Number(result.rows[0]?.count ?? "0");
  }

  private deduplicateMatchesForReplace(tournamentId: string, matches: Match[]): Match[] {
    const byId = new Map<string, { match: Match; index: number }>();
    const collisions: Array<{
      matchId: string;
      keptStatus: Match["status"];
      droppedStatus: Match["status"];
      keptUpdatedAt: string;
      droppedUpdatedAt: string;
    }> = [];

    matches.forEach((match, index) => {
      const existing = byId.get(match.id);
      if (!existing) {
        byId.set(match.id, { match, index });
        return;
      }

      const preferred = this.choosePreferredMatch(existing.match, match);
      const dropped = preferred === existing.match ? match : existing.match;
      const kept = preferred;
      byId.set(match.id, {
        match: preferred,
        index: preferred === existing.match ? existing.index : index,
      });
      collisions.push({
        matchId: match.id,
        keptStatus: kept.status,
        droppedStatus: dropped.status,
        keptUpdatedAt: kept.updatedAt,
        droppedUpdatedAt: dropped.updatedAt,
      });
    });

    if (collisions.length > 0) {
      console.warn("[matches][dedupe] duplicate match ids detected before replaceMatches", {
        tournamentId,
        duplicates: collisions.length,
        collisions,
      });
    }

    return Array.from(byId.values())
      .sort((left, right) => left.index - right.index)
      .map((entry) => entry.match);
  }

  private choosePreferredMatch(current: Match, incoming: Match): Match {
    const currentScore = this.matchPreferenceTuple(current);
    const incomingScore = this.matchPreferenceTuple(incoming);
    for (let index = 0; index < currentScore.length; index += 1) {
      if (incomingScore[index] > currentScore[index]) {
        return incoming;
      }
      if (incomingScore[index] < currentScore[index]) {
        return current;
      }
    }
    return incoming;
  }

  private matchPreferenceTuple(match: Match): number[] {
    const resolvedParticipants = match.participants.filter((participant) => !participant.participantId.includes("_of_")).length;
    const scoreTotal = match.participants.reduce((sum, participant) => sum + participant.score, 0);
    const updatedAtMs = Date.parse(match.updatedAt);
    return [
      this.matchStatusRank(match.status),
      resolvedParticipants,
      match.winnerParticipantId ? 1 : 0,
      match.advancingParticipantIds?.length ?? 0,
      match.gameResults?.length ?? 0,
      match.gameCharacterSelections?.length ?? 0,
      match.characterSelections?.length ?? 0,
      match.call?.startedAt ? 1 : 0,
      match.call?.calledAt ? 1 : 0,
      scoreTotal,
      match.externalRef?.provider === "START_GG" ? match.externalRef.localSyncVersion ?? 0 : 0,
      match.externalRef?.provider === "START_GG" ? match.externalRef.syncedSyncVersion ?? 0 : 0,
      Number.isNaN(updatedAtMs) ? 0 : updatedAtMs,
    ];
  }

  private matchStatusRank(status: Match["status"]): number {
    switch (status) {
      case "COMPLETED":
      case "WALKOVER":
        return 6;
      case "UNDER_REVIEW":
      case "RESULT_REPORTED":
        return 5;
      case "PLAYING":
        return 4;
      case "CHECKED_IN":
        return 3;
      case "CALLED":
        return 2;
      case "PENDING":
        return 1;
      case "CANCELLED":
      default:
        return 0;
    }
  }

  private mapTournament(row: TournamentRow): Tournament {
    return {
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      gameTitle: row.game_title,
      description: row.description,
      platform: row.platform,
      status: row.status,
      startsAt: row.starts_at,
      maxParticipants: row.max_participants,
      isPublic: row.is_public,
      settings: row.settings,
      importSource: row.import_source ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapParticipant(row: ParticipantRow): TournamentParticipant {
    return {
      id: row.id,
      tournamentId: row.tournament_id,
      userId: row.user_id ?? undefined,
      displayName: row.display_name,
      seed: row.seed ?? undefined,
      checkedIn: row.checked_in,
      status: row.status,
      externalRef: row.external_ref ?? undefined,
      createdAt: row.created_at,
    };
  }

  private mapMatchParticipant(row: MatchParticipantRow): MatchParticipant {
    return {
      id: row.id,
      participantId: row.participant_id,
      displayName: row.display_name,
      slot: row.slot,
      score: row.score,
    };
  }
}
