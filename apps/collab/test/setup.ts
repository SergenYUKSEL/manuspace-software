/** Base `manuspace_test_collab` migrée et secrets de test. */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const adminUrl =
	process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://manuspace:manuspace@localhost:5434/manuspace";
const testUrl = new URL(adminUrl);
// Une base par paquet : les suites de tests tournent en parallèle (bun run test).
testUrl.pathname = "/manuspace_test_collab";

Object.assign(process.env, {
	DATABASE_URL: testUrl.toString(),
	COLLAB_TICKET_SECRET: "test-secret-test-secret-test-secret-test",
	PORT: "0",
});

const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
const [exists] = await admin`select 1 from pg_database where datname = ${"manuspace_test_collab"}`;
// Création tolérante : une autre exécution peut la créer au même instant.
if (!exists) await admin.unsafe("create database manuspace_test_collab").catch(() => {});
await admin.end();

const client = postgres(testUrl.toString(), { max: 1, onnotice: () => {} });
await migrate(drizzle(client), {
	migrationsFolder: new URL("../../../packages/db/migrations", import.meta.url).pathname,
});
await client.end();
