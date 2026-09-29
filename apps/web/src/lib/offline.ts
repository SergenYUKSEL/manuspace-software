/**
 * Copie locale des documents (IndexedDB, sans bibliothèque) : texte, révision et opérations
 * non confirmées. Les frappes survivent ainsi à une coupure réseau et à un rechargement.
 */
import type { Component } from "@manuspace/shared";

export const OFFLINE_DB_PREFIX = "manuspace:";
const DB_NAME = `${OFFLINE_DB_PREFIX}offline`;
const STORE = "documents";

export type OfflineDocument = {
	revision: number;
	text: string;
	outstanding: { id: string; operation: Component[] } | null;
	buffer: Component[] | null;
};

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
	const db = await open();
	try {
		return await new Promise<T>((resolve, reject) => {
			const request = action(db.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}

export async function readOfflineDocument(id: string): Promise<OfflineDocument | null> {
	try {
		return (await run("readonly", (store) => store.get(id))) ?? null;
	} catch {
		return null;
	}
}

export async function writeOfflineDocument(id: string, value: OfflineDocument) {
	try {
		await run("readwrite", (store) => store.put(value, id));
	} catch {
		// Stockage indisponible (navigation privée, quota) : on continue sans copie locale.
	}
}

/**
 * Supprime les copies locales (à la déconnexion) : sur un ordinateur partagé,
 * le texte des manuscrits ne doit pas rester dans le navigateur.
 */
export async function clearOfflineDocuments() {
	try {
		const databases = await indexedDB.databases();
		await Promise.all(
			databases
				.filter((db) => db.name?.startsWith(OFFLINE_DB_PREFIX))
				.map(
					(db) =>
						new Promise<void>((resolve) => {
							const request = indexedDB.deleteDatabase(db.name as string);
							request.onsuccess = request.onerror = request.onblocked = () => resolve();
						}),
				),
		);
	} catch {
		// indexedDB.databases() absent (ancien navigateur) : rien à nettoyer de façon fiable.
	}
}
