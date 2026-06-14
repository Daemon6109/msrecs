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

	it("supports generation-safe entity handles", () => {
		const world = new World();
		const handle = world.createEntityHandle();

		expect(world.isHandleAlive(handle)).toBe(true);
		expect(world.resolveEntity(handle)).toBe(handle.id);

		world.deleteEntityHandle(handle);

		expect(world.isHandleAlive(handle)).toBe(false);
		expect(world.resolveEntity(handle)).toBeUndefined();
		expect(world.getEntityRecord(handle.id)?.generation).toBe(1);
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
		expect(world.query(Position)).toEqual([entity]);
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

	it("keeps sparse component stores valid after removing a middle entity", () => {
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

	it("does not leave stale sparse entries after deleting an entity", () => {
		const world = new World();
		const alive = world.createEntity();
		const deleted = world.createEntity();

		world.set(alive, Position, { x: 1, y: 1 });
		world.set(deleted, Position, { x: 2, y: 2 });
		world.deleteEntity(deleted);

		expect(world.query(Position)).toEqual([alive]);
		expect(world.get(deleted, Position)).toBeUndefined();
	});

	it("caches query results and invalidates when component membership changes", () => {
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

	it("supports reusable query objects with cached iteration helpers", () => {
		const world = new World();
		const first = world.createEntity();
		const second = world.createEntity();
		const query = world.queryObject([Position, Velocity]);
		const moved: number[] = [];

		world.set(first, Position, { x: 0, y: 0 });
		world.set(first, Velocity, { x: 1, y: 1 });
		world.set(second, Position, { x: 10, y: 10 });

		expect(query.count()).toBe(1);
		expect(query.first()).toBe(first);

		query.each((entity, position, velocity) => {
			position.x += velocity.x;
			position.y += velocity.y;
			moved.push(entity);
		});

		expect(moved).toEqual([first]);
		expect(world.get(first, Position)).toEqual({ x: 1, y: 1 });
	});

	it("tracks entity archetypes as sorted component ids", () => {
		const world = new World();
		const entity = world.createEntity();

		world.set(entity, Velocity, { x: 0, y: 1 });
		world.set(entity, Position, { x: 4, y: 8 });

		expect(world.getArchetype(entity)).toEqual(["Position", "Velocity"]);
		expect(world.getArchetypeKey(entity)).toBe("Position|Velocity");

		world.remove(entity, Position);

		expect(world.getArchetype(entity)).toEqual(["Velocity"]);

		world.deleteEntity(entity);

		expect(world.getArchetype(entity)).toEqual([]);
	});

	it("tracks added changed and removed components until cleared", () => {
		const world = new World();
		const entity = world.createEntity();

		world.advanceTick();
		world.set(entity, Health, { current: 10, max: 100 });

		expect(world.added(Health)).toEqual([entity]);
		expect(world.addedChanges(Health)).toEqual([{ entity, tick: 1 }]);
		expect(world.changed(Health)).toEqual([]);
		expect(world.removed(Health)).toEqual([]);

		world.advanceTick();
		world.set(entity, Health, { current: 20, max: 100 });

		expect(world.changed(Health)).toEqual([entity]);
		expect(world.changedChanges(Health)).toEqual([{ entity, tick: 2 }]);

		world.advanceTick();
		world.remove(entity, Health);

		expect(world.removed(Health)).toEqual([entity]);
		expect(world.removedChanges(Health)).toEqual([{ entity, tick: 3 }]);

		world.clearChanges();

		expect(world.added(Health)).toEqual([]);
		expect(world.changed(Health)).toEqual([]);
		expect(world.removed(Health)).toEqual([]);
	});

	it("notifies component observers", () => {
		const world = new World();
		const entity = world.createEntity();
		const calls: string[] = [];

		const unsubscribeAdd = world.onAdd(Position, (addedEntity, position) => {
			calls.push(`add:${addedEntity}:${position.x}`);
		});
		const unsubscribeChange = world.onChange(
			Position,
			(changedEntity, position) => {
				calls.push(`change:${changedEntity}:${position.x}`);
			},
		);
		const unsubscribeRemove = world.onRemove(Position, (removedEntity) => {
			calls.push(`remove:${removedEntity}`);
		});

		world.set(entity, Position, { x: 1, y: 1 });
		world.set(entity, Position, { x: 2, y: 2 });
		world.remove(entity, Position);

		unsubscribeAdd();
		unsubscribeChange();
		unsubscribeRemove();
		world.set(entity, Position, { x: 3, y: 3 });

		expect(calls).toEqual([
			`add:${entity}:1`,
			`change:${entity}:2`,
			`remove:${entity}`,
		]);
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

	it("snapshots and restores world state", () => {
		const world = new World();
		const tower = world.createEntity();
		const enemy = world.createEntity();

		world.advanceTick();
		world.set(tower, Position, { x: 5, y: 9 });
		world.set(enemy, Health, { current: 30, max: 50 });
		world.setResource(GameTime, { elapsed: 12 });
		world.setRelation(tower, Targeting, enemy, { priority: 7 });

		const snapshot = world.snapshot();

		world.set(tower, Position, { x: 99, y: 99 });
		world.removeResource(GameTime);
		world.removeRelation(tower, Targeting, enemy);
		world.restore(snapshot);

		expect(world.getTick()).toBe(1);
		expect(world.get(tower, Position)).toEqual({ x: 5, y: 9 });
		expect(world.get(enemy, Health)).toEqual({ current: 30, max: 50 });
		expect(world.getResource(GameTime)).toEqual({ elapsed: 12 });
		expect(world.getRelation(tower, Targeting, enemy)).toEqual({ priority: 7 });
	});

	it("returns debug inspection data for entities components resources and relations", () => {
		const world = new World({ debug: true });
		const tower = world.createEntity();
		const enemy = world.createEntity();

		world.set(tower, Position, { x: 0, y: 0 });
		world.set(tower, Velocity, { x: 1, y: 1 });
		world.set(enemy, Health, { current: 10, max: 10 });
		world.setResource(GameTime, { elapsed: 1 });
		world.setRelation(tower, Targeting, enemy, { priority: 1 });

		const info = world.inspect();

		expect(world.isDebugEnabled()).toBe(true);
		expect(info.aliveEntities).toBe(2);
		expect(info.components.map((component) => component.id).sort()).toEqual([
			"Health",
			"Position",
			"Velocity",
		]);
		expect(info.resources).toEqual(["GameTime"]);
		expect(info.relations).toEqual([{ id: "Targeting", edges: 1 }]);
		expect(
			info.archetypes.some(
				(archetype) => archetype.key === "Position|Velocity",
			),
		).toBe(true);
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

	it("queries relation entries and relation aliases", () => {
		const world = new World();
		const firstTower = world.createEntity();
		const secondTower = world.createEntity();
		const enemy = world.createEntity();

		world.setRelation(firstTower, Targeting, enemy, { priority: 10 });
		world.setRelation(secondTower, Targeting, enemy, { priority: 5 });

		expect(world.targetsOf(firstTower, Targeting)).toEqual([enemy]);
		expect(world.sourcesOf(Targeting, enemy).sort()).toEqual(
			[firstTower, secondTower].sort(),
		);
		expect(world.queryRelation(Targeting, enemy)).toEqual([
			{ source: firstTower, target: enemy, value: { priority: 10 } },
			{ source: secondTower, target: enemy, value: { priority: 5 } },
		]);
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

	it("runs scheduler systems by phase and dependency hints", () => {
		const world = new World();
		const calls: string[] = [];
		const scheduler = new Scheduler()
			.phase("prepare")
			.phase("simulate")
			.phase("cleanup")
			.add(
				defineSystem("move", () => calls.push("move")),
				{
					phase: "simulate",
					after: ["spawn"],
				},
			)
			.add(
				defineSystem("cleanup", () => calls.push("cleanup")),
				{
					phase: "cleanup",
				},
			)
			.add(
				defineSystem("spawn", () => calls.push("spawn")),
				{
					phase: "simulate",
					before: ["damage"],
				},
			)
			.add(
				defineSystem("damage", () => calls.push("damage")),
				{
					phase: "simulate",
				},
			)
			.add(
				defineSystem("prepare", () => calls.push("prepare")),
				{
					phase: "prepare",
				},
			);

		scheduler.run(world);

		expect(calls).toEqual(["prepare", "spawn", "move", "damage", "cleanup"]);
	});

	it("runs scheduler lifecycle hooks and deterministic fixed steps", () => {
		const world = new World();
		const calls: string[] = [];
		const scheduler = new Scheduler().withFixedStep(0.25).add(
			defineSystem("sim", () => calls.push("run"), {
				onStart: () => calls.push("start"),
				onFixedUpdate: (_world, deltaTime) => {
					calls.push(`fixed:${deltaTime}`);
				},
				onStop: () => calls.push("stop"),
			}),
		);

		scheduler.run(world);

		expect(scheduler.fixedUpdate(world, 0.1)).toBe(0);
		expect(scheduler.fixedUpdate(world, 0.4)).toBe(2);
		expect(world.getTick()).toBe(2);

		scheduler.stop(world);

		expect(calls).toEqual(["start", "run", "fixed:0.25", "fixed:0.25", "stop"]);
		expect(scheduler.inspect()[0]?.runs).toBe(3);
	});

	it("throws when scheduler dependencies form a cycle", () => {
		const world = new World();
		const scheduler = new Scheduler()
			.add(defineSystem("first", () => undefined, { after: ["second"] }))
			.add(defineSystem("second", () => undefined, { after: ["first"] }));

		expect(() => scheduler.run(world)).toThrow();
	});

	it("buffers commands until flushed", () => {
		const world = new World();
		const events: number[] = [];

		world.on(EnemyKilled, (event) => events.push(event.enemy));

		const commands = world.commands();
		const spawned = commands.spawn();

		commands
			.set(spawned, Position, { x: 1, y: 2 })
			.addTag(spawned, Enemy)
			.setResource(GameTime, { elapsed: 9 })
			.emit(EnemyKilled, { enemy: 55, killer: 1 });

		expect(world.query(Position)).toEqual([]);
		expect(world.getResource(GameTime)).toBeUndefined();
		expect(events).toEqual([]);

		commands.flush(world);

		const entities = world.query(Position, Enemy);
		const entity = entities[0];

		expect(entities.size()).toBe(1);
		expect(entity).toBeDefined();

		if (entity === undefined) {
			return;
		}

		expect(world.get(entity, Position)).toEqual({ x: 1, y: 2 });
		expect(world.getResource(GameTime)).toEqual({ elapsed: 9 });
		expect(events).toEqual([55]);
	});

	it("buffers relations between entities spawned in the same command buffer", () => {
		const world = new World();
		const commands = world.commands();
		const tower = commands.spawn();
		const enemy = commands.spawn();

		commands
			.set(tower, Position, { x: 0, y: 0 })
			.set(enemy, Health, { current: 25, max: 25 })
			.setRelation(tower, Targeting, enemy, { priority: 100 });

		commands.flush(world);

		const towerEntity = world.query(Position)[0];
		const enemyEntity = world.query(Health)[0];

		expect(towerEntity).toBeDefined();
		expect(enemyEntity).toBeDefined();

		if (towerEntity === undefined || enemyEntity === undefined) {
			return;
		}

		expect(world.getRelation(towerEntity, Targeting, enemyEntity)).toEqual({
			priority: 100,
		});
	});

	it("throws when flushing a command that references an uncreated spawned entity", () => {
		const world = new World();

		const commands = world
			.commands()
			.set({ id: 404 }, Position, { x: 1, y: 2 });

		expect(() => commands.flush(world)).toThrow();
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
