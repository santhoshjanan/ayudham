-- The owner is always a moderator. The application keeps it so; this makes it certain.
alter table sessions add constraint sessions_owner_is_moderator check (not owner or moderator);
