import { describe, expect, it } from "bun:test";
import { World } from "../src";
import { Health, Position } from "./fixtures";

describe("entities and components", () => {
	it("creates unique living entities", () => {
		const world = new World();
		const first = world.createEntity();
		const second = world.createEntity();

		expect(first).toBe(1);
		expect(second).toBe(2);
		expect(world.isAlive(first)).toBe(true);
		expect(world.isAlive(999)).toBe(false);
	});

	it("deletes entities and updates generations", () => {
		const world = new World();
		const entity = world.createEntity();

		expect(world.getEntityRecord(entity)).toEqual({
			alive: true,
			generation: 0,
		});

		world.deleteEntity(entity);
		world.deleteEntity(entity);

		expect(world.isAlive(entity)).toBe(false);
		expect(world.getEntityRecord(entity)).toEqual({
			alive: false,
			generation: 1,
		});
	});

	it("supports generation-safe entity handles", () => {
		const world = new World();
		const handle = world.createEntityHandle();

		expect(world.isHandleAlive(handle)).toBe(true);
		expect(world.resolveEntity(handle)).toBe(handle.id);

		world.deleteEntityHandle(handle);

		expect(world.isHandleAlive(handle)).toBe(false);
		expect(world.resolveEntity(handle)).toBeUndefined();
	});

	it("sets gets updates replaces and removes components", () => {
		const world = new World();
		const entity = world.createEntity();

		world.addComponent(entity, Position, { x: 1, y: 2 });
		world.set(entity, Health, { current: 50, max: 100 });

		expect(world.getComponent(entity, Position)).toEqual({ x: 1, y: 2 });
		expect(world.has(entity, Health)).toBe(true);

		const updated = world.update(entity, Health, (health) => ({
			...health,
			current: health.current + 25,
		}));

		expect(updated).toEqual({ current: 75, max: 100 });

		world.set(entity, Position, { x: 9, y: 9 });
		expect(world.query(Position)).toEqual([entity]);

		world.remove(entity, Position);
		expect(world.get(entity, Position)).toBeUndefined();
		expect(world.hasComponent(entity, Position)).toBe(false);
	});

	it("throws for invalid component writes", () => {
		const world = new World();
		const entity = world.createEntity();

		expect(() => world.update(entity, Health, (health) => health)).toThrow();

		world.deleteEntity(entity);

		expect(() => {
			world.set(entity, Position, { x: 1, y: 2 });
		}).toThrow();
	});

	it("removes components when deleting an entity", () => {
		const world = new World();
		const entity = world.createEntity();

		world.set(entity, Position, { x: 1, y: 2 });
		world.deleteEntity(entity);

		expect(world.get(entity, Position)).toBeUndefined();
		expect(world.query(Position)).toEqual([]);
	});
});
