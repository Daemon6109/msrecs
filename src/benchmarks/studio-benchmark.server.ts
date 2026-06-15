//!native
//!optimize 2

import * as MSRECS from "../../src";

const { World, defineComponent } = MSRECS;

const EntityCount = 10_000;
const QueryMatchCount = EntityCount / 2;

const Position = defineComponent<{ x: number; y: number }>("BenchmarkPosition");
const Velocity = defineComponent<{ x: number; y: number }>("BenchmarkVelocity");
const Health = defineComponent<{ current: number; max: number }>(
	"BenchmarkHealth",
);

function runBenchmark(
	name: string,
	iterations: number,
	callback: () => void,
): void {
	for (let index = 0; index < 5; index++) {
		callback();
	}

	const startedAt = os.clock();

	for (let index = 0; index < iterations; index++) {
		callback();
	}

	const elapsed = os.clock() - startedAt;
	const average = (elapsed / iterations) * 1000;

	print(
		`[MSRECS] ${name}: ${string.format("%.3f", average)}ms avg over ${iterations} runs`,
	);
}

runBenchmark("create 10,000 entities", 25, () => {
	const world = new World();

	for (let index = 0; index < EntityCount; index++) {
		world.createEntity();
	}
});

runBenchmark("set/get 10,000 position components", 25, () => {
	const world = new World();
	const entities: number[] = [];

	for (let index = 0; index < EntityCount; index++) {
		const entity = world.createEntity();
		entities.push(entity);
		world.set(entity, Position, { x: index, y: index });
	}

	for (const entity of entities) {
		world.get(entity, Position);
	}
});

runBenchmark("query 10,000 entities with two components", 25, () => {
	const world = new World();

	for (let index = 0; index < EntityCount; index++) {
		const entity = world.createEntity();
		world.set(entity, Position, { x: index, y: index });

		if (index % 2 === 0) {
			world.set(entity, Velocity, { x: 1, y: 1 });
		}
	}

	world.query(Position, Velocity);
});

runBenchmark("cached query 10,000 entities with two components", 25, () => {
	const world = new World();

	for (let index = 0; index < EntityCount; index++) {
		const entity = world.createEntity();
		world.set(entity, Position, { x: index, y: index });

		if (index % 2 === 0) {
			world.set(entity, Velocity, { x: 1, y: 1 });
		}
	}

	world.queryCached(Position, Velocity);
	world.queryCached(Position, Velocity);
});

runBenchmark("query object over 5,000 matching entities", 25, () => {
	const world = new World();

	for (let index = 0; index < EntityCount; index++) {
		const entity = world.createEntity();
		world.set(entity, Position, { x: index, y: index });

		if (index % 2 === 0) {
			world.set(entity, Velocity, { x: 1, y: 1 });
		}
	}

	const query = world.queryObject([Position, Velocity] as const);
	query.each((_entity, position, velocity) => {
		position.x += velocity.x;
		position.y += velocity.y;
	});
});

runBenchmark("queryEach movement over 5,000 matching entities", 25, () => {
	const world = new World();

	for (let index = 0; index < EntityCount; index++) {
		const entity = world.createEntity();
		world.set(entity, Position, { x: index, y: index });

		if (index % 2 === 0) {
			world.set(entity, Velocity, { x: 1, y: 1 });
		}
	}

	world.queryEach(
		[Position, Velocity] as const,
		(_entity, position, velocity) => {
			position.x += velocity.x;
			position.y += velocity.y;
		},
	);
});

runBenchmark("query 10,000 entities with three components", 25, () => {
	const world = new World();

	for (let index = 0; index < EntityCount; index++) {
		const entity = world.createEntity();
		world.set(entity, Position, { x: index, y: index });
		world.set(entity, Health, { current: 100, max: 100 });

		if (index % 2 === 0) {
			world.set(entity, Velocity, { x: 1, y: 1 });
		}
	}

	world.query(Position, Velocity, Health);
});

runBenchmark("flush command buffer with 10,000 component writes", 25, () => {
	const world = new World();
	const commands = world.commands();

	for (let index = 0; index < EntityCount; index++) {
		const entity = commands.spawn();
		commands.set(entity, Position, { x: index, y: index });
	}

	commands.flush(world);
});

runBenchmark("snapshot and restore 10,000 positioned entities", 10, () => {
	const world = new World();

	for (let index = 0; index < EntityCount; index++) {
		const entity = world.createEntity();
		world.set(entity, Position, { x: index, y: index });
	}

	const snapshot = world.snapshot();
	world.restore(snapshot);
});

print(`[MSRECS] Benchmarks complete. Query match count: ${QueryMatchCount}`);
