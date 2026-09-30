import { describe, expect, test } from "bun:test";
import { schema } from "@manuspace/db";
import type { ManuscriptNode, ProjectRole } from "@manuspace/shared";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { loggedInUser, request } from "./helpers";

async function createManuscript(cookie: string, title = "Renaissance de Médusa") {
	const { res, json } = await request("POST", "/manuscripts", { cookie, body: { title } });
	expect(res.status).toBe(201);
	return json as { id: string; title: string; role: ProjectRole };
}

async function getNodes(cookie: string, manuscriptId: string): Promise<ManuscriptNode[]> {
	return (await request("GET", `/manuscripts/${manuscriptId}/nodes`, { cookie })).json;
}

const byName = (nodes: ManuscriptNode[], name: string) => {
	const node = nodes.find((n) => n.name === name);
	if (!node) throw new Error(`Nœud ${name} introuvable`);
	return node;
};

/** Propriétaire + manuscrit + un invité avec le rôle donné. */
async function sharedManuscript(role: Exclude<ProjectRole, "OWNER">) {
	const owner = await loggedInUser();
	const guest = await loggedInUser();
	const manuscript = await createManuscript(owner.cookie);
	await request("POST", `/manuscripts/${manuscript.id}/members`, {
		cookie: owner.cookie,
		body: { email: guest.user.email, role },
	});
	return { owner, guest, manuscript };
}

describe("bibliothèque", () => {
	test("création : propriétaire, structure de départ, dernier éditeur renseigné", async () => {
		const { user, cookie } = await loggedInUser();
		const manuscript = await createManuscript(cookie);
		expect(manuscript).toMatchObject({
			title: "Renaissance de Médusa",
			role: "OWNER",
			wordCount: 0,
		});

		const nodes = await getNodes(cookie, manuscript.id);
		const roots = nodes.filter((n) => n.parentId === null).map((n) => n.name);
		expect(roots).toEqual(["Manuscrit", "Personnages", "Univers", "Recherches"]);

		const chapter = byName(nodes, "Chapitre 1");
		expect(chapter).toMatchObject({ type: "text", parentId: byName(nodes, "Manuscrit").id });
		expect(chapter.updatedBy).toEqual({ id: user.id, displayName: user.displayName });
	});

	test("liste : manuscrits possédés et partagés avec le bon rôle, pas ceux des autres", async () => {
		const { owner, guest, manuscript } = await sharedManuscript("EDITOR");
		const own = await createManuscript(guest.cookie, "Le mien");
		await createManuscript((await loggedInUser()).cookie, "Celui d'un autre");

		const { json } = await request("GET", "/manuscripts", { cookie: guest.cookie });
		const summary = json.map((m: { id: string; role: string }) => [m.id, m.role]);
		expect(summary).toHaveLength(2);
		expect(summary).toContainEqual([manuscript.id, "EDITOR"]);
		expect(summary).toContainEqual([own.id, "OWNER"]);
		expect(json.find((m: { id: string }) => m.id === manuscript.id).owner.id).toBe(owner.user.id);
	});

	test("total de mots : somme des documents", async () => {
		const { cookie } = await loggedInUser();
		const manuscript = await createManuscript(cookie);
		const chapter = byName(await getNodes(cookie, manuscript.id), "Chapitre 1");
		await db.update(schema.nodes).set({ wordCount: 1234 }).where(eq(schema.nodes.id, chapter.id));

		const { json } = await request("GET", `/manuscripts/${manuscript.id}`, { cookie });
		expect(json.wordCount).toBe(1234);
	});

	test("sans accès : 404 (existence non révélée), id invalide : 404", async () => {
		const owner = await loggedInUser();
		const stranger = await loggedInUser();
		const manuscript = await createManuscript(owner.cookie);

		for (const path of [`/manuscripts/${manuscript.id}`, `/manuscripts/${manuscript.id}/nodes`]) {
			expect((await request("GET", path, { cookie: stranger.cookie })).res.status).toBe(404);
		}
		expect(
			(await request("GET", "/manuscripts/pas-un-uuid", { cookie: owner.cookie })).res.status,
		).toBe(404);
	});

	test("renommage et suppression réservés au propriétaire ; suppression en cascade", async () => {
		const { owner, guest, manuscript } = await sharedManuscript("EDITOR");
		const path = `/manuscripts/${manuscript.id}`;

		expect(
			(await request("PATCH", path, { cookie: guest.cookie, body: { title: "X" } })).res.status,
		).toBe(403);
		expect((await request("DELETE", path, { cookie: guest.cookie })).res.status).toBe(403);

		const renamed = await request("PATCH", path, {
			cookie: owner.cookie,
			body: { title: "Médusa" },
		});
		expect(renamed.json.title).toBe("Médusa");

		expect((await request("DELETE", path, { cookie: owner.cookie })).res.status).toBe(200);
		const left = await db.query.nodes.findMany({
			where: eq(schema.nodes.manuscriptId, manuscript.id),
		});
		expect(left).toHaveLength(0);
	});
});

