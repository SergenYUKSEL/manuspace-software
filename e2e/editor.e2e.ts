/**
 * Test de bout en bout de l'éditeur collaboratif (OT maison) avec deux navigateurs :
 * frappe simultanée, convergence, curseur distant, annulation limitée à ses propres
 * modifications, coupure réseau puis reprise. Crée son propre manuscrit et le supprime.
 *
 * Prérequis : `bun infra:up` + `bun dev`, comptes de dev (admin et bêta-lectrice).
 * Autre environnement : E2E_BASE_URL, E2E_AUTHOR_EMAIL / _PASSWORD, E2E_COAUTHOR_EMAIL / _PASSWORD / _NAME.
 * Navigateur : `bunx playwright install chromium`, ou E2E_CHROMIUM=<exécutable Chromium>.
 * E2E_KILL_COLLAB=1 : arrête le serveur collab local, recharge la page (copie IndexedDB)
 * puis relance le serveur.
 * Usage : bun run e2e:editor
 */
import { type Browser, chromium, type Page } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const AUTHOR = {
	email: process.env.E2E_AUTHOR_EMAIL ?? "admin@manuspace.local",
	password: process.env.E2E_AUTHOR_PASSWORD ?? "admin-manuspace-2026",
};
const COAUTHOR = {
	email: process.env.E2E_COAUTHOR_EMAIL ?? "beta@manuspace.local",
	password: process.env.E2E_COAUTHOR_PASSWORD ?? "beta-lectrice-2026",
	name: process.env.E2E_COAUTHOR_NAME ?? "Bêta-lectrice",
};

function check(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(`✗ ${message}`);
}

async function login(browser: Browser, user: { email: string; password: string }) {
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`${BASE}/login`);
	await page.getByLabel("Email").fill(user.email);
	await page.getByLabel("Mot de passe").fill(user.password);
	await page.getByRole("button", { name: "Se connecter" }).click();
	await page.waitForURL(`${BASE}/`);
	return page;
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

const editor = (page: Page) => page.getByRole("textbox", { name: /Texte de/ });

/** Place le curseur au début ou à la fin (raccourcis clavier différents selon le système). */
async function caretAt(page: Page, where: "start" | "end") {
	await editor(page).click();
	await editor(page).evaluate((el, where) => {
		const textarea = el as HTMLTextAreaElement;
		const position = where === "start" ? 0 : textarea.value.length;
		textarea.setSelectionRange(position, position);
	}, where);
}
const status = (page: Page) =>
	page.getByRole("status").filter({ hasText: /Enregistr|Hors ligne|Lecture/ });
const saved = (page: Page) =>
	status(page)
		.filter({ hasText: /^Enregistré$/ })
		.waitFor();

async function openDocument(page: Page, url: string) {
	await page.goto(url);
	await editor(page).waitFor();
	await saved(page);
}

async function sameText(a: Page, b: Page) {
	for (let i = 0; i < 50; i++) {
		const [ta, tb] = await Promise.all([editor(a).inputValue(), editor(b).inputValue()]);
		if (ta === tb) return ta;
		await a.waitForTimeout(100);
	}
	throw new Error("✗ les deux éditeurs ne convergent pas");
}

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM });
let cleanup: (() => Promise<unknown>) | undefined;

