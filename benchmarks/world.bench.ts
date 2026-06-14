import { defineComponent, World } from "../src";

const Position = defineComponent<{ x: number; y: number }>("Position");
const Velocity = defineComponent<{ x: number; y: number }>("Velocity");
const Health = defineComponent<{ current: number; max: number }>("Health");

function runBenchmark(
	name: string,
	iterations: number,
	callback: () => void,
): void {
	for (let index = 0; index < 5; index++) {
		callback();
	}

	const startedAt = performance.now();

	for (let index = 0; index < iterations; index++) {
		callback();
	}

	const elapsed = performance.now() - startedAt;
	const average = elapsed / iterations;

	console.log(`${name}: ${average.toFixed(3)}ms avg over ${iterations} runs`);
}

runBenchmark("create 10,000 entities", 100, () => {
	const world = new World();

	for (let index = 0; index < 10_000; index++) {
		world.createEntity();
	}
});

runBenchmark("set/get 10,000 position components", 100, () => {
	const world = new World();
	const entities: number[] = [];

	for (let index = 0; index < 10_000; index++) {
		const entity = world.createEntity();
		entities.push(entity);
		world.set(entity, Position, { x: index, y: index });
	}

	for (const entity of entities) {
		world.get(entity, Position);
	}
});

runBenchmark("query 10,000 entities with two components", 100, () => {
	const world = new World();

	for (let index = 0; index < 10_000; index++) {
		const entity = world.createEntity();
		world.set(entity, Position, { x: index, y: index });

		if (index % 2 === 0) {
			world.set(entity, Velocity, { x: 1, y: 1 });
		}
	}

	world.query(Position, Velocity);
});

runBenchmark("queryEach movement over 5,000 matching entities", 100, () => {
	const world = new World();

	for (let index = 0; index < 10_000; index++) {
		const entity = world.createEntity();
		world.set(entity, Position, { x: index, y: index });

		if (index % 2 === 0) {
			world.set(entity, Velocity, { x: 1, y: 1 });
		}
	}

	world.queryEach([Position, Velocity], (_entity, position, velocity) => {
		position.x += velocity.x;
		position.y += velocity.y;
	});
});

runBenchmark("query 10,000 entities with three components", 100, () => {
	const world = new World();

	for (let index = 0; index < 10_000; index++) {
		const entity = world.createEntity();
		world.set(entity, Position, { x: index, y: index });
		world.set(entity, Health, { current: 100, max: 100 });

		if (index % 2 === 0) {
			world.set(entity, Velocity, { x: 1, y: 1 });
		}
	}

	world.query(Position, Velocity, Health);
});
