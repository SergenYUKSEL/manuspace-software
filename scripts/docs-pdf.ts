/**
 * Génère docs/choix-techniques.pdf depuis le Markdown : couverture, sommaire cliquable,
 * schémas Mermaid rendus en vectoriel, numéros de page.
 *
 * Usage : bun run docs:pdf
 * Navigateur : `bunx playwright install chromium`, ou E2E_CHROMIUM=<exécutable Chromium>.
 * (Exécuté avec Node : Playwright s'appuie sur des modules HTTP de Node mal émulés par Bun.)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url);
const source = readFileSync(new URL("docs/choix-techniques.md", root), "utf8");
const output = fileURLToPath(new URL("docs/choix-techniques.pdf", root));
const mermaidScript = fileURLToPath(new URL("node_modules/mermaid/dist/mermaid.min.js", root));

/** Ancre identique à celle de GitHub : le sommaire du Markdown fonctionne aussi dans le PDF. */
function slug(text: string) {
	return text
		.toLowerCase()
		.replace(/<[^>]+>/g, "")
		.replace(/[^\p{L}\p{N}\s-]/gu, "")
		.replace(/\s/g, "-");
}

const escapeHtml = (text: string) =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const marked = new Marked({
	gfm: true,
	renderer: {
		heading({ tokens, depth }) {
			const html = this.parser.parseInline(tokens);
			return `<h${depth} id="${slug(html)}">${html}</h${depth}>\n`;
		},
		code({ text, lang }) {
			if (lang === "mermaid")
				return `<div class="diagram"><pre class="mermaid">${escapeHtml(text)}</pre></div>`;
			return `<pre><code>${escapeHtml(text)}</code></pre>`;
		},
	},
});