async function scenario() {
	const author = await login(browser, AUTHOR);
	const coauthor = await login(browser, COAUTHOR);

	const manuscript = await api<{ id: string }>(author, "POST", "/manuscripts", {
		title: "Test e2e éditeur",
	});
	cleanup = () => api(author, "DELETE", `/manuscripts/${manuscript.id}`);
	await api(author, "POST", `/manuscripts/${manuscript.id}/members`, {
		email: COAUTHOR.email,
		role: "EDITOR",
	});
	const nodes = await api<{ id: string; name: string }[]>(
		author,
		"GET",
		`/manuscripts/${manuscript.id}/nodes`,
	);
	const chapter = nodes.find((n) => n.name === "Chapitre 1") as { id: string };
	const url = `${BASE}/manuscrits/${manuscript.id}?node=${chapter.id}`;

	await openDocument(author, url);
	await openDocument(coauthor, url);
	console.log("✓ les deux autrices ont ouvert le chapitre");

	await editor(author).click();
	await author.keyboard.type("Il était une fois.");
	check(
		(await sameText(author, coauthor)) === "Il était une fois.",
		"texte non reçu par la co-autrice",
	);
	console.log("✓ frappe reçue en direct par l'autre navigateur");

	// Frappe simultanée : l'une écrit à la fin, l'autre au début, caractère par caractère.
	await caretAt(coauthor, "start");
	await caretAt(author, "end");
	await Promise.all([
		author.keyboard.type(" Méduse s'éveilla.", { delay: 25 }),
		coauthor.keyboard.type("Prologue — ", { delay: 25 }),
	]);
	await Promise.all([saved(author), saved(coauthor)]);
	const merged = await sameText(author, coauthor);
	check(
		merged === "Prologue — Il était une fois. Méduse s'éveilla.",
		`fusion incorrecte : « ${merged} »`,
	);
	console.log(`✓ frappe simultanée fusionnée à l'identique : « ${merged} »`);

	// Curseur de la co-autrice visible chez l'autrice.
	await author.locator(".collab-caret", { hasText: COAUTHOR.name }).waitFor();
	console.log("✓ curseur de la co-autrice affiché chez l'autrice");

	// Messagerie de session : message, badge « non lu », réponse.
	await author.getByRole("button", { name: /^Discussion/ }).click();
	await author.getByRole("textbox", { name: "Message" }).fill("On relit la scène du phare ?");
	await author.getByRole("textbox", { name: "Message" }).press("Enter");
	await coauthor.getByRole("button", { name: /Discussion.*non lus : 1/ }).waitFor();
	await coauthor.getByRole("button", { name: /^Discussion/ }).click();
	await coauthor.getByRole("log").getByText("On relit la scène du phare ?").waitFor();
	await coauthor.getByRole("textbox", { name: "Message" }).fill("Oui, après le prologue.");
	await coauthor.getByRole("button", { name: "Envoyer" }).click();
	await author.getByRole("log").getByText("Oui, après le prologue.").waitFor();
	console.log("✓ messagerie : message, badge non lu, réponse reçue");

	// Annuler ne défait que ses propres frappes, jamais celles de l'autre.
	await editor(author).focus();
	await author.keyboard.press("ControlOrMeta+z");
	await saved(author);
	const afterUndo = await sameText(author, coauthor);
	check(afterUndo === "Prologue — Il était une fois.", `annulation incorrecte : « ${afterUndo} »`);
	console.log("✓ annuler retire seulement la dernière phrase de l'autrice");

	// Coupure réseau de l'autrice : elle continue d'écrire, puis tout repart au retour.
	await author.context().setOffline(true);
	await status(author)
		.filter({ hasText: /Hors ligne/ })
		.waitFor();
	await caretAt(author, "end");
	await author.keyboard.type(" Hors ligne, la plume veillait.");
	await status(author).filter({ hasText: "modifications gardées sur cet appareil" }).waitFor();
	await caretAt(coauthor, "start");
	await coauthor.keyboard.type("[Relu] ");
	await author.context().setOffline(false);
	await saved(author);
	const final = await sameText(author, coauthor);
	check(
		final === "[Relu] Prologue — Il était une fois. Hors ligne, la plume veillait.",
		`reprise incorrecte : « ${final} »`,
	);
	console.log(`✓ coupure réseau : frappes gardées puis fusionnées : « ${final} »`);

	if (!process.env.E2E_KILL_COLLAB) return;
	// Serveur collab arrêté : on écrit, on RECHARGE la page (copie IndexedDB), on relance le serveur.
	const { execSync, spawn } = await import("node:child_process");
	execSync("kill -TERM $(lsof -nP -iTCP:3001 -sTCP:LISTEN -t)");
	await status(author)
		.filter({ hasText: /Hors ligne/ })
		.waitFor();
	await caretAt(author, "end");
	await author.keyboard.type(" Le serveur dormait.");
	await author.waitForTimeout(500);
	await author.reload();
	await editor(author).waitFor();
	const reloaded = await editor(author).inputValue();
	check(reloaded.endsWith("Le serveur dormait."), `texte perdu au rechargement : « ${reloaded} »`);
	await status(author).filter({ hasText: "modifications gardées sur cet appareil" }).waitFor();
	console.log("✓ serveur arrêté + rechargement de la page : frappes relues depuis l'appareil");

	spawn("bun", ["--env-file=../../.env", "src/index.ts"], {
		cwd: new URL("../apps/collab", import.meta.url).pathname,
		detached: true,
		stdio: "ignore",
	}).unref();
	await saved(author);
	const recovered = await sameText(author, coauthor);
	check(recovered.endsWith("Le serveur dormait."), `reprise après redémarrage : « ${recovered} »`);
	console.log("✓ serveur relancé : frappes envoyées et reçues par la co-autrice");
}

try {
	await scenario();
} finally {
	await cleanup?.().catch(() => {});
	await browser.close();
}
