import { describe, expect, it } from "bun:test";
import { World } from "../src/index";

describe("World test", () => {
	it("should create world", () => {
		const newWorld = new World();
		expect(newWorld).toBeDefined();
	});
});
