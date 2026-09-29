import { describe, expect, test } from "bun:test";
import { schema } from "@manuspace/db";
import type { ManuscriptNode } from "@manuspace/shared";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { loggedInUser, request, upload } from "./helpers";

// Contenus minimaux, reconnaissables à leur signature binaire.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF = new TextEncoder().encode("%PDF-1.7\n% carte de l'île\n%%EOF");
const SVG = new TextEncoder().encode(
	'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

const file = (bytes: Uint8Array, name: string, type = "application/octet-stream") =>
	new File([bytes], name, { type });

const s3 = new Bun.S3Client({
	endpoint: process.env.S3_ENDPOINT,
	bucket: process.env.S3_BUCKET,
	accessKeyId: process.env.S3_ACCESS_KEY_ID,
	secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
	region: process.env.S3_REGION,
});

async function setup() {
	const owner = await loggedInUser();
	const { json: manuscript } = await request("POST", "/manuscripts", {
		cookie: owner.cookie,
		body: { title: "Atlas de Médusa" },
	});
	const nodes: ManuscriptNode[] = (
		await request("GET", `/manuscripts/${manuscript.id}/nodes`, { cookie: owner.cookie })
	).json;
	const folder = nodes.find((n) => n.name === "Recherches") as ManuscriptNode;
	const chapter = nodes.find((n) => n.name === "Chapitre 1") as ManuscriptNode;
	const base = `/manuscripts/${manuscript.id}/files`;
	/** Supprime le manuscrit et donc ses objets S3 (nettoyage du bucket de dev). */
	const cleanup = () =>
		request("DELETE", `/manuscripts/${manuscript.id}`, { cookie: owner.cookie });
	return { owner, manuscript, folder, chapter, base, cleanup };
}

async function storageKeyOf(nodeId: string) {
	const node = await db.query.nodes.findFirst({ where: eq(schema.nodes.id, nodeId) });
	return node?.storageKey as string;
}

describe("fichiers", () => {
	test("import d'une image dans un dossier, puis aperçu et téléchargement", async () => {
		const { owner, folder, base, cleanup } = await setup();
		const { res, json } = await upload("POST", base, owner.cookie, {
			file: file(PNG, "carte.png", "image/png"),
			parentId: folder.id,
		});
		expect(res.status).toBe(201);
		expect(json).toMatchObject({
			type: "file",
			name: "carte.png",
			parentId: folder.id,
			mimeType: "image/png",
			sizeBytes: PNG.length,
		});
		expect(json.updatedBy.id).toBe(owner.user.id);

		const content = await request("GET", `${base}/${json.id}/content`, { cookie: owner.cookie });
		expect(content.res.status).toBe(200);
		expect(new Uint8Array(await content.res.arrayBuffer())).toEqual(PNG);
		expect(content.res.headers.get("content-type")).toBe("image/png");
		expect(content.res.headers.get("x-content-type-options")).toBe("nosniff");
		expect(content.res.headers.get("content-disposition")).toStartWith("inline");
		expect(content.res.headers.get("cache-control")).toContain("private");

		const download = await request("GET", `${base}/${json.id}/content?download`, {
			cookie: owner.cookie,
		});
		expect(download.res.headers.get("content-disposition")).toBe(
			"attachment; filename*=UTF-8''carte.png",
		);
		await cleanup();
	});

	test("le type réel prime : faux PNG, SVG et fichier vide refusés", async () => {
		const { owner, base, cleanup } = await setup();
		const fake = await upload("POST", base, owner.cookie, {
			file: file(new TextEncoder().encode("pas une image"), "piege.png", "image/png"),
		});
		const svg = await upload("POST", base, owner.cookie, {
			file: file(SVG, "logo.svg", "image/svg+xml"),
		});
		const empty = await upload("POST", base, owner.cookie, {
			file: file(new Uint8Array(), "vide.pdf"),
		});
		expect([fake.res.status, svg.res.status, empty.res.status]).toEqual([415, 415, 400]);
		await cleanup();
	});

	test("le type annoncé par le client est ignoré : un PDF nommé .png reste un PDF", async () => {
		const { owner, base, cleanup } = await setup();
		const { json } = await upload("POST", base, owner.cookie, {
			file: file(PDF, "deguise.png", "image/png"),
		});
		expect(json.mimeType).toBe("application/pdf");
		await cleanup();
	});

	test("taille maximale : 413 au-delà de 20 Mo", async () => {
		const { owner, base, cleanup } = await setup();
		const big = new Uint8Array(20 * 1024 * 1024 + 1);
		big.set(PDF);
		const { res, json } = await upload("POST", base, owner.cookie, {
			file: file(big, "enorme.pdf"),
		});
		expect(res.status).toBe(413);
		expect(json.error).toContain("20 Mo");
		await cleanup();
	});

	test("nom nettoyé : pas de chemin ni de caractère de contrôle", async () => {
		const { owner, base, cleanup } = await setup();
		const { json } = await upload("POST", base, owner.cookie, {
			file: file(PDF, "../../etc/pass\u0007wd.pdf"),
		});
		expect(json.name).toBe("passwd.pdf");
		await cleanup();
	});

	test("parent invalide (document texte) : 400", async () => {
		const { owner, chapter, base, cleanup } = await setup();
		const { res } = await upload("POST", base, owner.cookie, {
			file: file(PDF, "notes.pdf"),
			parentId: chapter.id,
		});
		expect(res.status).toBe(400);
		await cleanup();
	});

	test("droits : bêta-lecteur lit mais n'importe pas, inconnu ne voit rien", async () => {
		const { owner, manuscript, base, cleanup } = await setup();
		const reader = await loggedInUser();
		const stranger = await loggedInUser();
		await request("POST", `/manuscripts/${manuscript.id}/members`, {
			cookie: owner.cookie,
			body: { email: reader.user.email, role: "VIEWER" },
		});
		const { json } = await upload("POST", base, owner.cookie, { file: file(PNG, "portrait.png") });

		const refused = await upload("POST", base, reader.cookie, { file: file(PNG, "intrus.png") });
		expect(refused.res.status).toBe(403);
		const replace = await upload("PUT", `${base}/${json.id}`, reader.cookie, {
			file: file(PDF, "x.pdf"),
		});
		expect(replace.res.status).toBe(403);

		const read = await request("GET", `${base}/${json.id}/content`, { cookie: reader.cookie });
		expect(read.res.status).toBe(200);
		const hidden = await request("GET", `${base}/${json.id}/content`, { cookie: stranger.cookie });
		expect(hidden.res.status).toBe(404);
		await cleanup();
	});

	test("remplacement : nouveau contenu et nouveau type, ancien objet supprimé", async () => {
		const { owner, base, cleanup } = await setup();
		const { json: created } = await upload("POST", base, owner.cookie, {
			file: file(PNG, "carte.png"),
		});
		const oldKey = await storageKeyOf(created.id);

		const { res, json } = await upload("PUT", `${base}/${created.id}`, owner.cookie, {
			file: file(PDF, "carte-v2.pdf"),
		});
		expect(res.status).toBe(200);
		expect(json).toMatchObject({
			name: "carte.png",
			mimeType: "application/pdf",
			sizeBytes: PDF.length,
		});

		const content = await request("GET", `${base}/${created.id}/content`, { cookie: owner.cookie });
		expect(new Uint8Array(await content.res.arrayBuffer())).toEqual(PDF);
		expect(await s3.exists(oldKey)).toBe(false);
		expect(await s3.exists(await storageKeyOf(created.id))).toBe(true);
		await cleanup();
	});

	test("remplacer un document texte : 404", async () => {
		const { owner, chapter, base, cleanup } = await setup();
		const { res } = await upload("PUT", `${base}/${chapter.id}`, owner.cookie, {
			file: file(PDF, "x.pdf"),
		});
		expect(res.status).toBe(404);
		await cleanup();
	});

	test("suppression d'un fichier : il n'est plus servi", async () => {
		const { owner, manuscript, base, cleanup } = await setup();
		const { json } = await upload("POST", base, owner.cookie, { file: file(PNG, "brouillon.png") });
		await request("DELETE", `/manuscripts/${manuscript.id}/nodes/${json.id}`, {
			cookie: owner.cookie,
		});
		const { res } = await request("GET", `${base}/${json.id}/content`, { cookie: owner.cookie });
		expect(res.status).toBe(404);
		await cleanup();
	});

	test("suppression du manuscrit : ses objets sont retirés du bucket", async () => {
		const { owner, base, cleanup } = await setup();
		const { json } = await upload("POST", base, owner.cookie, {
			file: file(PNG, "couverture.png"),
		});
		const key = await storageKeyOf(json.id);
		expect(await s3.exists(key)).toBe(true);
		await cleanup();
		expect(await s3.exists(key)).toBe(false);
	});
});
