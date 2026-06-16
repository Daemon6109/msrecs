import { describe, expect, it } from "bun:test";
import { World } from "../../src";
import { Enemy, Health, Position, Velocity } from "./fixtures";

describe("contract: queries and change tracking", () => {
	it("queries living entities that contain every requested component", () => {
		const world = new World();
		const moving = world.createEntity();
		const standing = world.createEntity();
		const deadMoving = world.createEntity();

		world.set(moving, Position, { x: 1, y: 1 });
		world.set(moving, Velocity, { x: 2, y: 0 });
		world.set(standing, Position, { x: 5, y: 5 });
		world.set(deadMoving, Position, { x: 9, y: 9 });
		world.set(deadMoving, Velocity, { x: 1, y: 1 });
		world.deleteEntity(deadMoving);

		expect(world.query(Position)).toEqual([moving, standing]);
		expect(world.query(Position, Velocity)).toEqual([moving]);
		expect(world.query(Velocity, Position)).toEqual([moving]);
	});

	it("keeps stores dense and duplicate-free through replacement and removal", () => {
		const world = new World();
		const first = world.createEntity();
		const removed = world.createEntity();
		const last = world.createEntity();

		world.set(first, Position, { x: 1, y: 1 });
		world.set(removed, Position, { x: 2, y: 2 });
		world.set(last, Position, { x: 3, y: 3 });
		world.set(last, Position, { x: 4, y: 4 });
		world.remove(removed, Position);

		const result = world.query(Position).sort();

		expect(result).toEqual([first, last].sort());
		expect(new Set(result).size).toBe(result.length);
		expect(world.get(last, Position)).toEqual({ x: 4, y: 4 });
	});

	it("supports reusable query objects that reflect later structural changes", () => {
		const world = new World();
		const query = world.queryObject([Position, Velocity]);
		const entity = world.createEntity();

		expect(query.count()).toBe(0);
		expect(query.first()).toBeUndefined();

		world.set(entity, Position, { x: 1, y: 2 });
		world.set(entity, Velocity, { x: 3, y: 4 });

		expect(query.count()).toBe(1);
		expect(query.first()).toBe(entity);

		query.each((_entity, position, velocity) => {
			position.x += velocity.x;
			position.y += velocity.y;
		});

		expect(world.get(entity, Position)).toEqual({ x: 4, y: 6 });
	});

	it("tracks adds changes removes with the tick they first occurred on", () => {
		const world = new World();
		const entity = world.createEntity();

		world.advanceTick();
		world.set(entity, Health, { current: 10, max: 100 });
		world.set(entity, Health, { current: 15, max: 100 });
		world.advanceTick();
		world.update(entity, Health, (health) => ({
			...health,
			current: 20,
		}));
		world.advanceTick();
		world.remove(entity, Health);

		expect(world.added(Health)).toEqual([entity]);
		expect(world.addedChanges(Health)).toEqual([{ entity, tick: 1 }]);
		expect(world.changedChanges(Health)).toEqual([{ entity, tick: 1 }]);
		expect(world.removedChanges(Health)).toEqual([{ entity, tick: 3 }]);

		world.clearChanges();

		expect(world.added(Health)).toEqual([]);
		expect(world.changed(Health)).toEqual([]);
		expect(world.removed(Health)).toEqual([]);
	});

	it("does not pretend direct object mutation is automatic change detection", () => {
		const world = new World();
		const entity = world.createEntity();

		world.set(entity, Position, { x: 1, y: 1 });
		world.clearChanges();

		const position = world.get(entity, Position);
		expect(position).toBeDefined();

		if (position !== undefined) {
			position.x = 99;
		}

		expect(world.get(entity, Position)).toEqual({ x: 99, y: 1 });
		expect(world.changed(Position)).toEqual([]);
	});

	it("notifies observers and supports unsubscribe", () => {
		const world = new World();
		const entity = world.createEntity();
		const calls: string[] = [];

		const stopAdd = world.onAdd(Health, (addedEntity, health) => {
			calls.push(`add:${addedEntity}:${health.current}`);
		});
		const stopChange = world.onChange(Health, (changedEntity, health) => {
			calls.push(`change:${changedEntity}:${health.current}`);
		});
		const stopRemove = world.onRemove(Health, (removedEntity) => {
			calls.push(`remove:${removedEntity}`);
		});

		world.set(entity, Health, { current: 10, max: 100 });
		world.set(entity, Health, { current: 20, max: 100 });
		world.remove(entity, Health);

		stopAdd();
		stopChange();
		stopRemove();

		world.set(entity, Health, { current: 30, max: 100 });
		world.set(entity, Health, { current: 40, max: 100 });
		world.remove(entity, Health);

		expect(calls).toEqual([
			`add:${entity}:10`,
			`change:${entity}:20`,
			`remove:${entity}`,
		]);
	});

	it("includes tags in ordinary component queries", () => {
		const world = new World();
		const enemy = world.createEntity();
		const neutral = world.createEntity();

		world.set(enemy, Position, { x: 1, y: 1 });
		world.addTag(enemy, Enemy);
		world.set(neutral, Position, { x: 2, y: 2 });

		expect(world.query(Position, Enemy)).toEqual([enemy]);
	});
});

