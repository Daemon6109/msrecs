import { describe, expect, it } from "bun:test";
import { World } from "../../src";

import { Health, Position, Velocity } from "./fixtures";

describe("contract: entities and components", () => {
	it("creates monotonically increasing living entities", () => {
		const world = new World();
		const first = world.createEntity();
		const second = world.createEntity();
		const third = world.createEntity();

		expect(first).toBe(1);
		expect(second).toBe(2);
		expect(third).toBe(3);
		expect(world.isAlive(first)).toBe(true);
		expect(world.isAlive(999)).toBe(false);
		expect(world.query()).toEqual([first, second, third]);
	});

	it("supports generation-safe handles and idempotent deletion", () => {
		const world = new World();
		const handle = world.createEntityHandle();
		const entity = handle.id;

		expect(world.resolveEntity(handle)).toBe(entity);
		expect(world.isHandleAlive(handle)).toBe(true);
		expect(world.getEntityRecord(entity)).toEqual({
			alive: true,
			generation: 0,
		});

		world.deleteEntity(entity);
		world.deleteEntity(entity);

		expect(world.isAlive(entity)).toBe(false);
		expect(world.isHandleAlive(handle)).toBe(false);
		expect(world.resolveEntity(handle)).toBeUndefined();
		expect(world.getEntityRecord(entity)).toEqual({
			alive: false,
			generation: 1,
		});
	});

	it("sets gets updates replaces removes and checks components", () => {
		const world = new World();
		const entity = world.createEntity();

		world.set(entity, Position, { x: 1, y: 2 });
		world.set(entity, Health, { current: 50, max: 100 });

		expect(world.get(entity, Position)).toEqual({ x: 1, y: 2 });
		expect(world.has(entity, Position)).toBe(true);
		expect(world.has(entity, Velocity)).toBe(false);

		const updated = world.update(entity, Health, (health) => ({
			...health,
			current: health.current + 25,
		}));

		expect(updated).toEqual({ current: 75, max: 100 });
		expect(world.get(entity, Health)).toEqual({ current: 75, max: 100 });

		world.set(entity, Position, { x: 9, y: 9 });
		expect(world.get(entity, Position)).toEqual({ x: 9, y: 9 });

		world.remove(entity, Position);
		expect(world.get(entity, Position)).toBeUndefined();
		expect(world.has(entity, Position)).toBe(false);
		expect(world.has(entity, Health)).toBe(true);
	});

	// it("supports tags as zero-data boolean components", () => {
	// 	const world = new World();
	// 	const entity = world.createEntity();

	// 	world.addTag(entity, Enemy);

	// 	expect(world.hasTag(entity, Enemy)).toBe(true);
	// 	expect(world.hasTag(entity, Boss)).toBe(false);
	// 	expect(world.query(Enemy)).toEqual([entity]);

	// 	world.removeTag(entity, Enemy);

	// 	expect(world.hasTag(entity, Enemy)).toBe(false);
	// 	expect(world.query(Enemy)).toEqual([]);
	// });

	// it("rejects invalid writes and missing updates", () => {
	// 	const world = new World();
	// 	const entity = world.createEntity();

	// 	expect(() => {
	// 		world.update(entity, Health, (health) => health);
	// 	}).toThrow();

	// 	world.deleteEntity(entity);

	// 	expect(() => {
	// 		world.set(entity, Position, { x: 1, y: 2 });
	// 	}).toThrow();
	// });

	// it("removes every component and tag when deleting an entity", () => {
	// 	const world = new World();
	// 	const entity = world.createEntity();

	// 	world.set(entity, Position, { x: 1, y: 2 });
	// 	world.set(entity, Velocity, { x: 3, y: 4 });
	// 	world.addTag(entity, Enemy);

	// 	world.deleteEntity(entity);

	// 	expect(world.get(entity, Position)).toBeUndefined();
	// 	expect(world.get(entity, Velocity)).toBeUndefined();
	// 	expect(world.hasTag(entity, Enemy)).toBe(false);
	// 	expect(world.query(Position)).toEqual([]);
	// 	expect(world.query(Velocity)).toEqual([]);
	// 	expect(world.query(Enemy)).toEqual([]);
	// });
});
