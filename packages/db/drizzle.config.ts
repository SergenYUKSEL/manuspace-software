import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema.ts",
	out: "./migrations",
	dbCredentials: {
		// biome-ignore lint/style/noNonNullAssertion: requis pour lancer drizzle-kit
		url: process.env.DATABASE_URL!,
	},
});
