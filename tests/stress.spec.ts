import { describe, expect, it } from "bun:test";
import { World } from "../src";
import { Health, Position, Velocity } from "./fixtures";

describe("stress coverage", () => {
	it("handles thousands of entities components queries removals and restore", () => {
		const world = new World();
		const snapshotEntities: number[] = [];

		for (let index = 0; index < 5_000; index++) {
			const entity = world.createEntity();
			snapshotEntities.push(entity);
			world.set(entity, Position, { x: index, y: index });

			if (index % 2 === 0) {
				world.set(entity, Velocity, { x: 1, y: 1 });
			}

			if (index % 5 === 0) {
				world.set(entity, Health, { current: 100, max: 100 });
			}
		}

		expect(world.query(Position).size()).toBe(5_000);
		expect(world.query(Position, Velocity).size()).toBe(2_500);
		expect(world.query(Position, Health).size()).toBe(1_000);

		const snapshot = world.snapshot();

		for (let index = 0; index < snapshotEntities.size(); index += 2) {
			const entity = snapshotEntities[index];

			if (entity !== undefined) {
				world.deleteEntity(entity);
			}
		}

		expect(world.query(Position).size()).toBe(2_500);

		world.restore(snapshot);

		expect(world.query(Position).size()).toBe(5_000);
		expect(world.query(Position, Velocity).size()).toBe(2_500);
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
		}

		commands.flush(world);

		expect(world.query(Position).size()).toBe(2_000);
		expect(world.query(Position, Velocity).size()).toBe(500);
	});
});
