import { describe, expect, it } from "bun:test";
import { World } from "../../src";
import { Enemy, Health, Position, Targeting, Velocity } from "./fixtures";

describe("contract: stress and invariants", () => {
	it("handles thousands of entities through queries removals and restore", () => {
		const world = new World();
		const entities: number[] = [];

		for (let index = 0; index < 5_000; index++) {
			const entity = world.createEntity();
			entities.push(entity);
			world.set(entity, Position, { x: index, y: index });

			if (index % 2 === 0) {
				world.set(entity, Velocity, { x: 1, y: 1 });
			}

			if (index % 5 === 0) {
				world.set(entity, Health, { current: 100, max: 100 });
			}
		}

		expect(world.query(Position).length).toBe(5_000);
		expect(world.query(Position, Velocity).length).toBe(2_500);
		expect(world.query(Position, Health).length).toBe(1_000);

		const snapshot = world.snapshot();

		for (let index = 0; index < entities.length; index += 2) {
			const entity = entities[index];

			if (entity !== undefined) {
				world.deleteEntity(entity);
			}
		}

		expect(world.query(Position).length).toBe(2_500);

		world.restore(snapshot);

		expect(world.query(Position).length).toBe(5_000);
		expect(world.query(Position, Velocity).length).toBe(2_500);
		expect(world.query(Position, Health).length).toBe(1_000);
	});

	it("does not return duplicate entities after heavy component churn", () => {
		const world = new World();
		const entities: number[] = [];

		for (let index = 0; index < 1_000; index++) {
			const entity = world.createEntity();
			entities.push(entity);
			world.set(entity, Position, { x: index, y: index });
		}

		for (let round = 0; round < 20; round++) {
			for (const entity of entities) {
				if ((entity + round) % 3 === 0) {
					world.set(entity, Velocity, { x: round, y: round });
				} else {
					world.remove(entity, Velocity);
				}
			}
		}

		const result = world.query(Position, Velocity);

		expect(new Set(result).size).toBe(result.length);

		for (const entity of result) {
			expect(world.has(entity, Position)).toBe(true);
			expect(world.has(entity, Velocity)).toBe(true);
		}
	});

	it("keeps command buffer bulk writes consistent", () => {
		const world = new World();
		const commands = world.commands();

		for (let index = 0; index < 2_000; index++) {
			const entity = commands.spawn();
			commands.set(entity, Position, { x: index, y: index });

			if (index % 4 === 0) {
				commands.set(entity, Velocity, { x: 2, y: 0 });
			}

			if (index % 10 === 0) {
				commands.addTag(entity, Enemy);
			}
		}

		commands.flush(world);

		expect(world.query(Position).length).toBe(2_000);
		expect(world.query(Position, Velocity).length).toBe(500);
		expect(world.query(Position, Enemy).length).toBe(200);
	});

	it("keeps relation queries consistent after deleting many targets", () => {
		const world = new World();
		const tower = world.createEntity();
		const enemies: number[] = [];

		for (let index = 0; index < 500; index++) {
			const enemy = world.createEntity();
			enemies.push(enemy);
			world.setRelation(tower, Targeting, enemy, { priority: index });
		}

		for (let index = 0; index < enemies.length; index += 2) {
			const enemy = enemies[index];

			if (enemy !== undefined) {
				world.deleteEntity(enemy);
			}
		}

		const targets = world.targetsOf(tower, Targeting);

		expect(targets.length).toBe(250);
		expect(new Set(targets).size).toBe(250);

		for (const target of targets) {
			expect(world.isAlive(target)).toBe(true);
			expect(world.hasRelation(tower, Targeting, target)).toBe(true);
		}
	});
});

