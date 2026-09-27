import type { Pool } from "pg";

export interface PlayerAccountRecord {
  id: string;
  provider: "START_GG";
  startggUserId: string;
  startggPlayerId?: string;
  gamerTag: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  scope: string;
  tokenExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerSessionRecord {
  id: string;
  accountId: string;
  sessionTokenHash: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

export interface PlayerAuthStateRecord {
  id: string;
  state: string;
  redirectUri: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  completedAt?: string;
  completedRedirectUrl?: string;
}

export interface PlayerPushTokenRecord {
  token: string;
  accountId: string;
  platform: "ANDROID";
  deviceLabel?: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface PlayerTournamentBindingRecord {
  accountId: string;
  tournamentId: string;
  participantId: string;
  createdAt: string;
  updatedAt: string;
}

type PlayerAccountRow = {
  id: string;
  provider: "START_GG";
  startgg_user_id: string;
  startgg_player_id: string | null;
  gamer_tag: string;
  display_name: string;
  access_token: string;
  refresh_token: string;
  scope: string;
  token_expires_at: string;
  created_at: string;
  updated_at: string;
};

type PlayerSessionRow = {
  id: string;
  account_id: string;
  session_token_hash: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

type PlayerAuthStateRow = {
  id: string;
  state: string;
  redirect_uri: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  completed_at: string | null;
  completed_redirect_url: string | null;
};

type PlayerPushTokenRow = {
  token: string;
  account_id: string;
  platform: "ANDROID";
  device_label: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

type PlayerTournamentBindingRow = {
  account_id: string;
  tournament_id: string;
  participant_id: string;
  created_at: string;
  updated_at: string;
};

export class PlayerPostgresRepository {
  constructor(private readonly pool: Pool) {}

  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      create table if not exists player_accounts (
        id text primary key,
        provider text not null,
        startgg_user_id text not null unique,
        startgg_player_id text null,
        gamer_tag text not null,
        display_name text not null,
        access_token text not null,
        refresh_token text not null,
        scope text not null,
        token_expires_at timestamptz not null,
        created_at timestamptz not null,
        updated_at timestamptz not null
      )
    `);
    await this.pool.query(`
      create table if not exists player_sessions (
        id text primary key,
        account_id text not null references player_accounts(id) on delete cascade,
        session_token_hash text not null unique,
        created_at timestamptz not null,
        last_seen_at timestamptz not null,
        revoked_at timestamptz null
      )
    `);
    await this.pool.query(`
      create table if not exists player_auth_states (
        id text primary key,
        state text not null unique,
        redirect_uri text not null,
        created_at timestamptz not null,
        expires_at timestamptz not null,
        used_at timestamptz null,
        completed_at timestamptz null,
        completed_redirect_url text null
      )
    `);
    await this.pool.query(`
      alter table player_auth_states
      add column if not exists completed_at timestamptz null
    `);
    await this.pool.query(`
      alter table player_auth_states
      add column if not exists completed_redirect_url text null
    `);
    await this.pool.query(`
      create index if not exists idx_player_sessions_account_id
      on player_sessions (account_id)
    `);
    await this.pool.query(`
      create table if not exists player_push_tokens (
        token text primary key,
        account_id text not null references player_accounts(id) on delete cascade,
        platform text not null,
        device_label text null,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        last_seen_at timestamptz not null
      )
    `);
    await this.pool.query(`
      create index if not exists idx_player_push_tokens_account_id
      on player_push_tokens (account_id)
    `);
    await this.pool.query(`
      create table if not exists player_tournament_bindings (
        account_id text not null references player_accounts(id) on delete cascade,
        tournament_id text not null,
        participant_id text not null,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        primary key (account_id, tournament_id)
      )
    `);
    await this.pool.query(`
      create index if not exists idx_player_tournament_bindings_lookup
      on player_tournament_bindings (tournament_id, participant_id)
    `);
  }

  async saveAuthState(state: PlayerAuthStateRecord): Promise<void> {
    await this.pool.query(
      `
        insert into player_auth_states (
          id, state, redirect_uri, created_at, expires_at, used_at, completed_at, completed_redirect_url
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        state.id,
        state.state,
        state.redirectUri,
        state.createdAt,
        state.expiresAt,
        state.usedAt ?? null,
        state.completedAt ?? null,
        state.completedRedirectUrl ?? null,
      ],
    );
  }

  async findAuthState(stateValue: string): Promise<PlayerAuthStateRecord | undefined> {
    const result = await this.pool.query<PlayerAuthStateRow>(
      `
        select * from player_auth_states
        where state = $1
      `,
      [stateValue],
    );
    return result.rows[0] ? this.mapAuthState(result.rows[0]) : undefined;
  }

  async markAuthStateUsed(id: string, usedAt: string): Promise<boolean> {
    const result = await this.pool.query(
      `
        update player_auth_states
        set used_at = $2
        where id = $1
          and used_at is null
      `,
      [id, usedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async completeAuthState(id: string, completedAt: string, completedRedirectUrl: string): Promise<void> {
    await this.pool.query(
      `
        update player_auth_states
        set completed_at = $2,
            completed_redirect_url = $3
        where id = $1
      `,
      [id, completedAt, completedRedirectUrl],
    );
  }

  async findAccountByStartggUserId(startggUserId: string): Promise<PlayerAccountRecord | undefined> {
    const result = await this.pool.query<PlayerAccountRow>(
      "select * from player_accounts where startgg_user_id = $1",
      [startggUserId],
    );
    return result.rows[0] ? this.mapAccount(result.rows[0]) : undefined;
  }

  async findAccountById(accountId: string): Promise<PlayerAccountRecord | undefined> {
    const result = await this.pool.query<PlayerAccountRow>(
      "select * from player_accounts where id = $1",
      [accountId],
    );
    return result.rows[0] ? this.mapAccount(result.rows[0]) : undefined;
  }

  async saveAccount(account: PlayerAccountRecord): Promise<PlayerAccountRecord> {
    await this.pool.query(
      `
        insert into player_accounts (
          id, provider, startgg_user_id, startgg_player_id, gamer_tag, display_name,
          access_token, refresh_token, scope, token_expires_at, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12
        )
        on conflict (startgg_user_id) do update set
          provider = excluded.provider,
          startgg_player_id = excluded.startgg_player_id,
          gamer_tag = excluded.gamer_tag,
          display_name = excluded.display_name,
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          scope = excluded.scope,
          token_expires_at = excluded.token_expires_at,
          updated_at = excluded.updated_at
      `,
      [
        account.id,
        account.provider,
        account.startggUserId,
        account.startggPlayerId ?? null,
        account.gamerTag,
        account.displayName,
        account.accessToken,
        account.refreshToken,
        account.scope,
        account.tokenExpiresAt,
        account.createdAt,
        account.updatedAt,
      ],
    );
    return (await this.findAccountByStartggUserId(account.startggUserId)) ?? account;
  }

  async createSession(session: PlayerSessionRecord): Promise<void> {
    await this.pool.query(
      `
        insert into player_sessions (
          id, account_id, session_token_hash, created_at, last_seen_at, revoked_at
        ) values ($1, $2, $3, $4, $5, $6)
      `,
      [session.id, session.accountId, session.sessionTokenHash, session.createdAt, session.lastSeenAt, session.revokedAt ?? null],
    );
  }

  async findSessionByTokenHash(tokenHash: string): Promise<PlayerSessionRecord | undefined> {
    const result = await this.pool.query<PlayerSessionRow>(
      `
        select * from player_sessions
        where session_token_hash = $1 and revoked_at is null
      `,
      [tokenHash],
    );
    return result.rows[0] ? this.mapSession(result.rows[0]) : undefined;
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.pool.query(
      "update player_sessions set last_seen_at = $2 where id = $1",
      [sessionId, new Date().toISOString()],
    );
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.pool.query(
      "update player_sessions set revoked_at = $2 where session_token_hash = $1 and revoked_at is null",
      [tokenHash, new Date().toISOString()],
    );
  }

  async upsertPushToken(tokenRecord: PlayerPushTokenRecord): Promise<void> {
    await this.pool.query(
      `
        insert into player_push_tokens (
          token, account_id, platform, device_label, created_at, updated_at, last_seen_at
        ) values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (token) do update set
          account_id = excluded.account_id,
          platform = excluded.platform,
          device_label = excluded.device_label,
          updated_at = excluded.updated_at,
          last_seen_at = excluded.last_seen_at
      `,
      [
        tokenRecord.token,
        tokenRecord.accountId,
        tokenRecord.platform,
        tokenRecord.deviceLabel ?? null,
        tokenRecord.createdAt,
        tokenRecord.updatedAt,
        tokenRecord.lastSeenAt,
      ],
    );
  }

  async deletePushToken(token: string): Promise<void> {
    await this.pool.query("delete from player_push_tokens where token = $1", [token]);
  }

  async listPushTokensForAccounts(accountIds: string[]): Promise<PlayerPushTokenRecord[]> {
    if (accountIds.length === 0) {
      return [];
    }
    const result = await this.pool.query<PlayerPushTokenRow>(
      `
        select * from player_push_tokens
        where account_id = any($1::text[])
      `,
      [accountIds],
    );
    return result.rows.map((row) => this.mapPushToken(row));
  }

  async upsertTournamentBinding(binding: PlayerTournamentBindingRecord): Promise<void> {
    await this.pool.query(
      `
        insert into player_tournament_bindings (
          account_id, tournament_id, participant_id, created_at, updated_at
        ) values ($1, $2, $3, $4, $5)
        on conflict (account_id, tournament_id) do update set
          participant_id = excluded.participant_id,
          updated_at = excluded.updated_at
      `,
      [
        binding.accountId,
        binding.tournamentId,
        binding.participantId,
        binding.createdAt,
        binding.updatedAt,
      ],
    );
  }

  async deleteTournamentBinding(accountId: string, tournamentId: string): Promise<void> {
    await this.pool.query("delete from player_tournament_bindings where account_id = $1 and tournament_id = $2", [accountId, tournamentId]);
  }

  async listAccountIdsByTournamentParticipants(tournamentId: string, participantIds: string[]): Promise<string[]> {
    if (participantIds.length === 0) {
      return [];
    }
    const result = await this.pool.query<{ account_id: string }>(
      `
        select distinct account_id
        from player_tournament_bindings
        where tournament_id = $1
          and participant_id = any($2::text[])
      `,
      [tournamentId, participantIds],
    );
    return result.rows.map((row) => row.account_id);
  }

  private mapAccount(row: PlayerAccountRow): PlayerAccountRecord {
    return {
      id: row.id,
      provider: row.provider,
      startggUserId: row.startgg_user_id,
      startggPlayerId: row.startgg_player_id ?? undefined,
      gamerTag: row.gamer_tag,
      displayName: row.display_name,
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      scope: row.scope,
      tokenExpiresAt: row.token_expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapSession(row: PlayerSessionRow): PlayerSessionRecord {
    return {
      id: row.id,
      accountId: row.account_id,
      sessionTokenHash: row.session_token_hash,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at ?? undefined,
    };
  }

  private mapAuthState(row: PlayerAuthStateRow): PlayerAuthStateRecord {
    return {
      id: row.id,
      state: row.state,
      redirectUri: row.redirect_uri,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      usedAt: row.used_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      completedRedirectUrl: row.completed_redirect_url ?? undefined,
    };
  }

  private mapPushToken(row: PlayerPushTokenRow): PlayerPushTokenRecord {
    return {
      token: row.token,
      accountId: row.account_id,
      platform: row.platform,
      deviceLabel: row.device_label ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
    };
  }
}