describe("arborescence", () => {
	test("EDITOR : crée un dossier puis un document dedans", async () => {
		const { guest, manuscript } = await sharedManuscript("EDITOR");
		const base = `/manuscripts/${manuscript.id}/nodes`;

		const part = await request("POST", base, {
			cookie: guest.cookie,
			body: { parentId: null, type: "folder", name: "Partie II" },
		});
		expect(part.res.status).toBe(201);
		expect(part.json.position).toBe(4);

		const chapter = await request("POST", base, {
			cookie: guest.cookie,
			body: { parentId: part.json.id, type: "text", name: "Chapitre 3" },
		});
		expect(chapter.json).toMatchObject({ parentId: part.json.id, type: "text", wordCount: 0 });
		expect(chapter.json.updatedBy.id).toBe(guest.user.id);
	});

	test("VIEWER et COMMENTER : lecture seule", async () => {
		for (const role of ["VIEWER", "COMMENTER"] as const) {
			const { guest, manuscript } = await sharedManuscript(role);
			const nodes = await getNodes(guest.cookie, manuscript.id);
			expect(nodes.length).toBeGreaterThan(0);

			const created = await request("POST", `/manuscripts/${manuscript.id}/nodes`, {
				cookie: guest.cookie,
				body: { parentId: null, type: "folder", name: "Interdit" },
			});
			expect(created.res.status).toBe(403);
		}
	});

	test("parent invalide : document, autre manuscrit ou type fichier refusés", async () => {
		const { cookie } = await loggedInUser();
		const manuscript = await createManuscript(cookie);
		const other = await createManuscript(cookie, "Autre");
		const chapter = byName(await getNodes(cookie, manuscript.id), "Chapitre 1");
		const otherFolder = byName(await getNodes(cookie, other.id), "Univers");
		const base = `/manuscripts/${manuscript.id}/nodes`;

		const inText = await request("POST", base, {
			cookie,
			body: { parentId: chapter.id, type: "text", name: "Sous-chapitre" },
		});
		const inOther = await request("POST", base, {
			cookie,
			body: { parentId: otherFolder.id, type: "text", name: "Intrus" },
		});
		const file = await request("POST", base, {
			cookie,
			body: { parentId: null, type: "file", name: "carte.png" },
		});
		expect([inText.res.status, inOther.res.status, file.res.status]).toEqual([400, 400, 400]);
	});

	test("renommage : met à jour le nom et le dernier éditeur", async () => {
		const { guest, manuscript } = await sharedManuscript("EDITOR");
		const chapter = byName(await getNodes(guest.cookie, manuscript.id), "Chapitre 1");

		const { json } = await request("PATCH", `/manuscripts/${manuscript.id}/nodes/${chapter.id}`, {
			cookie: guest.cookie,
			body: { name: "Chapitre 1 — L'éveil" },
		});
		expect(json.name).toBe("Chapitre 1 — L'éveil");
		expect(json.updatedBy.id).toBe(guest.user.id);
		expect(new Date(json.updatedAt).getTime()).toBeGreaterThan(
			new Date(chapter.updatedAt).getTime(),
		);
	});

	test("déplacement : dans un dossier ou à la racine ; jamais dans lui-même", async () => {
		const { cookie } = await loggedInUser();
		const manuscript = await createManuscript(cookie);
		const nodes = await getNodes(cookie, manuscript.id);
		const [manuscrit, univers, chapter] = ["Manuscrit", "Univers", "Chapitre 1"].map((n) =>
			byName(nodes, n),
		) as [ManuscriptNode, ManuscriptNode, ManuscriptNode];
		const move = (id: string, parentId: string | null) =>
			request("PATCH", `/manuscripts/${manuscript.id}/nodes/${id}`, { cookie, body: { parentId } });

		expect((await move(chapter.id, univers.id)).json.parentId).toBe(univers.id);
		expect((await move(chapter.id, null)).json.parentId).toBeNull();

		expect((await move(univers.id, univers.id)).res.status).toBe(400);
		await move(univers.id, manuscrit.id);
		expect((await move(manuscrit.id, univers.id)).res.status).toBe(400);
	});

	test("suppression d'un dossier : tout son contenu disparaît, plus de ticket collab", async () => {
		const { cookie } = await loggedInUser();
		const manuscript = await createManuscript(cookie);
		const nodes = await getNodes(cookie, manuscript.id);
		const folder = byName(nodes, "Manuscrit");
		const chapter = byName(nodes, "Chapitre 1");

		const deleted = await request("DELETE", `/manuscripts/${manuscript.id}/nodes/${folder.id}`, {
			cookie,
		});
		expect(deleted.res.status).toBe(200);

		const names = (await getNodes(cookie, manuscript.id)).map((n) => n.name);
		expect(names).not.toContain("Manuscrit");
		expect(names).not.toContain("Chapitre 1");
		const ticket = await request("POST", `/documents/${chapter.id}/collab-ticket`, { cookie });
		expect(ticket.res.status).toBe(404);
	});

	test("élément d'un autre manuscrit : 404", async () => {
		const { cookie } = await loggedInUser();
		const manuscript = await createManuscript(cookie);
		const other = await createManuscript(cookie, "Autre");
		const foreign = byName(await getNodes(cookie, other.id), "Univers");

		const { res } = await request("PATCH", `/manuscripts/${manuscript.id}/nodes/${foreign.id}`, {
			cookie,
			body: { name: "Piraté" },
		});
		expect(res.status).toBe(404);
	});
});

