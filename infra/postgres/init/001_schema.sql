create table if not exists tournaments (
  id text primary key,
  owner_id text not null,
  title text not null,
  game_title text not null,
  description text not null,
  platform text not null,
  status text not null,
  starts_at timestamptz not null,
  max_participants integer not null,
  is_public boolean not null default true,
  settings jsonb not null,
  import_source jsonb null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists tournament_participants (
  id text primary key,
  tournament_id text not null references tournaments(id) on delete cascade,
  user_id text null,
  display_name text not null,
  seed integer null,
  checked_in boolean not null default false,
  status text not null,
  external_ref jsonb null,
  created_at timestamptz not null
);

create index if not exists idx_tournament_participants_tournament_id
  on tournament_participants (tournament_id);

create table if not exists matches (
  id text primary key,
  tournament_id text not null references tournaments(id) on delete cascade,
  bracket_stage text not null default 'WINNERS',
  round_number integer not null,
  match_number integer not null,
  status text not null,
  best_of integer not null,
  advancers_required integer not null default 1,
  game_results jsonb null,
  character_selections jsonb null,
  game_character_selections jsonb null,
  advancing_participant_ids jsonb null,
  winner_participant_id text null,
  external_ref jsonb null,
  call_data jsonb null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists idx_matches_tournament_id
  on matches (tournament_id, round_number, match_number);

create table if not exists match_participants (
  id text primary key,
  match_id text not null references matches(id) on delete cascade,
  participant_id text not null,
  display_name text not null,
  slot integer not null,
  score integer not null default 0
);

create index if not exists idx_match_participants_match_id
  on match_participants (match_id);

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
);

create table if not exists player_sessions (
  id text primary key,
  account_id text not null references player_accounts(id) on delete cascade,
  session_token_hash text not null unique,
  created_at timestamptz not null,
  last_seen_at timestamptz not null,
  revoked_at timestamptz null
);

create index if not exists idx_player_sessions_account_id
  on player_sessions (account_id);

create table if not exists player_auth_states (
  id text primary key,
  state text not null unique,
  redirect_uri text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz null
);
