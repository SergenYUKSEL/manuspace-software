import { describe, expect, test } from "bun:test";
import { readPreference, resolveTheme } from "../src/lib/theme";

describe("thème", () => {
	test("auto suit le système ; clair et sombre l'emportent", () => {
		expect(resolveTheme("auto", true)).toBe("dark");
		expect(resolveTheme("auto", false)).toBe("light");
		expect(resolveTheme("light", true)).toBe("light");
		expect(resolveTheme("dark", false)).toBe("dark");
	});

	test("préférence lue, auto par défaut ou si la valeur est inconnue", () => {
		expect(readPreference({ getItem: () => "dark" })).toBe("dark");
		expect(readPreference({ getItem: () => null })).toBe("auto");
		expect(readPreference({ getItem: () => "violet" })).toBe("auto");
	});

	test("stockage inaccessible (navigation privée) : auto, sans exception", () => {
		const storage = {
			getItem: () => {
				throw new Error("SecurityError");
			},
		};
		expect(readPreference(storage)).toBe("auto");
	});

	test("accès à localStorage qui lève (données de site bloquées) : auto, sans exception", () => {
		const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			get() {
				throw new Error("SecurityError: access denied");
			},
		});
		try {
			expect(readPreference()).toBe("auto");
		} finally {
			if (original) Object.defineProperty(globalThis, "localStorage", original);
			else delete (globalThis as { localStorage?: Storage }).localStorage;
		}
	});
});
