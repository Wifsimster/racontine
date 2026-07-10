import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { config } from "../config.js";

/**
 * Applique les migrations Drizzle puis quitte. Lancé au démarrage du conteneur
 * (docker-entrypoint.sh) : le homelab se met à jour au `docker compose pull`.
 */
const migrationClient = postgres(config.databaseUrl, { max: 1 });

try {
  await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
  console.log("Migrations appliquées.");
} catch (err) {
  console.error("Échec des migrations :", err);
  process.exit(1);
} finally {
  await migrationClient.end();
}
