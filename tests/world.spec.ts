import { describe, expect, it } from "bun:test";
import { World } from "../src/index";

describe("World", () => {
	it("creates a world", () => {
		const world = new World();
		expect(world).toBeDefined();
	});

	it("creates entities", () => {
		const world = new World();
		const entity = world.createEntity();

		expect(entity).toBe(1);
	});

	it("creates unique entity ids", () => {
		const world = new World();

		const a = world.createEntity();
		const b = world.createEntity();

		expect(a).not.toBe(b);
		expect(a).toBe(1);
		expect(b).toBe(2);
	});

	it("marks newly created entities as alive", () => {
		const world = new World();

		const entity = world.createEntity();

		expect(world.isAlive(entity)).toBe(true);
	});

	it("returns false for unknown entities", () => {
		const world = new World();

		expect(world.isAlive(999)).toBe(false);
	});
	it("deletes entities", () => {
		const world = new World();

		const entity = world.createEntity();
		world.deleteEntity(entity);

		expect(world.isAlive(entity)).toBe(false);
	});

	it("does nothing when deleting an unknown entity", () => {
		const world = new World();

		expect(() => world.deleteEntity(999)).not.toThrow();
	});

	it("does nothing when deleting an already-deleted entity", () => {
		const world = new World();

		const entity = world.createEntity();
		world.deleteEntity(entity);

		expect(() => world.deleteEntity(entity)).not.toThrow();
		expect(world.isAlive(entity)).toBe(false);
	});

	it("adds and gets a component", () => {
		const world = new World();
		const entity = world.createEntity();

		world.addComponent(entity, "Position", { x: 1, y: 2 });

		expect(world.getComponent(entity, "Position")).toEqual({ x: 1, y: 2 });
	});

	it("checks if an entity has a component", () => {
		const world = new World();
		const entity = world.createEntity();

		world.addComponent(entity, "Health", { value: 100 });
		expect(world.hasComponent(entity, "Health")).toBe(true);
		expect(world.hasComponent(entity, "Position")).toBe(false);
	});

	it("removes a component", () => {
		const world = new World();
		const entity = world.createEntity();

		world.addComponent(entity, "Position", { x: 1, y: 2 });
		world.removeComponent(entity, "Position");

		expect(world.hasComponent(entity, "Position")).toBe(false);
		expect(world.getComponent(entity, "Position")).toBeUndefined();
	});
	it("removes components when deleting an entity", () => {
		const world = new World();
		const entity = world.createEntity();

		world.addComponent(entity, "Position", { x: 1, y: 2 });
		world.deleteEntity(entity);

		expect(world.isAlive(entity)).toBe(false);
		expect(world.hasComponent(entity, "Position")).toBe(false);
		expect(world.getComponent(entity, "Position")).toBeUndefined();
	});

	it("throws when adding a component to a dead entity", () => {
		const world = new World();
		const entity = world.createEntity();
		world.deleteEntity(entity);

		expect(() => {
			world.addComponent(entity, "Position", { x: 1, y: 2 });
		}).toThrow();
	});
});
