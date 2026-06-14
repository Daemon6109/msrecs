import { describe, expect, it } from "bun:test";
import { World } from "../src";
import { Boss, Enemy, Health, Position, Velocity } from "./fixtures";

describe("queries archetypes and changes", () => {
	it("queries living entities with all requested components", () => {
		const world = new World();
		const tower = world.createEntity();
		const enemy = world.createEntity();
		const deadTower = world.createEntity();

		world.set(tower, Position, { x: 0, y: 0 });
		world.set(tower, Health, { current: 100, max: 100 });
		world.set(enemy, Position, { x: 10, y: 5 });
		world.set(deadTower, Position, { x: 2, y: 2 });
		world.set(deadTower, Health, { current: 1, max: 100 });
		world.deleteEntity(deadTower);

		expect(world.query()).toEqual([tower, enemy]);
		expect(world.query(Position)).toEqual([tower, enemy]);
		expect(world.query(Position, Health)).toEqual([tower]);
	});

	it("keeps sparse stores valid after removals", () => {
		const world = new World();
		const first = world.createEntity();
		const removed = world.createEntity();
		const last = world.createEntity();

		world.set(first, Position, { x: 1, y: 1 });
		world.set(removed, Position, { x: 2, y: 2 });
		world.set(last, Position, { x: 3, y: 3 });
		world.remove(removed, Position);

		expect(world.query(Position).sort()).toEqual([first, last].sort());
		expect(world.get(last, Position)).toEqual({ x: 3, y: 3 });
	});

	it("caches query results and invalidates on membership changes", () => {
		const world = new World();
		const first = world.createEntity();
		const second = world.createEntity();

		world.set(first, Position, { x: 1, y: 1 });

		const cached = world.queryCached(Position);
		cached.push(999);

		expect(world.queryCached(Position)).toEqual([first]);

		world.set(second, Position, { x: 2, y: 2 });
		expect(world.queryCached(Position).sort()).toEqual([first, second].sort());

		world.remove(first, Position);
		expect(world.queryCached(Position)).toEqual([second]);
	});

	it("supports reusable query objects", () => {
		const world = new World();
		const entity = world.createEntity();
		const query = world.queryObject([Position, Velocity]);

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

	it("tracks archetypes and tags", () => {
		const world = new World();
		const entity = world.createEntity();

		world.set(entity, Velocity, { x: 0, y: 1 });
		world.set(entity, Position, { x: 4, y: 8 });
		world.addTag(entity, Enemy);

		expect(world.getArchetype(entity)).toEqual([
			"Enemy",
			"Position",
			"Velocity",
		]);
		expect(world.hasTag(entity, Enemy)).toBe(true);
		expect(world.hasTag(entity, Boss)).toBe(false);

		world.removeTag(entity, Enemy);
		expect(world.hasTag(entity, Enemy)).toBe(false);
	});

	it("tracks ticked changes and notifies observers", () => {
		const world = new World();
		const entity = world.createEntity();
		const calls: string[] = [];

		world.onAdd(Health, (addedEntity, health) => {
			calls.push(`add:${addedEntity}:${health.current}`);
		});
		world.onChange(Health, (changedEntity, health) => {
			calls.push(`change:${changedEntity}:${health.current}`);
		});
		world.onRemove(Health, (removedEntity) => {
			calls.push(`remove:${removedEntity}`);
		});

		world.advanceTick();
		world.set(entity, Health, { current: 10, max: 100 });
		world.advanceTick();
		world.set(entity, Health, { current: 20, max: 100 });
		world.advanceTick();
		world.remove(entity, Health);

		expect(world.added(Health)).toEqual([entity]);
		expect(world.addedChanges(Health)).toEqual([{ entity, tick: 1 }]);
		expect(world.changedChanges(Health)).toEqual([{ entity, tick: 2 }]);
		expect(world.removedChanges(Health)).toEqual([{ entity, tick: 3 }]);
		expect(calls).toEqual([
			`add:${entity}:10`,
			`change:${entity}:20`,
			`remove:${entity}`,
		]);

		world.clearChanges();
		expect(world.added(Health)).toEqual([]);
	});
});
