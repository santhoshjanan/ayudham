-- Run once, as the owner role, after the first migrate run:
--   psql -v ON_ERROR_STOP=1 -v app=pokerji_app -f postgres-after-first-migrate.sql "$MIGRATE_DATABASE_URL"
-- The app only reads the record of applied migrations. Without this it could alter it.
revoke insert, update, delete on schema_migrations from :"app";
