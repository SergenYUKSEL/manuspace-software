import { schema } from "@manuspace/db";
import type { ManuscriptNode } from "@manuspace/shared";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db";
import { detectFileType, MAX_FILE_SIZE, sanitizeFileName } from "../lib/file-types";
import { assertFolder, findNode, listNodes, nextPosition } from "../lib/nodes";
import { deleteObjects, objectStream, putObject, storageKey } from "../lib/storage";
import { validate } from "../lib/validator";
import { requireAuth } from "../middleware/auth";
import { type ManuscriptEnv, requireRole } from "../middleware/manuscript";

const { nodes } = schema;

/** Refuse les corps trop gros avant même de les lire (marge pour l'enveloppe multipart). */
const uploadLimit = bodyLimit({
	maxSize: MAX_FILE_SIZE + 64 * 1024,
	onError: () => {
		throw new HTTPException(413, { message: "Fichier trop volumineux (20 Mo maximum)" });
	},
});

const fileField = z.instanceof(File, { message: "Fichier manquant" });
const uploadForm = validate(
	"form",
	z.object({
		file: fileField,
		/** Absent ou vide : racine du manuscrit. */
		parentId: z.union([z.uuid(), z.literal("")]).optional(),
	}),
);
const nodeParam = validate("param", z.object({ id: z.uuid(), nodeId: z.uuid() }));

/** Lit le fichier et vérifie sa taille et son type réel. */
async function readUpload(file: File) {
	if (file.size > MAX_FILE_SIZE) {
		throw new HTTPException(413, { message: "Fichier trop volumineux (20 Mo maximum)" });
	}
	if (file.size === 0) throw new HTTPException(400, { message: "Le fichier est vide" });
	const bytes = new Uint8Array(await file.arrayBuffer());
	const mimeType = detectFileType(bytes);
	if (!mimeType) {
		throw new HTTPException(415, {
			message: "Format non pris en charge : PDF, PNG, JPEG, WebP ou GIF uniquement",
		});
	}
	return { bytes, mimeType };
}

async function findFile(manuscriptId: string, nodeId: string) {
	const node = await findNode(manuscriptId, nodeId);
	if (node.type !== "file" || !node.storageKey) {
		throw new HTTPException(404, { message: "Fichier introuvable" });
	}
	return node;
}

const nodeById = async (manuscriptId: string, nodeId: string) =>
	(await listNodes(manuscriptId)).find((n) => n.id === nodeId) as ManuscriptNode;

export const fileRoutes = new Hono<ManuscriptEnv>()
	.use(requireAuth)
	/** Import d'un fichier (PDF ou image) dans un dossier du manuscrit. */
	.post("/:id/files", requireRole("EDITOR"), uploadLimit, uploadForm, async (c) => {
		const manuscriptId = c.req.param("id");
		const { file, parentId: rawParentId } = c.req.valid("form");
		const parentId = rawParentId || null;
		await assertFolder(manuscriptId, parentId);
		const { bytes, mimeType } = await readUpload(file);

		const nodeId = crypto.randomUUID();
		const key = storageKey(manuscriptId, nodeId);
		// Objet d'abord, ligne ensuite : pas de nœud en base qui pointerait vers un objet absent.
		await putObject(key, bytes, mimeType);
		try {
			await db.insert(nodes).values({
				id: nodeId,
				manuscriptId,
				parentId,
				type: "file",
				name: sanitizeFileName(file.name),
				position: await nextPosition(manuscriptId, parentId),
				storageKey: key,
				mimeType,
				sizeBytes: bytes.length,
				updatedById: c.var.user.id,
			});
		} catch (error) {
			await deleteObjects([key]);
			throw error;
		}
		return c.json(await nodeById(manuscriptId, nodeId), 201);
	})
	/** Remplacement du contenu (nouvelle version d'une carte, d'une couverture…). */
	.put(
		"/:id/files/:nodeId",
		requireRole("EDITOR"),
		nodeParam,
		uploadLimit,
		validate("form", z.object({ file: fileField })),
		async (c) => {
			const { id: manuscriptId, nodeId } = c.req.valid("param");
			const previous = await findFile(manuscriptId, nodeId);
			const { bytes, mimeType } = await readUpload(c.req.valid("form").file);

			const key = storageKey(manuscriptId, nodeId);
			await putObject(key, bytes, mimeType);
			await db
				.update(nodes)
				.set({
					storageKey: key,
					mimeType,
					sizeBytes: bytes.length,
					updatedAt: sql`now()`,
					updatedById: c.var.user.id,
				})
				.where(eq(nodes.id, nodeId));
			await deleteObjects([previous.storageKey]);
			return c.json(await nodeById(manuscriptId, nodeId));
		},
	)
	/** Contenu du fichier, servi par l'API après vérification des droits (aperçu ou téléchargement). */
	.get("/:id/files/:nodeId/content", requireRole("VIEWER"), nodeParam, async (c) => {
		const { id: manuscriptId, nodeId } = c.req.valid("param");
		const node = await findFile(manuscriptId, nodeId);
		const disposition = c.req.query("download") !== undefined ? "attachment" : "inline";
		return new Response(objectStream(node.storageKey as string), {
			headers: {
				// Type détecté à l'import (jamais celui annoncé par le client) + pas de reniflage.
				"Content-Type": node.mimeType ?? "application/octet-stream",
				"Content-Length": String(node.sizeBytes ?? ""),
				"Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(node.name)}`,
				"X-Content-Type-Options": "nosniff",
				// Privé : jamais dans un cache partagé. L'URL change à chaque remplacement (?v=).
				"Cache-Control": "private, max-age=3600",
			},
		});
	});
