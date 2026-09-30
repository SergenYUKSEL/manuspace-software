import { describe, expect, test } from "bun:test";
import { schema } from "@manuspace/db";
import type { ManuscriptNode, TrashEntry } from "@manuspace/shared";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { purgeExpiredTrash } from "../src/lib/trash";
import { loggedInUser, request, upload } from "./helpers";

/** Manuscrit avec : Manuscrit/Chapitre 1, Recherches/(Notes, carte.png). */
async function setup() {
	const owner = await loggedInUser();
	const coauthor = await loggedInUser();
	const reader = await loggedInUser();
	const { json: manuscript } = await request("POST", "/manuscripts", {
		cookie: owner.cookie,
		body: { title: "Médusa" },
	});
	const base = `/manuscripts/${manuscript.id}`;
	for (const [user, role] of [
		[coauthor, "EDITOR"],
		[reader, "VIEWER"],
	] as const) {
		await request("POST", `${base}/members`, {
			cookie: owner.cookie,
			body: { email: user.user.email, role },
		});
	}
	const nodes = async (): Promise<ManuscriptNode[]> =>
		(await request("GET", `${base}/nodes`, { cookie: owner.cookie })).json;
	const byName = async (name: string) =>
		(await nodes()).find((n) => n.name === name) as ManuscriptNode;
	const recherches = await byName("Recherches");
	await request("POST", `${base}/nodes`, {
		cookie: owner.cookie,
		body: { parentId: recherches.id, type: "text", name: "Notes" },
	});
	const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
	await upload("POST", `${base}/files`, owner.cookie, {
		file: new File([png], "carte.png"),
		parentId: recherches.id,
	});
	const trash = async (cookie = owner.cookie): Promise<TrashEntry[]> =>
		(await request("GET", `${base}/trash`, { cookie })).json;
	const remove = (id: string, cookie = owner.cookie) =>
		request("DELETE", `${base}/nodes/${id}`, { cookie });
	const cleanup = () => request("DELETE", base, { cookie: owner.cookie });
	return { owner, coauthor, reader, base, nodes, byName, trash, remove, cleanup };
}

