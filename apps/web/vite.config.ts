import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	// Un seul .env à la racine du monorepo.
	envDir: "../..",
	plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
	resolve: {
		alias: { "@": new URL("./src", import.meta.url).pathname },
	},
	server: {
		// Même origine que l'API en dev (comme en prod) : cookies de session sans CORS.
		proxy: { "/api": "http://localhost:3000" },
	},
});
