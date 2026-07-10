import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://porkauto:porkauto@localhost:5432/porkauto";

const client = postgres(databaseUrl, { max: 10 });

export const db = drizzle(client, { schema });
