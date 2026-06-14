import { describe, expect, it } from "bun:test";
import { defineQuerySystem, defineSystem, Scheduler, World } from "../src";
import {
	Enemy,
	EnemyKilled,
	GameTime,
	Health,
	Position,
	Targeting,
	Velocity,
} from "./fixtures";

describe("systems scheduler and commands", () => {
	it("runs standalone and query systems", () => {
		const world = new World();
		const entity = world.createEntity();
		const setupSystem = defineSystem("setup", (runningWorld) => {
			runningWorld.setResource(GameTime, { elapsed: 5 });
		});
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

		setupSystem.run(world);
		movementSystem.run(world);

		expect(world.getResource(GameTime)).toEqual({ elapsed: 5 });
		expect(world.get(entity, Position)).toEqual({ x: 6, y: 10 });
	});

	it("runs scheduler systems by phase dependency and lifecycle", () => {
		const world = new World();
		const calls: string[] = [];
		const scheduler = new Scheduler()
			.withFixedStep(0.25)
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
					onStop: () => calls.push("stop"),
				},
			)
			.add(
				defineSystem("spawn", () => calls.push("spawn")),
				{
					phase: "simulate",
					before: ["damage"],
					onStart: () => calls.push("start"),
					onFixedUpdate: (_world, deltaTime) => {
						calls.push(`fixed:${deltaTime}`);
					},
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
		expect(scheduler.fixedUpdate(world, 0.5)).toBe(2);
		scheduler.stop(world);

		expect(calls).toEqual([
			"prepare",
			"start",
			"spawn",
			"move",
			"damage",
			"cleanup",
			"fixed:0.25",
			"fixed:0.25",
			"stop",
		]);
		expect(world.getTick()).toBe(2);
		expect(scheduler.inspect()[0]?.runs).toBeGreaterThan(0);
	});

	it("throws when scheduler dependencies form a cycle", () => {
		const world = new World();
		const scheduler = new Scheduler()
			.add(defineSystem("first", () => undefined, { after: ["second"] }))
			.add(defineSystem("second", () => undefined, { after: ["first"] }));

		expect(() => scheduler.run(world)).toThrow();
	});

	it("buffers component resource event and relation commands until flushed", () => {
		const world = new World();
		const events: number[] = [];
		const commands = world.commands();
		const tower = commands.spawn();
		const enemy = commands.spawn();

		world.on(EnemyKilled, (event) => events.push(event.enemy));

		commands
			.set(tower, Position, { x: 0, y: 0 })
			.addTag(tower, Enemy)
			.set(enemy, Health, { current: 25, max: 25 })
			.setResource(GameTime, { elapsed: 9 })
			.setRelation(tower, Targeting, enemy, { priority: 100 })
			.emit(EnemyKilled, { enemy: 55, killer: 1 });

		expect(world.query(Position)).toEqual([]);

		commands.flush(world);

		const towerEntity = world.query(Position)[0];
		const enemyEntity = world.query(Health)[0];

		expect(towerEntity).toBeDefined();
		expect(enemyEntity).toBeDefined();

		if (towerEntity === undefined || enemyEntity === undefined) {
			return;
		}

		expect(world.hasTag(towerEntity, Enemy)).toBe(true);
		expect(world.getResource(GameTime)).toEqual({ elapsed: 9 });
		expect(world.getRelation(towerEntity, Targeting, enemyEntity)).toEqual({
			priority: 100,
		});
		expect(events).toEqual([55]);
	});

	it("throws when a command references an uncreated spawned entity", () => {
		const world = new World();
		const commands = world
			.commands()
			.set({ id: 404 }, Position, { x: 1, y: 2 });

		expect(() => commands.flush(world)).toThrow();
	});
});
