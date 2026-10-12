create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  deck jsonb not null,
  timer_seconds integer,
  music text,
  passcode_hash text,
  recovery_hash text not null,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index rooms_last_active_at on rooms (last_active_at);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  token_hash text not null unique,
  name text not null,
  role text not null check (role in ('voter', 'spectator')),
  moderator boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index sessions_room_id on sessions (room_id);

create table rounds (
  id uuid primary key,
  room_id uuid not null references rooms (id) on delete cascade,
  title text not null,
  revealed_at timestamptz not null default now()
);

create index rounds_room_id_revealed_at on rounds (room_id, revealed_at desc);

-- voter_name is a copy, so history survives the session being removed.
-- Clearing it is how a participant removes their name from history.
create table votes (
  round_id uuid not null references rounds (id) on delete cascade,
  position integer not null,
  session_id uuid references sessions (id) on delete set null,
  voter_name text,
  card text not null,
  primary key (round_id, position)
);

create index votes_session_id on votes (session_id);
