import { describe, expect, test } from "bun:test";
import { s3Endpoint } from "../src/lib/storage";

describe("endpoint S3", () => {
	test("style chemin (RustFS local) : endpoint inchangé", () => {
		expect(s3Endpoint("http://localhost:9000", "manuspace", false)).toBe("http://localhost:9000");
	});

	test("style virtual-hosted (bucket Railway) : bucket dans l'hôte", () => {
		expect(s3Endpoint("https://t3.storageapi.dev", "manuspace-files-x1", true)).toBe(
			"https://manuspace-files-x1.t3.storageapi.dev",
		);
	});
});