describe("corbeille", () => {
	test("dossier supprimé : une seule entrée, avec son contenu compté et son auteur", async () => {
		const t = await setup();
		await t.remove((await t.byName("Recherches")).id, t.coauthor.cookie);

		const entries = await t.trash();
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			name: "Recherches",
			type: "folder",
			containedCount: 2,
			deletedBy: { id: t.coauthor.user.id },
			restoreTo: null,
		});
		expect((await t.nodes()).map((n) => n.name)).not.toContain("Notes");
		await t.cleanup();
	});

	test("restauration : le dossier revient avec son contenu, au même endroit", async () => {
		const t = await setup();
		const recherches = await t.byName("Recherches");
		await t.remove(recherches.id);

		const { res, json } = await request("POST", `${t.base}/trash/${recherches.id}/restore`, {
			cookie: t.coauthor.cookie,
		});
		expect(res.status).toBe(200);
		expect(json.restoredCount).toBe(3);
		const names = (await t.nodes()).map((n) => n.name);
		expect(names).toEqual(expect.arrayContaining(["Recherches", "Notes", "carte.png"]));
		expect(await t.trash()).toHaveLength(0);
		await t.cleanup();
	});

	test("élément supprimé avant son dossier : reste séparé, et revient à la racine si le dossier a disparu", async () => {
		const t = await setup();
		const notes = await t.byName("Notes");
		await t.remove(notes.id);
		await t.remove((await t.byName("Recherches")).id);

		const entries = await t.trash();
		expect(entries.map((e) => e.name).sort()).toEqual(["Notes", "Recherches"]);
		const folder = entries.find((e) => e.name === "Recherches") as TrashEntry;
		expect(folder.containedCount).toBe(1); // carte.png, pas Notes (supprimée avant)

		// Restaurer le dossier ne ressuscite pas Notes, supprimée séparément.
		await request("POST", `${t.base}/trash/${folder.id}/restore`, { cookie: t.owner.cookie });
		expect((await t.nodes()).map((n) => n.name)).not.toContain("Notes");

		// Supprimer à nouveau le dossier, puis restaurer Notes : son dossier n'existe plus → racine.
		await t.remove(folder.id);
		const { json } = await request("POST", `${t.base}/trash/${notes.id}/restore`, {
			cookie: t.owner.cookie,
		});
		expect(json.parentId).toBeNull();
		expect((await t.byName("Notes")).parentId).toBeNull();
		await t.cleanup();
	});

	test("emplacement de restauration annoncé quand le dossier d'origine existe", async () => {
		const t = await setup();
		const recherches = await t.byName("Recherches");
		await t.remove((await t.byName("Notes")).id);
		const [entry] = await t.trash();
		expect(entry?.restoreTo).toEqual({ id: recherches.id, name: "Recherches" });
		await t.cleanup();
	});

	test("droits : bêta-lecteur ne restaure pas ; co-auteur ne supprime pas définitivement", async () => {
		const t = await setup();
		const notes = await t.byName("Notes");
		await t.remove(notes.id);

		expect(await t.trash(t.reader.cookie)).toHaveLength(1);
		const readerRestore = await request("POST", `${t.base}/trash/${notes.id}/restore`, {
			cookie: t.reader.cookie,
		});
		const coauthorDestroy = await request("DELETE", `${t.base}/trash/${notes.id}`, {
			cookie: t.coauthor.cookie,
		});
		const coauthorEmpty = await request("DELETE", `${t.base}/trash`, { cookie: t.coauthor.cookie });
		expect([
			readerRestore.res.status,
			coauthorDestroy.res.status,
			coauthorEmpty.res.status,
		]).toEqual([403, 403, 403]);
		await t.cleanup();
	});

	test("suppression définitive : lignes et fichier du bucket effacés", async () => {
		const t = await setup();
		const recherches = await t.byName("Recherches");
		const carte = await t.byName("carte.png");
		const [row] = await db.select().from(schema.nodes).where(eq(schema.nodes.id, carte.id));
		const s3 = new Bun.S3Client({
			endpoint: process.env.S3_ENDPOINT,
			bucket: process.env.S3_BUCKET,
			accessKeyId: process.env.S3_ACCESS_KEY_ID,
			secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
			region: process.env.S3_REGION,
		});
		expect(await s3.exists(row?.storageKey as string)).toBe(true);

		await t.remove(recherches.id);
		const { res } = await request("DELETE", `${t.base}/trash/${recherches.id}`, {
			cookie: t.owner.cookie,
		});
		expect(res.status).toBe(200);
		const left = await db
			.select()
			.from(schema.nodes)
			.where(inArray(schema.nodes.id, [recherches.id, carte.id]));
		expect(left).toHaveLength(0);
		expect(await s3.exists(row?.storageKey as string)).toBe(false);
		expect(await t.trash()).toHaveLength(0);
		await t.cleanup();
	});

	test("vider la corbeille", async () => {
		const t = await setup();
		await t.remove((await t.byName("Notes")).id);
		await t.remove((await t.byName("Personnages")).id);
		const { json } = await request("DELETE", `${t.base}/trash`, { cookie: t.owner.cookie });
		expect(json.deletedCount).toBe(2);
		expect(await t.trash()).toHaveLength(0);
		await t.cleanup();
	});

	test("élément absent de la corbeille : 404", async () => {
		const t = await setup();
		const notes = await t.byName("Notes");
		const { res } = await request("POST", `${t.base}/trash/${notes.id}/restore`, {
			cookie: t.owner.cookie,
		});
		expect(res.status).toBe(404);
		await t.cleanup();
	});

	test("purge automatique : seulement ce qui est dans la corbeille depuis plus de 30 jours", async () => {
		const t = await setup();
		const notes = await t.byName("Notes");
		const univers = await t.byName("Univers");
		await t.remove(notes.id);
		await t.remove(univers.id);
		// Notes a été supprimée il y a 31 jours.
		const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
		await db.update(schema.nodes).set({ deletedAt: old }).where(eq(schema.nodes.id, notes.id));

		expect(await purgeExpiredTrash()).toBeGreaterThanOrEqual(1);
		expect((await t.trash()).map((e) => e.name)).toEqual(["Univers"]);
		await t.cleanup();
	});
});
