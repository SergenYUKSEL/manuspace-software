import { describe, expect, test } from "bun:test";
import {
	insertSceneBreak,
	toggleLinePrefix,
	toggleWrap,
} from "../src/components/editor/formatting";

describe("commandes de mise en forme", () => {
	test("gras : entoure puis retire", () => {
		const on = toggleWrap("un mot ici", 3, 6, "**");
		expect(on).toEqual({ text: "un **mot** ici", start: 5, end: 8 });
		expect(toggleWrap(on.text, on.start, on.end, "**")).toEqual({
			text: "un mot ici",
			start: 3,
			end: 6,
		});
	});

	test("titre : ajoute, remplace un autre préfixe, retire", () => {
		const heading = toggleLinePrefix("L'éveil\nsuite", 2, 2, "# ");
		expect(heading.text).toBe("# L'éveil\nsuite");
		expect(toggleLinePrefix("> citation", 0, 0, "# ").text).toBe("# citation");
		expect(toggleLinePrefix(heading.text, 3, 3, "# ").text).toBe("L'éveil\nsuite");
	});

	test("changement de scène sur sa propre ligne", () => {
		expect(insertSceneBreak("Fin de scène.", 13)).toEqual({
			text: "Fin de scène.\n\n***\n\n",
			start: 20,
			end: 20,
		});
	});
});
