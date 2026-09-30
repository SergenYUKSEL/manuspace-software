import { describe, expect, test } from "bun:test";
import { NODE_COLORS, nodeColorSchema, updateNodeSchema } from "../src/schemas";

describe("couleur d'un élément", () => {
	test("les 7 couleurs de la palette sont acceptées, le reste refusé", () => {
		for (const color of NODE_COLORS) expect(nodeColorSchema.parse(color)).toBe(color);
		for (const value of ["pink", "#ff0000", "", "RED"]) {
			expect(nodeColorSchema.safeParse(value).success).toBe(false);
		}
	});

	test("modification : la couleur seule suffit, null l'efface", () => {
		expect(updateNodeSchema.parse({ color: "red" })).toEqual({ color: "red" });
		expect(updateNodeSchema.parse({ color: null })).toEqual({ color: null });
		expect(updateNodeSchema.safeParse({}).success).toBe(false);
	});
});
