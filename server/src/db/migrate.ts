import { sql } from "drizzle-orm";
import { db } from "./client";

async function migrate() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      pairing_code TEXT NOT NULL UNIQUE,
      paired_user_id UUID REFERENCES users(id),
      device_secret_hash TEXT,
      owner_token_hash TEXT,
      claimed_at TIMESTAMPTZ,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS devices_pairing_code_idx ON devices(pairing_code);
    CREATE INDEX IF NOT EXISTS devices_paired_user_idx ON devices(paired_user_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

    ALTER TABLE devices ADD COLUMN IF NOT EXISTS owner_token_hash TEXT;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS device_integrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'linked',
      spotify_user_id TEXT,
      display_name TEXT,
      access_token TEXT,
      refresh_token TEXT,
      scope TEXT,
      expires_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (device_id, provider)
    );

    CREATE INDEX IF NOT EXISTS device_integrations_device_idx
      ON device_integrations(device_id);
    CREATE INDEX IF NOT EXISTS device_integrations_device_provider_idx
      ON device_integrations(device_id, provider);
  `);

  console.log("Migrations applied.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
