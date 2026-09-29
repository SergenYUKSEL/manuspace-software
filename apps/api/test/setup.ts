/**
 * Préchargé avant les tests (bunfig.toml) : configure l'environnement et prépare une base
 * `manuspace_test` dédiée, migrée et vidée. N'importe rien qui lise `src/env.ts`.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const adminUrl =
	process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://manuspace:manuspace@localhost:5434/manuspace";
const testUrl = new URL(adminUrl);
testUrl.pathname = "/manuspace_test";

Object.assign(process.env, {
	NODE_ENV: "test",
	DATABASE_URL: testUrl.toString(),
	TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
});

const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
const [exists] = await admin`select 1 from pg_database where datname = 'manuspace_test'`;
if (!exists) await admin`create database manuspace_test`;
await admin.end();

const client = postgres(testUrl.toString(), { max: 1, onnotice: () => {} });
await migrate(drizzle(client), {
	migrationsFolder: new URL("../../../packages/db/migrations", import.meta.url).pathname,
});
await client`truncate users, manuscripts, sessions cascade`;
await client.end();
