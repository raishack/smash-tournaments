import { createId } from "../../shared/id.js";
import type { LadderActivity } from "./ladder.types.js";
import type { Pool, PoolClient } from "pg";
import type {
  MatchCharacterSelection,
  MatchGameCharacterSelections,
  MatchParticipant,
} from "../../shared/types.js";
import type {
  LadderMatch,
  LadderQueueEntry,
  LadderSession,
} from "./ladder.types.js";

type SqlExecutor = Pool | PoolClient;
const iso = (value: string): string => new Date(value).toISOString();

type LadderSessionRow = {
  id: string;
  tournament_id: string;
  status: LadderSession["status"];
  created_at: string;
  started_at: string;
  completed_at: string | null;
  completed_by_user_id: string | null;
  options: LadderSession["options"];
};

type LadderQueueEntryRow = {
  id: string;
  ladder_session_id: string;
  tournament_id: string;
  participant_id: string;
  display_name: string;
  queued_at: string;
  created_at: string;
  updated_at: string;
};

type LadderMatchRow = {
  id: string;
  ladder_session_id: string;
  tournament_id: string;
  status: LadderMatch["status"];
  best_of: number;
  details: LadderMatch["details"];
  ready_deadline_at: string | null;
  participant_one_ready_at: string | null;
  participant_two_ready_at: string | null;
  winner_participant_id: string | null;
  game_results: string[] | null;
  character_selections: MatchCharacterSelection[] | null;
  game_character_selections: MatchGameCharacterSelections[] | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_by_participant_id: string | null;
  updated_at: string;
};

type LadderMatchParticipantRow = {
  id: string;
  ladder_match_id: string;
  participant_id: string;
  display_name: string;
  slot: number;
  score: number;
};

