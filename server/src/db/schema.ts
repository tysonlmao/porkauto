import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SavedLocation = {
  id: string;
  label: string;
  address: string;
  lat?: number;
  lng?: number;
};

export type DeviceConfig = {
  /** dark | light | system | daylight */
  theme?: string;
  units?: "metric" | "imperial";
  homeAddress?: string;
  mapStyleId?: string;
  /** User-defined places shown on the host destination picker. */
  savedLocations?: SavedLocation[];
};

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    pairingCode: text("pairing_code").notNull().unique(),
    /** Legacy optional link to a user account (claim no longer requires this). */
    pairedUserId: uuid("paired_user_id").references(() => users.id),
    /** Host display secret (returned once at register). */
    deviceSecretHash: text("device_secret_hash"),
    /** Companion / mobile API key (returned once at claim). */
    ownerTokenHash: text("owner_token_hash"),
    /** Friendly name of the phone/tablet that claimed this display. */
    companionName: text("companion_name"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    /** Set when the host confirms the companion claim. */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    config: jsonb("config").$type<DeviceConfig>().default({}).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("devices_pairing_code_idx").on(table.pairingCode),
    index("devices_paired_user_idx").on(table.pairedUserId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export type IntegrationProvider = "spotify";
export type IntegrationStatus = "linked" | "revoked";

/** Linked third-party services (tokens stay server-side; never in DeviceConfig). */
export const deviceIntegrations = pgTable(
  "device_integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    provider: text("provider").$type<IntegrationProvider>().notNull(),
    status: text("status").$type<IntegrationStatus>().notNull().default("linked"),
    spotifyUserId: text("spotify_user_id"),
    displayName: text("display_name"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("device_integrations_device_idx").on(table.deviceId),
    index("device_integrations_device_provider_idx").on(
      table.deviceId,
      table.provider,
    ),
  ],
);
