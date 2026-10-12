-- A room has exactly one owner: the only person who can delete it, replace the
-- moderator link, or take moderator rights away from someone.
alter table sessions add column owner boolean not null default false;

-- Rooms that existed before this rule: their earliest moderator becomes the owner.
update sessions s
set owner = true
where s.id = (
  select m.id from sessions m
  where m.room_id = s.room_id and m.moderator
  order by m.created_at, m.id
  limit 1
);

create unique index sessions_one_owner on sessions (room_id) where owner;
