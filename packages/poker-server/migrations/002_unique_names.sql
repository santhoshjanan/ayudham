-- A name is unique within a room, ignoring case, so nobody can pose as someone
-- else even when several people join at the same instant.
-- Duplicates can only exist in data from before release; the later ones go.
delete from sessions later
using sessions earlier
where later.room_id = earlier.room_id
  and lower(later.name) = lower(earlier.name)
  and (later.created_at, later.id) > (earlier.created_at, earlier.id);

create unique index sessions_room_name on sessions (room_id, lower(name));
