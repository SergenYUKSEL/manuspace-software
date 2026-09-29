import { Room } from "./room";

/** Documents ouverts. Le chargement est partagé si deux personnes ouvrent en même temps. */
const rooms = new Map<string, Promise<Room>>();

export function getRoom(documentId: string) {
	let room = rooms.get(documentId);
	if (!room) {
		room = Room.load(documentId);
		rooms.set(documentId, room);
		room.catch(() => rooms.delete(documentId));
	}
	return room;
}

/** Plus personne sur le document : on enregistre puis on libère la mémoire. */
export async function releaseIfEmpty(room: Room) {
	if (!room.isEmpty) return;
	await room.save();
	if (room.isEmpty && (await rooms.get(room.documentId)) === room) rooms.delete(room.documentId);
}

/** Arrêt du serveur : enregistre tous les documents ouverts. */
export async function saveAll() {
	await Promise.all([...rooms.values()].map(async (room) => (await room).save()));
}
