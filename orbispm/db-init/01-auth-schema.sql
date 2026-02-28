-- Create auth schema for GoTrue
CREATE SCHEMA IF NOT EXISTS auth;
GRANT ALL ON SCHEMA auth TO orbispm;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO orbispm;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES TO orbispm;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON SEQUENCES TO orbispm;

-- GoTrue migrations grant to "postgres" role; create it if it doesn't exist
DO $$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
      CREATE ROLE postgres LOGIN SUPERUSER;
   END IF;
END
$$;
