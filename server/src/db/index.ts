import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "../config.js";
import * as schema from "./schema.js";

export const client = postgres(config.databaseUrl, {
  onnotice: () => {},
});

export const db = drizzle(client, { schema });

export * as schema from "./schema.js";

/** Ping la base — utilisé par /api/health. */
export async function dbHealthy(): Promise<boolean> {
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  }
}