describe("collaborateurs", () => {
	test("invitation : membre listé avec son rôle, accès immédiat", async () => {
		const { owner, guest, manuscript } = await sharedManuscript("VIEWER");
		const { json } = await request("GET", `/manuscripts/${manuscript.id}/members`, {
			cookie: guest.cookie,
		});
		expect(json).toEqual([
			{
				userId: owner.user.id,
				email: owner.user.email,
				displayName: owner.user.displayName,
				role: "OWNER",
			},
			{
				userId: guest.user.id,
				email: guest.user.email,
				displayName: guest.user.displayName,
				role: "VIEWER",
			},
		]);
	});

	test("invitation refusée : email inconnu 404, doublon 409, soi-même 409, non-propriétaire 403", async () => {
		const { owner, guest, manuscript } = await sharedManuscript("EDITOR");
		const invite = (cookie: string, email: string) =>
			request("POST", `/manuscripts/${manuscript.id}/members`, {
				cookie,
				body: { email, role: "VIEWER" },
			});

		expect((await invite(owner.cookie, "inconnu@test.local")).res.status).toBe(404);
		expect((await invite(owner.cookie, guest.user.email)).res.status).toBe(409);
		expect((await invite(owner.cookie, owner.user.email)).res.status).toBe(409);
		const third = await loggedInUser();
		expect((await invite(guest.cookie, third.user.email)).res.status).toBe(403);
	});

	test("changement de rôle : un VIEWER promu EDITOR peut modifier", async () => {
		const { owner, guest, manuscript } = await sharedManuscript("VIEWER");
		await request("PATCH", `/manuscripts/${manuscript.id}/members/${guest.user.id}`, {
			cookie: owner.cookie,
			body: { role: "EDITOR" },
		});
		const created = await request("POST", `/manuscripts/${manuscript.id}/nodes`, {
			cookie: guest.cookie,
			body: { parentId: null, type: "folder", name: "Notes" },
		});
		expect(created.res.status).toBe(201);
	});

	test("retrait : par le propriétaire ou départ volontaire, pas par un autre membre", async () => {
		const { owner, guest, manuscript } = await sharedManuscript("EDITOR");
		const other = await loggedInUser();
		await request("POST", `/manuscripts/${manuscript.id}/members`, {
			cookie: owner.cookie,
			body: { email: other.user.email, role: "VIEWER" },
		});
		const remove = (cookie: string, userId: string) =>
			request("DELETE", `/manuscripts/${manuscript.id}/members/${userId}`, { cookie });

		expect((await remove(guest.cookie, other.user.id)).res.status).toBe(403);
		expect((await remove(guest.cookie, guest.user.id)).res.status).toBe(200);
		expect((await remove(owner.cookie, other.user.id)).res.status).toBe(200);
		expect(
			(await request("GET", `/manuscripts/${manuscript.id}`, { cookie: other.cookie })).res.status,
		).toBe(404);
	});
});

