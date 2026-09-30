import { useEffect, useState, useSyncExternalStore } from "react";
import { api, call } from "@/lib/api";
import { CollabConnection, type ConnectionSnapshot } from "./collab-connection";

const EMPTY: ConnectionSnapshot = {
	status: "connecting",
	loaded: false,
	readOnly: false,
	unconfirmed: false,
	sessionId: null,
	peers: [],
	error: null,
	chat: [],
	chatError: null,
};

/** Connexion collaborative d'un document, recréée à chaque changement de document. */
export function useCollabDocument(documentId: string) {
	const [connection, setConnection] = useState<CollabConnection | null>(null);

	useEffect(() => {
		const instance = new CollabConnection(documentId, import.meta.env.VITE_COLLAB_URL, async () => {
			// Ticket frais (60 s) demandé à l'API à chaque (re)connexion.
			const { token } = await call(
				api.documents[":id"]["collab-ticket"].$post({ param: { id: documentId } }),
			);
			return token;
		});
		setConnection(instance);
		void instance.start();
		return () => {
			instance.destroy();
			setConnection(null);
		};
	}, [documentId]);

	const snapshot = useSyncExternalStore(
		connection?.subscribe ?? noopSubscribe,
		connection?.getSnapshot ?? (() => EMPTY),
	);
	return { connection, snapshot };
}

const noopSubscribe = () => () => {};
