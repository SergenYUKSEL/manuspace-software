/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** URL WebSocket du serveur collab (ws:// en dev, wss:// en production). */
	readonly VITE_COLLAB_URL: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
