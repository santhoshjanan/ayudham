-- Two roles. The owner applies migrations and is used only by the one-shot migrate run.
-- The app role reads and writes rows and cannot change the schema.
-- Run as a Postgres superuser, choosing the names and two different passwords:
--   psql -v ON_ERROR_STOP=1 -v db=pokerji -v owner=pokerji_owner -v app=pokerji_app \
--        -v owner_password='...' -v app_password='...' -f postgres-roles.sql
create role :"owner" login password :'owner_password';
create role :"app" login password :'app_password';
create database :"db" owner :"owner";
revoke all on database :"db" from public;
grant connect on database :"db" to :"app";
\connect :"db"
revoke all on schema public from public;
-- Before Postgres 15 the public schema belongs to the superuser, not the database owner.
grant all on schema public to :"owner";
grant usage on schema public to :"app";
alter default privileges for role :"owner" in schema public
  grant select, insert, update, delete on tables to :"app";
alter default privileges for role :"owner" in schema public
  grant usage, select on sequences to :"app";
