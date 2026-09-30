/**
 * Test de bout en bout de l'appel audio : deux navigateurs (micro simulé par Chromium),
 * l'auteur démarre l'appel, la bêta-lectrice le rejoint, on vérifie qu'un vrai son arrive
 * de chaque côté, puis la coupure du micro et le départ. Crée son propre manuscrit (sauf si
 * E2E_DOC_URL est fourni) et le supprime à la fin.
 *
 * Prérequis : `bun infra:up` + `bun dev`, comptes de dev (admin et bêta-lectrice).
 * Autre environnement : E2E_BASE_URL, E2E_AUTHOR_EMAIL / _PASSWORD, E2E_COAUTHOR_EMAIL / _PASSWORD.
 * Navigateur : `bunx playwright install chromium`, ou E2E_CHROMIUM=<exécutable Chromium>.
 * E2E_KILL_COLLAB=1 : arrête le serveur collab local en plein appel (l'audio doit continuer).
 * E2E_FORCE_RELAY=1 : connexions directes interdites, l'audio doit passer par le serveur TURN.
 * Usage (Node : Playwright s'appuie sur des modules HTTP de Node mal émulés par Bun) :
 *   bun run e2e:call
 */
import { type Browser, chromium, type Page } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const AUTHOR = {
	email: process.env.E2E_AUTHOR_EMAIL ?? "admin@manuspace.local",
	password: process.env.E2E_AUTHOR_PASSWORD ?? "admin-manuspace-2026",
};
const READER = {
	email: process.env.E2E_COAUTHOR_EMAIL ?? "beta@manuspace.local",
	password: process.env.E2E_COAUTHOR_PASSWORD ?? "beta-lectrice-2026",
};

function check(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(`✗ ${message}`);
}

/**
 * E2E_FORCE_RELAY=1 : interdit toute connexion directe entre navigateurs (iceTransportPolicy
 * « relay ») ; l'audio ne peut passer que par le serveur TURN. Les connexions sont gardées pour
 * vérifier ensuite le type de la paire de candidats utilisée.
 */
const FORCE_RELAY = Boolean(process.env.E2E_FORCE_RELAY);

async function login(browser: Browser, user: { email: string; password: string }) {
	const page = await (await browser.newContext()).newPage();
	if (FORCE_RELAY) {
		await page.addInitScript(() => {
			const Native = window.RTCPeerConnection;
			const connections: RTCPeerConnection[] = [];
			(window as unknown as { __connections: RTCPeerConnection[] }).__connections = connections;
			window.RTCPeerConnection = class extends Native {
				constructor(config?: RTCConfiguration) {
					super({ ...config, iceTransportPolicy: "relay" });
					connections.push(this);
				}
			} as typeof RTCPeerConnection;
		});
	}
	await page.goto(`${BASE}/login`);
	await page.getByLabel("Email").fill(user.email);
	await page.getByLabel("Mot de passe").fill(user.password);
	await page.getByRole("button", { name: "Se connecter" }).click();
	await page.waitForURL(`${BASE}/`);
	return page;
}

async function openDocument(page: Page, url: string) {
	await page.goto(url);
	await page
		.getByRole("status")
		.filter({ hasText: /Enregistré|Lecture seule/ })
		.waitFor();
}

/** Appel à l'API depuis la page (cookie de session et en-tête Origin du navigateur). */
function api<T>(page: Page, method: string, path: string, body?: unknown) {
	return page.evaluate(
		async ({ method, path, body }) => {
			const res = await fetch(`/api${path}`, {
				method,
				headers: body ? { "content-type": "application/json" } : {},
				body: body ? JSON.stringify(body) : undefined,
			});
			if (!res.ok) throw new Error(`${method} ${path} : ${res.status}`);
			return res.json();
		},
		{ method, path, body },
	) as Promise<T>;
}

/** Document de test : celui fourni, ou un manuscrit créé pour l'occasion (supprimé ensuite). */
async function prepareDocument(author: Page) {
	if (process.env.E2E_DOC_URL) return { url: process.env.E2E_DOC_URL, cleanup: async () => {} };
	const manuscript = await api<{ id: string }>(author, "POST", "/manuscripts", {
		title: "Test e2e appel",
	});
	await api(author, "POST", `/manuscripts/${manuscript.id}/members`, {
		email: READER.email,
		role: "VIEWER",
	});
	const nodes = await api<{ id: string; name: string }[]>(
		author,
		"GET",
		`/manuscripts/${manuscript.id}/nodes`,
	);
	const chapter = nodes.find((n) => n.name === "Chapitre 1") as { id: string };
	return {
		url: `${BASE}/manuscrits/${manuscript.id}?node=${chapter.id}`,
		cleanup: () => api(author, "DELETE", `/manuscripts/${manuscript.id}`),
	};
}