describe("couleurs", () => {
	const patch = (cookie: string, manuscriptId: string, nodeId: string, body: unknown) =>
		request("PATCH", `/manuscripts/${manuscriptId}/nodes/${nodeId}`, { cookie, body });

	test("EDITOR : couleur posée puis effacée, visible par un lecteur", async () => {
		const { owner, guest, manuscript } = await sharedManuscript("EDITOR");
		const folder = byName(await getNodes(guest.cookie, manuscript.id), "Univers");

		const colored = await patch(guest.cookie, manuscript.id, folder.id, { color: "purple" });
		expect(colored.res.status).toBe(200);
		expect(colored.json.color).toBe("purple");
		expect(byName(await getNodes(owner.cookie, manuscript.id), "Univers").color).toBe("purple");

		const cleared = await patch(guest.cookie, manuscript.id, folder.id, { color: null });
		expect(cleared.json.color).toBeNull();
	});

	test("valeur hors palette : 400 ; lecteur : 403", async () => {
		const { owner, guest, manuscript } = await sharedManuscript("VIEWER");
		const chapter = byName(await getNodes(owner.cookie, manuscript.id), "Chapitre 1");
		expect(
			(await patch(owner.cookie, manuscript.id, chapter.id, { color: "pink" })).res.status,
		).toBe(400);
		expect(
			(await patch(guest.cookie, manuscript.id, chapter.id, { color: "red" })).res.status,
		).toBe(403);
	});

	test("couleur seule : date et dernier éditeur inchangés ; avec un renommage : mis à jour", async () => {
		const { guest, manuscript } = await sharedManuscript("EDITOR");
		const chapter = byName(await getNodes(guest.cookie, manuscript.id), "Chapitre 1");

		const colored = await patch(guest.cookie, manuscript.id, chapter.id, { color: "red" });
		expect(colored.json.updatedAt).toBe(chapter.updatedAt);
		expect(colored.json.updatedBy?.id).toBe(chapter.updatedBy?.id);

		const renamed = await patch(guest.cookie, manuscript.id, chapter.id, {
			color: "green",
			name: "Prologue",
		});
		expect(renamed.json).toMatchObject({ color: "green", name: "Prologue" });
		expect(renamed.json.updatedBy.id).toBe(guest.user.id);
	});

	test("couleur conservée après corbeille puis restauration", async () => {
		const { cookie } = await loggedInUser();
		const manuscript = await createManuscript(cookie);
		const folder = byName(await getNodes(cookie, manuscript.id), "Personnages");
		await patch(cookie, manuscript.id, folder.id, { color: "orange" });

		await request("DELETE", `/manuscripts/${manuscript.id}/nodes/${folder.id}`, { cookie });
		const restored = await request(
			"POST",
			`/manuscripts/${manuscript.id}/trash/${folder.id}/restore`,
			{ cookie },
		);
		expect(restored.res.status).toBe(200);
		expect(byName(await getNodes(cookie, manuscript.id), "Personnages").color).toBe("orange");
	});
});
