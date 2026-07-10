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

export type DeviceConfig = {
  theme?: string;
  units?: "metric" | "imperial";
  homeAddress?: string;
  mapStyleId?: string;
};

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    pairingCode: text("pairing_code").notNull().unique(),
    pairedUserId: uuid("paired_user_id").references(() => users.id),
    deviceSecretHash: text("device_secret_hash"),
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