/** Niveau sonore moyen reçu d'un participant (analyseur Web Audio sur le flux distant). */
function incomingLevel(page: Page) {
	return page.evaluate(async () => {
		const audio = document.querySelector("audio");
		const stream = audio?.srcObject as MediaStream | null;
		if (!stream) return -1;
		const ctx = new AudioContext();
		const analyser = ctx.createAnalyser();
		ctx.createMediaStreamSource(stream).connect(analyser);
		const data = new Uint8Array(analyser.frequencyBinCount);
		let max = 0;
		for (let i = 0; i < 20; i++) {
			await new Promise((r) => setTimeout(r, 50));
			analyser.getByteFrequencyData(data);
			max = Math.max(max, ...data);
		}
		await ctx.close();
		return max;
	});
}

const browser = await chromium.launch({
	// Chromium déjà installé ailleurs (ex. cache Playwright d'une autre version) : E2E_CHROMIUM=<chemin>.
	executablePath: process.env.E2E_CHROMIUM,
	args: [
		"--use-fake-ui-for-media-stream",
		"--use-fake-device-for-media-stream",
		"--autoplay-policy=no-user-gesture-required",
	],
});
let cleanup: (() => Promise<unknown>) | undefined;

async function scenario() {
	const author = await login(browser, AUTHOR);
	const reader = await login(browser, READER);
	const document = await prepareDocument(author);
	cleanup = document.cleanup;
	await openDocument(author, document.url);
	await openDocument(reader, document.url);

	await author.getByRole("button", { name: "Appel", exact: true }).click();
	await author.getByText("En attente de collaborateurs…").waitFor();
	console.log("✓ l'auteur démarre l'appel");

	await reader.getByRole("button", { name: "Rejoindre l'appel (1)" }).click();
	await reader.getByRole("region", { name: "Appel en cours" }).waitFor();
	console.log("✓ la bêta-lectrice voit l'appel et le rejoint");

	await author.locator("audio").waitFor({ state: "attached", timeout: 10_000 });
	await reader.locator("audio").waitFor({ state: "attached", timeout: 10_000 });
	const [heardByAuthor, heardByReader] = await Promise.all([
		incomingLevel(author),
		incomingLevel(reader),
	]);
	check(heardByAuthor > 0, `l'auteur n'entend rien (niveau ${heardByAuthor})`);
	check(heardByReader > 0, `la bêta-lectrice n'entend rien (niveau ${heardByReader})`);
	console.log(`✓ son reçu des deux côtés (niveaux ${heardByAuthor} / ${heardByReader})`);

	if (FORCE_RELAY) {
		// Type des candidats de la paire active : « relay » = le flux passe par le serveur TURN.
		const types = await author.evaluate(async () => {
			const found: string[] = [];
			for (const pc of (window as unknown as { __connections: RTCPeerConnection[] })
				.__connections) {
				const stats = await pc.getStats();
				stats.forEach((report) => {
					if (
						report.type === "candidate-pair" &&
						report.state === "succeeded" &&
						report.nominated
					) {
						const local = stats.get(report.localCandidateId);
						const remote = stats.get(report.remoteCandidateId);
						found.push(
							`${local?.candidateType}/${remote?.candidateType} via ${local?.url ?? local?.relayProtocol ?? "?"}`,
						);
					}
				});
			}
			return found;
		});
		check(
			types.length > 0 && types.every((t) => t.startsWith("relay/")),
			`paire non relayée : ${types.join(", ")}`,
		);
		console.log(`✓ audio relayé par le serveur TURN (${types.join(", ")})`);
	}

	if (process.env.E2E_KILL_COLLAB) {
		// Coupure du serveur collab en plein appel : l'audio (pair à pair) doit continuer.
		const { execSync } = await import("node:child_process");
		execSync("kill -TERM $(lsof -nP -iTCP:3001 -sTCP:LISTEN -t)");
		await author
			.getByRole("status")
			.filter({ hasText: /Hors ligne/ })
			.waitFor();
		await new Promise((r) => setTimeout(r, 2000));
		const [a, b] = await Promise.all([incomingLevel(author), incomingLevel(reader)]);
		check(a > 0 && b > 0, `son coupé avec le serveur (${a} / ${b})`);
		check(
			(await reader.getByRole("region", { name: "Appel en cours" }).locator("li").count()) === 1,
			"participant retiré de l'affichage pendant la coupure",
		);
		console.log(`✓ serveur collab arrêté : l'appel continue (niveaux ${a} / ${b})`);
		// Relance manuelle du serveur (hors du scénario) : la suite a besoin de la signalisation.
		return;
	}

	await author.getByRole("button", { name: "Couper le micro" }).click();
	await reader.getByTitle(/micro coupé/).waitFor();
	console.log("✓ micro coupé visible chez l'autre participant");

	await author.getByRole("button", { name: "Quitter l'appel" }).click();
	await reader.getByText("En attente de collaborateurs…").waitFor();
	check((await reader.locator("audio").count()) === 0, "flux audio non libéré après le départ");
	console.log("✓ départ : la bêta-lectrice reste seule, flux libéré");
}

try {
	await scenario();
} finally {
	await cleanup?.().catch(() => {});
	await browser.close();
}
