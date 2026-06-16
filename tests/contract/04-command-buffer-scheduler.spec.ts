import { describe, expect, it } from "bun:test";
import {
	Scheduler,
	World,
	defineQuerySystem,
	defineSystem,
} from "../../src";
import {
	DamageDealt,
	Enemy,
	GameClock,
	Health,
	Position,
	Targeting,
	Velocity,
} from "./fixtures";

describe("contract: command buffer and scheduler", () => {
	it("defers structural writes until flush and resolves spawned placeholders", () => {
		const world = new World();
		const events: number[] = [];
		const commands = world.commands();
		const tower = commands.spawn();
		const enemy = commands.spawn();

		world.on(DamageDealt, (event) => {
			events.push(event.amount);
		});

		commands
			.set(tower, Position, { x: 0, y: 0 })
			.addTag(enemy, Enemy)
			.set(enemy, Health, { current: 25, max: 25 })
			.setResource(GameClock, { elapsed: 3, fixedStep: 0.5 })
			.setRelation(tower, Targeting, enemy, { priority: 100 })
			.emit(DamageDealt, { source: 1, target: 2, amount: 7 });

		expect(world.query()).toEqual([]);
		expect(world.query(Position)).toEqual([]);

		commands.flush(world);

		const towerEntity = world.query(Position)[0];
		const enemyEntity = world.query(Health)[0];

		expect(towerEntity).toBeDefined();
		expect(enemyEntity).toBeDefined();

		if (towerEntity === undefined || enemyEntity === undefined) {
			throw new Error("expected command buffer to spawn both entities");
		}

		expect(world.hasTag(enemyEntity, Enemy)).toBe(true);
		expect(world.getResource(GameClock)).toEqual({
			elapsed: 3,
			fixedStep: 0.5,
		});
		expect(world.getRelation(towerEntity, Targeting, enemyEntity)).toEqual({
			priority: 100,
		});
		expect(events).toEqual([7]);
	});

	it("flushes commands exactly once", () => {
		const world = new World();
		const commands = world.commands();

		commands.spawn();
		commands.flush(world);
		commands.flush(world);

		expect(world.query()).toEqual([1]);
	});

	it("throws when a command references a placeholder that was never spawned", () => {
		const world = new World();
		const commands = world
			.commands()
			.set({ id: 404 }, Position, { x: 1, y: 2 });

		expect(() => {
			commands.flush(world);
		}).toThrow();
	});

	it("runs standalone and query systems", () => {
		const world = new World();
		const entity = world.createEntity();

		world.set(entity, Position, { x: 1, y: 2 });
		world.set(entity, Velocity, { x: 5, y: 8 });

		const setupSystem = defineSystem("setup-clock", (runningWorld) => {
			runningWorld.setResource(GameClock, { elapsed: 5, fixedStep: 0.25 });
		});
		const movementSystem = defineQuerySystem(
			"movement",
			[Position, Velocity],
			(_world, _entity, position, velocity) => {
				position.x += velocity.x;
				position.y += velocity.y;
			},
		);

		setupSystem.run(world);
		movementSystem.run(world);

		expect(world.getResource(GameClock)).toEqual({
			elapsed: 5,
			fixedStep: 0.25,
		});
		expect(world.get(entity, Position)).toEqual({ x: 6, y: 10 });
	});

	it("runs scheduler systems by phase and dependency order", () => {
		const world = new World();
		const calls: string[] = [];
		const scheduler = new Scheduler()
			.phase("prepare")
			.phase("simulate")
			.phase("cleanup")
			.add(defineSystem("cleanup", () => calls.push("cleanup")), {
				phase: "cleanup",
			})
			.add(defineSystem("move", () => calls.push("move")), {
				phase: "simulate",
				after: ["spawn"],
			})
			.add(defineSystem("spawn", () => calls.push("spawn")), {
				phase: "simulate",
				before: ["damage"],
			})
			.add(defineSystem("damage", () => calls.push("damage")), {
				phase: "simulate",
			})
			.add(defineSystem("prepare", () => calls.push("prepare")), {
				phase: "prepare",
			});

		scheduler.run(world);

		expect(calls).toEqual([
			"prepare",
			"spawn",
			"move",
			"damage",
			"cleanup",
		]);
	});

	it("supports lifecycle hooks fixed updates timing inspection and stop", () => {
		const world = new World();
		const calls: string[] = [];
		const scheduler = new Scheduler()
			.withFixedStep(0.25)
			.add(
				defineSystem("fixed", () => calls.push("run"), {
					onStart: () => calls.push("start"),
					onFixedUpdate: (_world, deltaTime) => {
						calls.push(`fixed:${deltaTime}`);
					},
					onStop: () => calls.push("stop"),
				}),
			);

		scheduler.run(world);
		expect(scheduler.fixedUpdate(world, 0.5)).toBe(2);
		scheduler.stop(world);

		expect(calls).toEqual([
			"start",
			"run",
			"fixed:0.25",
			"fixed:0.25",
			"stop",
		]);
		expect(world.getTick()).toBe(2);
		expect(scheduler.inspect()[0]?.name).toBe("fixed");
		expect(scheduler.inspect()[0]?.runs).toBeGreaterThan(0);
	});

	it("throws when scheduler dependencies form a cycle", () => {
		const world = new World();
		const scheduler = new Scheduler()
			.add(defineSystem("first", () => undefined, { after: ["second"] }))
			.add(defineSystem("second", () => undefined, { after: ["first"] }));

		expect(() => {
			scheduler.run(world);
		}).toThrow();
	});
});

