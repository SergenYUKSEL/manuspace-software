import { describe, expect, test } from "bun:test";
import { schema } from "@manuspace/db";
import type { DocumentVersion, ManuscriptNode } from "@manuspace/shared";
import { db } from "../src/db";
import { loggedInUser, request } from "./helpers";

const minutes = (n: number) => n * 60 * 1000;

/** Chapitre avec deux sessions d'écriture séparées de 30 minutes, par deux auteurs. */
async function setup() {
	const owner = await loggedInUser();
	const coauthor = await loggedInUser();
	const { json: manuscript } = await request("POST", "/manuscripts", {
		cookie: owner.cookie,
		body: { title: "Médusa" },
	});
	const base = `/manuscripts/${manuscript.id}`;
	const nodes: ManuscriptNode[] = (await request("GET", `${base}/nodes`, { cookie: owner.cookie }))
		.json;
	const chapter = nodes.find((n) => n.name === "Chapitre 1") as ManuscriptNode;
	const t0 = Date.now() - minutes(60);
	const journal: [number, string, (number | string)[], number][] = [
		// révision, auteur, opération, minutes après t0
		[1, owner.user.id, ["Méduse dort."], 0],
		[2, owner.user.id, [11, " Longtemps", 1], 2],
		[3, coauthor.user.id, [22, "\nFin."], 3],
		// 30 minutes plus tard : nouvelle session
		[4, coauthor.user.id, [7, "s'éveille", -4, 16], 33],
	];
	await db.insert(schema.documentOperations).values(
		journal.map(([revision, userId, operation, at]) => ({
			nodeId: chapter.id,
			revision,
			clientOpId: `op-${revision}-${crypto.randomUUID()}`,
			operation,
			userId,
			createdAt: new Date(t0 + minutes(at)),
		})),
	);
	const cleanup = () => request("DELETE", base, { cookie: owner.cookie });
	return { owner, coauthor, base, chapter, nodes, cleanup };
}

describe("historique des versions", () => {
	test("sessions d'écriture : regroupées par pause de plus de 10 minutes, plus récente d'abord", async () => {
		const t = await setup();
		const { res, json } = await request("GET", `${t.base}/nodes/${t.chapter.id}/versions`, {
			cookie: t.owner.cookie,
		});
		expect(res.status).toBe(200);
		const versions = json as DocumentVersion[];
		expect(versions.map((v) => [v.revision, v.operationCount])).toEqual([
			[4, 1],
			[3, 3],
		]);
		expect(versions[0]?.authors.map((a) => a.id)).toEqual([t.coauthor.user.id]);
		expect(versions[1]?.authors.map((a) => a.id).sort()).toEqual(
			[t.owner.user.id, t.coauthor.user.id].sort(),
		);
		expect(
			Date.parse(versions[1]?.endedAt as string) - Date.parse(versions[1]?.startedAt as string),
		).toBe(minutes(3));
		await t.cleanup();
	});

	test("texte d'une version : rejoué exactement depuis le journal", async () => {
		const t = await setup();
		const at = async (revision: number) =>
			(
				await request("GET", `${t.base}/nodes/${t.chapter.id}/versions/${revision}`, {
					cookie: t.owner.cookie,
				})
			).json?.text;
		expect(await at(0)).toBe("");
		expect(await at(1)).toBe("Méduse dort.");
		expect(await at(3)).toBe("Méduse dort Longtemps.\nFin.");
		expect(await at(4)).toBe("Méduse s'éveille Longtemps.\nFin.");
		await t.cleanup();
	});

	test("révision inconnue ou non numérique : 404 / 400", async () => {
		const t = await setup();
		const missing = await request("GET", `${t.base}/nodes/${t.chapter.id}/versions/99`, {
			cookie: t.owner.cookie,
		});
		const invalid = await request("GET", `${t.base}/nodes/${t.chapter.id}/versions/abc`, {
			cookie: t.owner.cookie,
		});
		expect([missing.res.status, invalid.res.status]).toEqual([404, 400]);
		await t.cleanup();
	});

	test("dossier (pas un document) ou personne sans accès : 404", async () => {
		const t = await setup();
		const folder = t.nodes.find((n) => n.type === "folder") as ManuscriptNode;
		const onFolder = await request("GET", `${t.base}/nodes/${folder.id}/versions`, {
			cookie: t.owner.cookie,
		});
		const stranger = await loggedInUser();
		const hidden = await request("GET", `${t.base}/nodes/${t.chapter.id}/versions`, {
			cookie: stranger.cookie,
		});
		expect([onFolder.res.status, hidden.res.status]).toEqual([404, 404]);
		await t.cleanup();
	});

	test("bêta-lecteur : consulte l'historique", async () => {
		const t = await setup();
		const reader = await loggedInUser();
		await request("POST", `${t.base}/members`, {
			cookie: t.owner.cookie,
			body: { email: reader.user.email, role: "VIEWER" },
		});
		const { res } = await request("GET", `${t.base}/nodes/${t.chapter.id}/versions`, {
			cookie: reader.cookie,
		});
		expect(res.status).toBe(200);
		await t.cleanup();
	});
});
