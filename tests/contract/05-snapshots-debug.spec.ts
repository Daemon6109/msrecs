import { describe, expect, it } from "bun:test";
import { World } from "../../src";
import {
	Enemy,
	GameClock,
	Health,
	Position,
	Targeting,
	Velocity,
} from "./fixtures";

describe("contract: snapshots and debug inspection", () => {
	it("restores tick entities components resources and relations", () => {
		const world = new World({ debug: true });
		const tower = world.createEntity();
		const enemy = world.createEntity();

		world.advanceTick();
		world.set(tower, Position, { x: 5, y: 9 });
		world.set(tower, Velocity, { x: 1, y: 1 });
		world.set(enemy, Health, { current: 30, max: 50 });
		world.addTag(enemy, Enemy);
		world.setResource(GameClock, { elapsed: 12, fixedStep: 0.25 });
		world.setRelation(tower, Targeting, enemy, { priority: 7 });

		const snapshot = world.snapshot();

		world.set(tower, Position, { x: 99, y: 99 });
		world.removeResource(GameClock);
		world.removeRelation(tower, Targeting, enemy);
		world.deleteEntity(enemy);

		world.restore(snapshot);

		expect(world.isDebugEnabled()).toBe(true);
		expect(world.getTick()).toBe(1);
		expect(world.isAlive(tower)).toBe(true);
		expect(world.isAlive(enemy)).toBe(true);
		expect(world.get(tower, Position)).toEqual({ x: 5, y: 9 });
		expect(world.get(enemy, Health)).toEqual({ current: 30, max: 50 });
		expect(world.hasTag(enemy, Enemy)).toBe(true);
		expect(world.getResource(GameClock)).toEqual({
			elapsed: 12,
			fixedStep: 0.25,
		});
		expect(world.getRelation(tower, Targeting, enemy)).toEqual({
			priority: 7,
		});
	});

	it("snapshot values are isolated from later mutable component edits", () => {
		const world = new World();
		const entity = world.createEntity();

		world.set(entity, Position, { x: 1, y: 2 });

		const snapshot = world.snapshot();
		const position = world.get(entity, Position);

		if (position !== undefined) {
			position.x = 500;
		}

		world.restore(snapshot);

		expect(world.get(entity, Position)).toEqual({ x: 1, y: 2 });
	});

	it("restores deleted entity generations and invalidates stale handles", () => {
		const world = new World();
		const handle = world.createEntityHandle();
		const snapshot = world.snapshot();

		world.deleteEntityHandle(handle);

		expect(world.isHandleAlive(handle)).toBe(false);

		world.restore(snapshot);

		expect(world.isHandleAlive(handle)).toBe(true);
		world.deleteEntityHandle(handle);
		expect(world.isHandleAlive(handle)).toBe(false);
	});

	it("inspect reports useful counts without exposing mutable internals", () => {
		const world = new World({ debug: false });
		const first = world.createEntity();
		const second = world.createEntity();

		world.set(first, Position, { x: 1, y: 1 });
		world.set(first, Velocity, { x: 0, y: 1 });
		world.set(second, Health, { current: 100, max: 100 });
		world.setResource(GameClock, { elapsed: 1, fixedStep: 1 / 60 });
		world.setRelation(first, Targeting, second, { priority: 1 });

		const info = world.inspect();

		expect(world.isDebugEnabled()).toBe(false);
		expect(info.entities).toBe(2);
		expect(info.aliveEntities).toBe(2);
		expect(info.components.map((component) => component.id).sort()).toEqual([
			"contract/Health",
			"contract/Position",
			"contract/Velocity",
		]);
		expect(info.resources).toEqual(["contract/GameClock"]);
		expect(info.relations).toEqual([{ id: "contract/Targeting", edges: 1 }]);

		const archetypeKeys = info.archetypes.map((archetype) => archetype.key);
		expect(archetypeKeys).toContain("contract/Position|contract/Velocity");
		expect(archetypeKeys).toContain("contract/Health");
	});
});

