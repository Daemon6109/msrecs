import { describe, expect, it } from "bun:test";
import {
	render,
	setupWorld,
	simulateTowerDefense,
} from "../playground/tower-defense";

describe("tower defense playground", () => {
	it("renders the initial tower defense interface", () => {
		const world = setupWorld();
		const frame = render(world);

		expect(frame).toContain("T");
		expect(frame).toContain("B");
		expect(frame).toContain("wave=1/3");
	});

	it("runs a deterministic tower defense simulation", () => {
		const result = simulateTowerDefense();

		expect(result.frames.length).toBeGreaterThan(5);
		expect(result.game.killed).toBeGreaterThan(0);
		expect(result.game.escaped).toBeGreaterThan(0);
		expect(result.game.lives).toBeLessThan(20);
		expect(result.timings.map((timing) => timing.name)).toEqual([
			"spawn-waves",
			"move-enemies",
			"tower-targeting",
			"shot-lifetime",
			"advance-game-time",
		]);
	});
});