export class LadderPostgresRepository {
  constructor(private readonly pool: Pool) {}

  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      create table if not exists ladder_sessions (
        id text primary key,
        tournament_id text not null references tournaments(id) on delete cascade,
        status text not null,
        created_at timestamptz not null,
        started_at timestamptz not null,
        completed_at timestamptz null,
        completed_by_user_id text null
      )
    `);
    await this.pool.query(`
      create unique index if not exists idx_ladder_sessions_active_tournament
      on ladder_sessions (tournament_id)
      where status = 'ACTIVE'
    `);
    await this.pool.query(`
      create table if not exists ladder_queue_entries (
        id text primary key,
        ladder_session_id text not null references ladder_sessions(id) on delete cascade,
        tournament_id text not null references tournaments(id) on delete cascade,
        participant_id text not null,
        display_name text not null,
        queued_at timestamptz not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      )
    `);
    await this.pool.query(`
      create unique index if not exists idx_ladder_queue_unique_participant
      on ladder_queue_entries (ladder_session_id, participant_id)
    `);
    await this.pool.query(`
      create index if not exists idx_ladder_queue_order
      on ladder_queue_entries (ladder_session_id, queued_at, created_at)
    `);
    await this.pool.query(`
      create table if not exists ladder_matches (
        id text primary key,
        ladder_session_id text not null references ladder_sessions(id) on delete cascade,
        tournament_id text not null references tournaments(id) on delete cascade,
        status text not null,
        best_of integer not null,
        ready_deadline_at timestamptz null,
        participant_one_ready_at timestamptz null,
        participant_two_ready_at timestamptz null,
        winner_participant_id text null,
        game_results jsonb null,
        character_selections jsonb null,
        game_character_selections jsonb null,
        created_at timestamptz not null,
        started_at timestamptz null,
        completed_at timestamptz null,
        cancelled_by_participant_id text null,
        updated_at timestamptz not null
      )
    `);
    await this.pool.query(`
      create index if not exists idx_ladder_matches_session
      on ladder_matches (ladder_session_id, created_at desc)
    `);
    await this.pool.query(`
      create table if not exists ladder_match_participants (
        id text primary key,
        ladder_match_id text not null references ladder_matches(id) on delete cascade,
        participant_id text not null,
        display_name text not null,
        slot integer not null,
        score integer not null default 0
      )
    `);
    await this.pool.query(`
      create index if not exists idx_ladder_match_participants_match
      on ladder_match_participants (ladder_match_id, slot)
    `);
    await this.pool.query("alter table ladder_sessions add column if not exists options jsonb not null default '{}'::jsonb");
    await this.pool.query("alter table ladder_matches add column if not exists details jsonb not null default '{}'::jsonb");
    await this.pool.query(`create table if not exists ladder_activity (
      id text primary key, tournament_id text not null references tournaments(id) on delete cascade,
      session_id text not null references ladder_sessions(id) on delete cascade,
      created_at timestamptz not null, event jsonb not null)`);
    await this.pool.query("create index if not exists idx_ladder_activity_session on ladder_activity(session_id,created_at desc)");
  }

  async runInTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await callback(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getActiveSessionForTournament(
    tournamentId: string,
    executor: SqlExecutor = this.pool,
    lock = false,
  ): Promise<LadderSession | undefined> {
    const result = await executor.query<LadderSessionRow>(
      `
        select * from ladder_sessions
        where tournament_id = $1 and status = 'ACTIVE'
        ${lock ? "for update" : ""}
      `,
      [tournamentId],
    );
    return result.rows[0] ? this.mapSession(result.rows[0]) : undefined;
  }

  async getLatestSessionForTournament(
    tournamentId: string,
    executor: SqlExecutor = this.pool,
  ): Promise<LadderSession | undefined> {
    const result = await executor.query<LadderSessionRow>(
      `
        select * from ladder_sessions
        where tournament_id = $1
        order by created_at desc
        limit 1
      `,
      [tournamentId],
    );
    return result.rows[0] ? this.mapSession(result.rows[0]) : undefined;
  }

  async saveSession(session: LadderSession, executor: SqlExecutor = this.pool): Promise<LadderSession> {
    await executor.query(
      `
        insert into ladder_sessions (
          id, tournament_id, status, created_at, started_at, completed_at, completed_by_user_id, options
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        on conflict (id) do update set
          status = excluded.status,
          completed_at = excluded.completed_at,
          completed_by_user_id = excluded.completed_by_user_id,
          options = excluded.options
      `,
      [
        session.id,
        session.tournamentId,
        session.status,
        session.createdAt,
        session.startedAt,
        session.completedAt ?? null,
        session.completedByUserId ?? null,
        JSON.stringify(session.options ?? {}),
      ],
    );
    return session;
  }

  async listQueueEntries(
    ladderSessionId: string,
    executor: SqlExecutor = this.pool,
    lock = false,
  ): Promise<LadderQueueEntry[]> {
    const result = await executor.query<LadderQueueEntryRow>(
      `
        select * from ladder_queue_entries
        where ladder_session_id = $1
        order by queued_at asc, created_at asc
        ${lock ? "for update" : ""}
      `,
      [ladderSessionId],
    );
    return result.rows.map((row) => this.mapQueueEntry(row));
  }

  async getQueueEntryForParticipant(
    ladderSessionId: string,
    participantId: string,
    executor: SqlExecutor = this.pool,
    lock = false,
  ): Promise<LadderQueueEntry | undefined> {
    const result = await executor.query<LadderQueueEntryRow>(
      `
        select * from ladder_queue_entries
        where ladder_session_id = $1 and participant_id = $2
        ${lock ? "for update" : ""}
      `,
      [ladderSessionId, participantId],
    );
    return result.rows[0] ? this.mapQueueEntry(result.rows[0]) : undefined;
  }

  async saveQueueEntry(entry: LadderQueueEntry, executor: SqlExecutor = this.pool): Promise<LadderQueueEntry> {
    await executor.query(
      `
        insert into ladder_queue_entries (
          id, ladder_session_id, tournament_id, participant_id, display_name, queued_at, created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (ladder_session_id, participant_id) do update set
          display_name = excluded.display_name,
          queued_at = excluded.queued_at,
          updated_at = excluded.updated_at
      `,
      [
        entry.id,
        entry.ladderSessionId,
        entry.tournamentId,
        entry.participantId,
        entry.displayName,
        entry.queuedAt,
        entry.createdAt,
        entry.updatedAt,
      ],
    );
    return entry;
  }

  async deleteQueueEntryByParticipant(
    ladderSessionId: string,
    participantId: string,
    executor: SqlExecutor = this.pool,
  ): Promise<void> {
    await executor.query(
      "delete from ladder_queue_entries where ladder_session_id = $1 and participant_id = $2",
      [ladderSessionId, participantId],
    );
  }

  async clearQueue(ladderSessionId: string, executor: SqlExecutor = this.pool): Promise<void> {
    await executor.query("delete from ladder_queue_entries where ladder_session_id = $1", [ladderSessionId]);
  }

  async listMatches(
    ladderSessionId: string,
    executor: SqlExecutor = this.pool,
    lock = false,
  ): Promise<LadderMatch[]> {
    const matchResult = await executor.query<LadderMatchRow>(
      `
        select * from ladder_matches
        where ladder_session_id = $1
        order by created_at desc
        ${lock ? "for update" : ""}
      `,
      [ladderSessionId],
    );
    const participantResult = await executor.query<LadderMatchParticipantRow>(
      `
        select lmp.*
        from ladder_match_participants lmp
        inner join ladder_matches lm on lm.id = lmp.ladder_match_id
        where lm.ladder_session_id = $1
        order by lmp.slot asc
      `,
      [ladderSessionId],
    );

    const participantsByMatch = new Map<string, MatchParticipant[]>();
    for (const row of participantResult.rows) {
      const list = participantsByMatch.get(row.ladder_match_id) ?? [];
      list.push({
        id: row.id,
        participantId: row.participant_id,
        displayName: row.display_name,
        slot: row.slot,
        score: row.score,
      });
      participantsByMatch.set(row.ladder_match_id, list);
    }

    return matchResult.rows.map((row) => this.mapMatch(row, participantsByMatch.get(row.id) ?? []));
  }

  async getMatchById(
    matchId: string,
    executor: SqlExecutor = this.pool,
    lock = false,
  ): Promise<LadderMatch | undefined> {
    const result = await executor.query<LadderMatchRow>(
      `
        select * from ladder_matches
        where id = $1
        ${lock ? "for update" : ""}
      `,
      [matchId],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    const participantsResult = await executor.query<LadderMatchParticipantRow>(
      `
        select * from ladder_match_participants
        where ladder_match_id = $1
        order by slot asc
      `,
      [matchId],
    );
    return this.mapMatch(
      row,
      participantsResult.rows.map((participant) => ({
        id: participant.id,
        participantId: participant.participant_id,
        displayName: participant.display_name,
        slot: participant.slot,
        score: participant.score,
      })),
    );
  }

  async getOpenMatchForParticipant(
    ladderSessionId: string,
    participantId: string,
    executor: SqlExecutor = this.pool,
    lock = false,
  ): Promise<LadderMatch | undefined> {
    const result = await executor.query<{ id: string }>(
      `
        select lm.id
        from ladder_matches lm
        inner join ladder_match_participants lmp on lmp.ladder_match_id = lm.id
        where lm.ladder_session_id = $1
          and lmp.participant_id = $2
          and lm.status in ('READY_CHECK', 'PLAYING', 'SUSPENDED', 'AWAITING_CONFIRMATION', 'DISPUTED')
        order by lm.created_at desc
        limit 1
        ${lock ? "for update" : ""}
      `,
      [ladderSessionId, participantId],
    );
    if (!result.rows[0]?.id) {
      return undefined;
    }
    return this.getMatchById(result.rows[0].id, executor, lock);
  }

  async saveMatch(match: LadderMatch, executor: SqlExecutor = this.pool): Promise<LadderMatch> {
    match = { ...match, details: { ...match.details, revision: createId("lrev") } };
    await executor.query(
      `
        insert into ladder_matches (
          id, ladder_session_id, tournament_id, status, best_of, ready_deadline_at,
          participant_one_ready_at, participant_two_ready_at, winner_participant_id,
          game_results, character_selections, game_character_selections,
          created_at, started_at, completed_at, cancelled_by_participant_id, updated_at, details
        )
        values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          $10::jsonb, $11::jsonb, $12::jsonb,
          $13, $14, $15, $16, $17, $18::jsonb
        )
        on conflict (id) do update set
          status = excluded.status,
          best_of = excluded.best_of,
          details = excluded.details,
          ready_deadline_at = excluded.ready_deadline_at,
          participant_one_ready_at = excluded.participant_one_ready_at,
          participant_two_ready_at = excluded.participant_two_ready_at,
          winner_participant_id = excluded.winner_participant_id,
          game_results = excluded.game_results,
          character_selections = excluded.character_selections,
          game_character_selections = excluded.game_character_selections,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          cancelled_by_participant_id = excluded.cancelled_by_participant_id,
          updated_at = excluded.updated_at
      `,
      [
        match.id,
        match.ladderSessionId,
        match.tournamentId,
        match.status,
        match.bestOf,
        match.readyDeadlineAt ?? null,
        match.participantOneReadyAt ?? null,
        match.participantTwoReadyAt ?? null,
        match.winnerParticipantId ?? null,
        match.gameResults ? JSON.stringify(match.gameResults) : null,
        match.characterSelections ? JSON.stringify(match.characterSelections) : null,
        match.gameCharacterSelections ? JSON.stringify(match.gameCharacterSelections) : null,
        match.createdAt,
        match.startedAt ?? null,
        match.completedAt ?? null,
        match.cancelledByParticipantId ?? null,
        match.updatedAt,
        JSON.stringify(match.details),
      ],
    );

    await executor.query("delete from ladder_match_participants where ladder_match_id = $1", [match.id]);
    for (const participant of match.participants) {
      await executor.query(
        `
          insert into ladder_match_participants (
            id, ladder_match_id, participant_id, display_name, slot, score
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
    return match;
  }

  async listActiveTournamentIds(): Promise<string[]> {
    return (await this.pool.query<{tournament_id: string}>("select tournament_id from ladder_sessions where status='ACTIVE' order by started_at")).rows.map(r => r.tournament_id);
  }

  async appendActivity(tournamentId: string, sessionId: string, event: LadderActivity, executor: SqlExecutor = this.pool): Promise<void> {
    await executor.query("insert into ladder_activity(id,tournament_id,session_id,created_at,event) values($1,$2,$3,$4,$5::jsonb)", [event.id,tournamentId,sessionId,event.createdAt,JSON.stringify(event)]);
  }

  async listActivity(sessionId: string, executor: SqlExecutor = this.pool): Promise<LadderActivity[]> {
    return (await executor.query<{event: LadderActivity}>("select event from ladder_activity where session_id=$1 order by created_at desc,id desc limit 100", [sessionId])).rows.map(r => r.event);
  }

  private mapSession(row: LadderSessionRow): LadderSession {
    return {
      id: row.id,
      tournamentId: row.tournament_id,
      status: row.status,
      createdAt: iso(row.created_at),
      startedAt: iso(row.started_at),
      completedAt: row.completed_at ? iso(row.completed_at) : undefined,
      completedByUserId: row.completed_by_user_id ?? undefined,
      options: row.options,
    };
  }

  private mapQueueEntry(row: LadderQueueEntryRow): LadderQueueEntry {
    return {
      id: row.id,
      ladderSessionId: row.ladder_session_id,
      tournamentId: row.tournament_id,
      participantId: row.participant_id,
      displayName: row.display_name,
      queuedAt: iso(row.queued_at),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }

  private mapMatch(row: LadderMatchRow, participants: MatchParticipant[]): LadderMatch {
    return {
      id: row.id,
      ladderSessionId: row.ladder_session_id,
      tournamentId: row.tournament_id,
      status: row.status,
      bestOf: row.best_of,
      details: row.details,
      stationLabel: row.details?.stationNumber ? `Setup ${row.details.stationNumber}` : undefined,
      participants,
      readyDeadlineAt: row.ready_deadline_at ? iso(row.ready_deadline_at) : undefined,
      participantOneReadyAt: row.participant_one_ready_at ? iso(row.participant_one_ready_at) : undefined,
      participantTwoReadyAt: row.participant_two_ready_at ? iso(row.participant_two_ready_at) : undefined,
      winnerParticipantId: row.winner_participant_id ?? undefined,
      gameResults: row.game_results ?? undefined,
      characterSelections: row.character_selections ?? undefined,
      gameCharacterSelections: row.game_character_selections ?? undefined,
      createdAt: iso(row.created_at),
      startedAt: row.started_at ? iso(row.started_at) : undefined,
      completedAt: row.completed_at ? iso(row.completed_at) : undefined,
      cancelledByParticipantId: row.cancelled_by_participant_id ?? undefined,
      updatedAt: iso(row.updated_at),
    };
  }
}
