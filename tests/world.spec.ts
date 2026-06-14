import { describe, expect, it } from "bun:test";
import {
	defineComponent,
	defineEvent,
	defineQuerySystem,
	defineRelation,
	defineResource,
	defineSystem,
	defineTag,
	Scheduler,
	World,
} from "../src/index";

interface Position {
	x: number;
	y: number;
}

interface Health {
	current: number;
	max: number;
}

const Position = defineComponent<Position>("Position");
const Health = defineComponent<Health>("Health");
const Velocity = defineComponent<{ x: number; y: number }>("Velocity");
const Enemy = defineTag("Enemy");
const Boss = defineTag("Boss");
const GameTime = defineResource<{ elapsed: number }>("GameTime");
const EnemyKilled = defineEvent<{ enemy: number; killer: number }>(
	"EnemyKilled",
);
const Targeting = defineRelation<{ priority: number }>("Targeting");
const OwnedBy = defineRelation("OwnedBy");

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

	it("exposes immutable entity records", () => {
		const world = new World();
		const entity = world.createEntity();

		expect(world.getEntityRecord(entity)).toEqual({
			alive: true,
			generation: 0,
		});

		world.deleteEntity(entity);

		expect(world.getEntityRecord(entity)).toEqual({
			alive: false,
			generation: 1,
		});
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

		world.addComponent(entity, Position, { x: 1, y: 2 });

		expect(world.getComponent(entity, Position)).toEqual({ x: 1, y: 2 });
	});

	it("uses set/get aliases for components", () => {
		const world = new World();
		const entity = world.createEntity();

		world.set(entity, Position, { x: 7, y: 11 });

		expect(world.get(entity, Position)).toEqual({ x: 7, y: 11 });
		expect(world.has(entity, Position)).toBe(true);
	});

	it("checks if an entity has a component", () => {
		const world = new World();
		const entity = world.createEntity();

		world.addComponent(entity, Health, { current: 100, max: 100 });
		expect(world.hasComponent(entity, Health)).toBe(true);
		expect(world.hasComponent(entity, Position)).toBe(false);
	});

	it("removes a component", () => {
		const world = new World();
		const entity = world.createEntity();

		world.addComponent(entity, Position, { x: 1, y: 2 });
		world.removeComponent(entity, Position);

		expect(world.hasComponent(entity, Position)).toBe(false);
		expect(world.getComponent(entity, Position)).toBeUndefined();
	});

	it("does nothing when removing a missing component", () => {
		const world = new World();
		const entity = world.createEntity();

		expect(() => world.removeComponent(entity, Position)).not.toThrow();
		expect(world.hasComponent(entity, Position)).toBe(false);
	});

	it("removes components when deleting an entity", () => {
		const world = new World();
		const entity = world.createEntity();

		world.addComponent(entity, Position, { x: 1, y: 2 });
		world.deleteEntity(entity);

		expect(world.isAlive(entity)).toBe(false);
		expect(world.hasComponent(entity, Position)).toBe(false);
		expect(world.getComponent(entity, Position)).toBeUndefined();
	});

	it("throws when adding a component to a dead entity", () => {
		const world = new World();
		const entity = world.createEntity();
		world.deleteEntity(entity);

		expect(() => {
			world.addComponent(entity, Position, { x: 1, y: 2 });
		}).toThrow();
	});

	it("replaces an existing component value", () => {
		const world = new World();
		const entity = world.createEntity();

		world.addComponent(entity, Position, { x: 4, y: 9 });
		world.addComponent(entity, Position, { x: 12, y: 30 });

		expect(world.getComponent(entity, Position)).toEqual({ x: 12, y: 30 });
	});

	it("updates a component value", () => {
		const world = new World();
		const entity = world.createEntity();

		world.set(entity, Health, { current: 50, max: 100 });

		const next = world.update(entity, Health, (health) => ({
			...health,
			current: health.current + 25,
		}));

		expect(next).toEqual({ current: 75, max: 100 });
		expect(world.get(entity, Health)).toEqual({ current: 75, max: 100 });
	});

	it("throws when updating a missing component", () => {
		const world = new World();
		const entity = world.createEntity();

		expect(() => {
			world.update(entity, Health, (health) => health);
		}).toThrow();
	});

	it("returns undefined for missing and dead entity components", () => {
		const world = new World();
		const entity = world.createEntity();

		expect(world.getComponent(entity, Position)).toBeUndefined();

		world.addComponent(entity, Position, { x: 4, y: 9 });
		world.deleteEntity(entity);

		expect(world.getComponent(entity, Position)).toBeUndefined();
	});

	it("queries living entities with all requested components", () => {
		const world = new World();
		const tower = world.createEntity();
		const enemy = world.createEntity();
		const deadTower = world.createEntity();

		world.addComponent(tower, Position, { x: 0, y: 0 });
		world.addComponent(tower, Health, { current: 100, max: 100 });
		world.addComponent(enemy, Position, { x: 10, y: 5 });
		world.addComponent(deadTower, Position, { x: 2, y: 2 });
		world.addComponent(deadTower, Health, { current: 1, max: 100 });
		world.deleteEntity(deadTower);

		expect(world.query(Position)).toEqual([tower, enemy]);
		expect(world.query(Position, Health)).toEqual([tower]);
	});

	it("iterates query results with typed component values", () => {
		const world = new World();
		const entity = world.createEntity();

		world.set(entity, Position, { x: 1, y: 2 });
		world.set(entity, Velocity, { x: 3, y: 4 });

		world.queryEach([Position, Velocity], (_entity, position, velocity) => {
			position.x += velocity.x;
			position.y += velocity.y;
		});

		expect(world.get(entity, Position)).toEqual({ x: 4, y: 6 });
	});

	it("returns all living entities when querying with no components", () => {
		const world = new World();
		const first = world.createEntity();
		const second = world.createEntity();
		const dead = world.createEntity();

		world.deleteEntity(dead);

		expect(world.query()).toEqual([first, second]);
	});

	it("does not return entities missing one requested component", () => {
		const world = new World();
		const moving = world.createEntity();
		const positionedOnly = world.createEntity();

		world.addComponent(moving, Position, { x: 1, y: 2 });
		world.addComponent(moving, Velocity, { x: 0, y: 1 });
		world.addComponent(positionedOnly, Position, { x: 3, y: 4 });

		expect(world.query(Position, Velocity)).toEqual([moving]);
	});

	it("supports tags as zero-data components", () => {
		const world = new World();
		const enemy = world.createEntity();

		world.addTag(enemy, Enemy);

		expect(world.hasTag(enemy, Enemy)).toBe(true);
		expect(world.hasTag(enemy, Boss)).toBe(false);
		expect(world.query(Enemy)).toEqual([enemy]);

		world.removeTag(enemy, Enemy);

		expect(world.hasTag(enemy, Enemy)).toBe(false);
	});

	it("stores, updates, and removes resources", () => {
		const world = new World();

		world.setResource(GameTime, { elapsed: 1 });

		expect(world.hasResource(GameTime)).toBe(true);
		expect(world.getResource(GameTime)).toEqual({ elapsed: 1 });

		world.updateResource(GameTime, (time) => ({ elapsed: time.elapsed + 2 }));

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
		const unsubscribe = world.on(EnemyKilled, (event) => {
			events.push(event);
		});

		world.emit(EnemyKilled, { enemy: 1, killer: 2 });
		unsubscribe();
		world.emit(EnemyKilled, { enemy: 3, killer: 4 });

		expect(events).toEqual([{ enemy: 1, killer: 2 }]);
	});

	it("stores relation values between living entities", () => {
		const world = new World();
		const tower = world.createEntity();
		const enemy = world.createEntity();

		world.setRelation(tower, Targeting, enemy, { priority: 10 });

		expect(world.hasRelation(tower, Targeting, enemy)).toBe(true);
		expect(world.getRelation(tower, Targeting, enemy)).toEqual({
			priority: 10,
		});
		expect(world.relationTargets(tower, Targeting)).toEqual([enemy]);
		expect(world.relationSources(Targeting, enemy)).toEqual([tower]);
	});

	it("supports true-valued relation pairs", () => {
		const world = new World();
		const tower = world.createEntity();
		const player = world.createEntity();

		world.addRelation(tower, OwnedBy, player);

		expect(world.getRelation(tower, OwnedBy, player)).toBe(true);
	});

	it("removes relation edges and cleans relations when entities die", () => {
		const world = new World();
		const tower = world.createEntity();
		const firstEnemy = world.createEntity();
		const secondEnemy = world.createEntity();

		world.setRelation(tower, Targeting, firstEnemy, { priority: 1 });
		world.setRelation(tower, Targeting, secondEnemy, { priority: 2 });
		world.removeRelation(tower, Targeting, firstEnemy);

		expect(world.hasRelation(tower, Targeting, firstEnemy)).toBe(false);
		expect(world.relationTargets(tower, Targeting)).toEqual([secondEnemy]);

		world.deleteEntity(secondEnemy);

		expect(world.relationTargets(tower, Targeting)).toEqual([]);
		expect(world.getRelation(tower, Targeting, secondEnemy)).toBeUndefined();
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

	it("runs standalone systems", () => {
		const world = new World();
		const system = defineSystem("spawn-time", (runningWorld) => {
			runningWorld.setResource(GameTime, { elapsed: 5 });
		});

		system.run(world);

		expect(world.getResource(GameTime)).toEqual({ elapsed: 5 });
	});

	it("runs query systems", () => {
		const world = new World();
		const entity = world.createEntity();
		const movementSystem = defineQuerySystem(
			"movement",
			[Position, Velocity],
			(_world, _entity, position, velocity) => {
				position.x += velocity.x;
				position.y += velocity.y;
			},
		);

		world.set(entity, Position, { x: 1, y: 2 });
		world.set(entity, Velocity, { x: 5, y: 8 });

		movementSystem.run(world);

		expect(world.get(entity, Position)).toEqual({ x: 6, y: 10 });
	});

	it("runs scheduler systems in insertion order", () => {
		const world = new World();
		const calls: string[] = [];
		const scheduler = new Scheduler()
			.add(defineSystem("first", () => calls.push("first")))
			.add(defineSystem("second", () => calls.push("second")));

		scheduler.run(world);

		expect(calls).toEqual(["first", "second"]);
	});

	it("clears scheduler systems", () => {
		const world = new World();
		const calls: string[] = [];
		const scheduler = new Scheduler().add(
			defineSystem("system", () => calls.push("system")),
		);

		scheduler.clear();
		scheduler.run(world);

		expect(calls).toEqual([]);
	});
});
