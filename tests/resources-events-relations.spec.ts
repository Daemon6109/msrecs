import { describe, expect, it } from "bun:test";
import { World } from "../src";
import {
	EnemyKilled,
	GameTime,
	Health,
	OwnedBy,
	Position,
	Targeting,
	Velocity,
} from "./fixtures";

describe("resources events relations and snapshots", () => {
	it("stores updates and removes resources", () => {
		const world = new World();

		world.setResource(GameTime, { elapsed: 1 });
		world.updateResource(GameTime, (time) => ({ elapsed: time.elapsed + 2 }));

		expect(world.hasResource(GameTime)).toBe(true);
		expect(world.getResource(GameTime)).toEqual({ elapsed: 3 });

		world.removeResource(GameTime);

		expect(world.hasResource(GameTime)).toBe(false);
		expect(world.getResource(GameTime)).toBeUndefined();
	});

	it("throws when updating a missing resource", () => {
		const world = new World();

		expect(() => {
			world.updateResource(GameTime, (time) => time);
		}).toThrow();
	});

	it("emits typed events and supports unsubscribe", () => {
		const world = new World();
		const events: { enemy: number; killer: number }[] = [];
		const unsubscribe = world.on(EnemyKilled, (event) => events.push(event));

		world.emit(EnemyKilled, { enemy: 1, killer: 2 });
		unsubscribe();
		world.emit(EnemyKilled, { enemy: 3, killer: 4 });

		expect(events).toEqual([{ enemy: 1, killer: 2 }]);
	});

	it("stores relation values and relation query helpers", () => {
		const world = new World();
		const firstTower = world.createEntity();
		const secondTower = world.createEntity();
		const enemy = world.createEntity();

		world.setRelation(firstTower, Targeting, enemy, { priority: 10 });
		world.setRelation(secondTower, Targeting, enemy, { priority: 5 });
		world.addRelation(firstTower, OwnedBy, secondTower);

		expect(world.hasRelation(firstTower, Targeting, enemy)).toBe(true);
		expect(world.getRelation(firstTower, Targeting, enemy)).toEqual({
			priority: 10,
		});
		expect(world.getRelation(firstTower, OwnedBy, secondTower)).toBe(true);
		expect(world.targetsOf(firstTower, Targeting)).toEqual([enemy]);
		expect(world.sourcesOf(Targeting, enemy).sort()).toEqual(
			[firstTower, secondTower].sort(),
		);
		expect(world.queryRelation(Targeting, enemy)).toEqual([
			{ source: firstTower, target: enemy, value: { priority: 10 } },
			{ source: secondTower, target: enemy, value: { priority: 5 } },
		]);
	});

	it("removes relation edges when entities die", () => {
		const world = new World();
		const tower = world.createEntity();
		const enemy = world.createEntity();

		world.setRelation(tower, Targeting, enemy, { priority: 1 });
		world.deleteEntity(enemy);

		expect(world.relationTargets(tower, Targeting)).toEqual([]);
		expect(world.getRelation(tower, Targeting, enemy)).toBeUndefined();
	});

	it("throws when adding relations with dead entities", () => {
		const world = new World();
		const tower = world.createEntity();
		const enemy = world.createEntity();

		world.deleteEntity(enemy);

		expect(() => {
			world.setRelation(tower, Targeting, enemy, { priority: 1 });
		}).toThrow();
	});

	it("snapshots restores and inspects world state", () => {
		const world = new World({ debug: true });
		const tower = world.createEntity();
		const enemy = world.createEntity();

		world.advanceTick();
		world.set(tower, Position, { x: 5, y: 9 });
		world.set(tower, Velocity, { x: 1, y: 1 });
		world.set(enemy, Health, { current: 30, max: 50 });
		world.setResource(GameTime, { elapsed: 12 });
		world.setRelation(tower, Targeting, enemy, { priority: 7 });

		const snapshot = world.snapshot();

		world.set(tower, Position, { x: 99, y: 99 });
		world.removeResource(GameTime);
		world.removeRelation(tower, Targeting, enemy);
		world.restore(snapshot);

		const info = world.inspect();

		expect(world.isDebugEnabled()).toBe(true);
		expect(world.getTick()).toBe(1);
		expect(world.get(tower, Position)).toEqual({ x: 5, y: 9 });
		expect(world.getResource(GameTime)).toEqual({ elapsed: 12 });
		expect(world.getRelation(tower, Targeting, enemy)).toEqual({ priority: 7 });
		expect(info.aliveEntities).toBe(2);
		expect(info.relations).toEqual([{ id: "Targeting", edges: 1 }]);
		expect(
			info.archetypes.some(
				(archetype) => archetype.key === "Position|Velocity",
			),
		).toBe(true);
	});
});
