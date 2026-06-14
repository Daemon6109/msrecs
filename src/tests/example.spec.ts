import { describe, expect, it } from "@rbxts/jest-globals";

describe("Smoke Test", () => {
	it("should pass", () => {
		expect(true).toBe(true);
	});

	it("should add numbers", () => {
		expect(2 + 2).toBe(4);
	});

	it("should compare strings", () => {
		expect("Anime Reborn II").toBe("Anime Reborn II");
	});
});