// Le titre et l'accroche du Markdown (avant le premier « --- ») deviennent la couverture.
const body = source.slice(source.indexOf("\n---\n") + "\n---\n".length);
const content = await marked.parse(body);
const today = new Intl.DateTimeFormat("fr", { dateStyle: "long" }).format(new Date());

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Manuspace — Dossier des choix techniques</title>
<style>
	@page { size: A4; margin: 20mm 18mm 22mm; }
	@page :first { margin: 0; }
	:root { --ink: #1c1917; --muted: #57534e; --line: #e7e5e4; --accent: #b45309; --soft: #fafaf9; }
	* { box-sizing: border-box; }
	body { margin: 0; color: var(--ink); font: 10.5pt/1.55 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; }
	h1, h2, h3, .cover h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 600; line-height: 1.25; }
	h2 { font-size: 19pt; margin: 0 0 10pt; padding-bottom: 6pt; border-bottom: 2px solid var(--accent); break-before: page; }
	h3 { font-size: 13pt; margin: 16pt 0 6pt; break-after: avoid; }
	h2 + p, h3 + p { margin-top: 0; }
	p, ul, ol { margin: 0 0 8pt; }
	li { margin: 2pt 0; }
	a { color: var(--accent); text-decoration: none; }
	strong { font-weight: 650; }
	code { font: 9pt/1.4 "SF Mono", Menlo, Consolas, monospace; background: #f5f5f4; padding: 0.5pt 3pt; border-radius: 3pt; }
	pre { background: var(--soft); border: 1px solid var(--line); border-radius: 5pt; padding: 8pt 10pt; overflow: hidden; break-inside: avoid; white-space: pre-wrap; }
	pre code { background: none; padding: 0; font-size: 8.5pt; }
	blockquote { margin: 8pt 0; padding: 6pt 12pt; border-left: 3px solid var(--accent); background: #fffbeb; color: #44403c; break-inside: avoid; }
	blockquote p:last-child { margin-bottom: 0; }
	table { width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 9pt; break-inside: auto; }
	thead { display: table-header-group; }
	tr { break-inside: avoid; }
	th { text-align: left; background: #f5f5f4; font-weight: 650; }
	th, td { border: 1px solid var(--line); padding: 4pt 6pt; vertical-align: top; }
	hr { display: none; }
	.diagram { break-inside: avoid; margin: 8pt 0 12pt; padding: 8pt; border: 1px solid var(--line); border-radius: 5pt; text-align: center; }
	.diagram pre.mermaid { background: none; border: 0; padding: 0; margin: 0; }
	/* Schémas à pleine largeur (texte lisible), bornés en hauteur pour tenir sur une page. */
	.diagram svg { width: 100% !important; max-width: 100% !important; height: auto; max-height: 200mm; }

	/* Couverture */
	.cover { height: 297mm; padding: 38mm 24mm 24mm; display: flex; flex-direction: column; background: #1c1917; color: #fafaf9; break-after: page; }
	.cover .kicker { font-size: 10pt; letter-spacing: 0.18em; text-transform: uppercase; color: #fbbf24; margin: 0 0 18mm; }
	.cover h1 { font-size: 44pt; margin: 0 0 6mm; color: #fafaf9; }
	.cover .subtitle { font-family: Georgia, serif; font-size: 18pt; color: #e7e5e4; margin: 0 0 12mm; max-width: 140mm; }
	.cover .pitch { font-size: 11pt; color: #d6d3d1; max-width: 140mm; }
	.cover .meta { margin-top: auto; font-size: 10pt; color: #a8a29e; border-top: 1px solid #44403c; padding-top: 6mm; }
	.cover .meta p { margin: 0 0 2pt; }
	.cover .mark { font-family: Georgia, serif; font-size: 90pt; color: #b45309; line-height: 1; margin-top: 16mm; }

	/* Sommaire (première section) : pas de saut de page avant */
	#sommaire { break-before: avoid; }
</style>
</head>
<body>
	<section class="cover">
		<p class="kicker">Projet Spé 4 · Application collaborative</p>
		<h1>Manuspace</h1>
		<p class="subtitle">Dossier des choix techniques et organisationnels</p>
		<p class="pitch">Espace cloud pour auteurs : organiser ses romans, écrire ses chapitres à plusieurs en temps réel, stocker ses ressources et discuter à voix haute pendant une séance de correction.</p>
		<p class="mark">⁂</p>
		<div class="meta">
			<p>Application : https://manuspace.up.railway.app</p>
			<p>Version du ${today}</p>
		</div>
	</section>
	<main>${content}</main>
</body>
</html>`;

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM });
try {
	const page = await browser.newPage();
	page.on("pageerror", (error) => console.error("Erreur dans la page :", error.message));
	await page.setContent(html, { waitUntil: "load" });
	await page.addScriptTag({ path: mermaidScript });
	const errors = await page.evaluate(async () => {
		// biome-ignore lint/suspicious/noExplicitAny: bibliothèque chargée par balise script
		const mermaid = (window as any).mermaid;
		mermaid.initialize({
			startOnLoad: false,
			theme: "neutral",
			fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif",
			flowchart: { htmlLabels: true },
			// Pas de répétition des participants en bas : diagrammes plus compacts, texte plus grand.
			sequence: { mirrorActors: false },
		});
		try {
			await mermaid.run({ querySelector: "pre.mermaid" });
			return [];
		} catch (error) {
			return [String(error)];
		}
	});
	if (errors.length) throw new Error(`Schémas Mermaid invalides : ${errors.join(", ")}`);
	const expected = (source.match(/```mermaid/g) ?? []).length;
	const diagrams = await page.locator(".diagram svg").count();
	if (diagrams !== expected) {
		throw new Error(`${diagrams} schéma(s) rendu(s) sur ${expected} : PDF non généré`);
	}

	const full = await page.pdf({
		format: "A4",
		printBackground: true,
		preferCSSPageSize: true,
		displayHeaderFooter: true,
		headerTemplate: "<span></span>",
		footerTemplate: `<div style="width:100%;font-size:8pt;color:#78716c;padding:0 18mm;display:flex;justify-content:space-between;font-family:-apple-system,sans-serif">
			<span>Manuspace — Dossier des choix techniques</span>
			<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
		outline: true,
		tagged: true,
	});

	// La couverture, imprimée seule et sans pied de page, remplace la première page :
	// la numérotation du reste du document (« 2 / 25 ») est conservée.
	await page.evaluate(() => {
		document.querySelector("main")?.remove();
	});
	const cover = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
	const document = await PDFDocument.load(full);
	const [coverPage] = await document.copyPages(await PDFDocument.load(cover), [0]);
	document.removePage(0);
	document.insertPage(0, coverPage);
	document.setTitle("Manuspace — Dossier des choix techniques et organisationnels");
	document.setLanguage("fr");
	writeFileSync(output, await document.save());
	console.log(`✓ ${output} (${document.getPageCount()} pages, ${diagrams} schémas rendus)`);
} finally {
	await browser.close();
}
