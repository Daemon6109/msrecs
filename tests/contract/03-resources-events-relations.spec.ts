import { describe, expect, it } from "bun:test";
import { World } from "../../src";
import {
	DamageDealt,
	EnemySpawned,
	GameClock,
	OwnedBy,
	Targeting,
	Threat,
	WaveState,
} from "./fixtures";

describe("contract: resources events and relations", () => {
	it("stores updates checks and removes resources", () => {
		const world = new World();

		world.setResource(GameClock, { elapsed: 0, fixedStep: 1 / 60 });
		world.updateResource(GameClock, (clock) => ({
			...clock,
			elapsed: clock.elapsed + clock.fixedStep,
		}));

		expect(world.hasResource(GameClock)).toBe(true);
		expect(world.getResource(GameClock)).toEqual({
			elapsed: 1 / 60,
			fixedStep: 1 / 60,
		});

		world.removeResource(GameClock);

		expect(world.hasResource(GameClock)).toBe(false);
		expect(world.getResource(GameClock)).toBeUndefined();
	});

	it("throws when updating a missing resource", () => {
		const world = new World();

		expect(() => {
			world.updateResource(WaveState, (state) => state);
		}).toThrow();
	});

	it("emits events in order and supports unsubscribe", () => {
		const world = new World();
		const calls: string[] = [];
		const stopDamage = world.on(DamageDealt, (event) => {
			calls.push(`damage:${event.source}:${event.target}:${event.amount}`);
		});
		const stopSpawn = world.on(EnemySpawned, (event) => {
			calls.push(`spawn:${event.entity}:${event.wave}`);
		});

		world.emit(EnemySpawned, { entity: 10, wave: 1 });
		world.emit(DamageDealt, { source: 1, target: 2, amount: 25 });

		stopDamage();

		world.emit(DamageDealt, { source: 1, target: 2, amount: 99 });
		world.emit(EnemySpawned, { entity: 11, wave: 1 });

		stopSpawn();
		world.emit(EnemySpawned, { entity: 12, wave: 2 });

		expect(calls).toEqual([
			"spawn:10:1",
			"damage:1:2:25",
			"spawn:11:1",
		]);
	});

	it("allows listeners to unsubscribe during event emission safely", () => {
		const world = new World();
		const calls: string[] = [];
		let stopFirst = () => undefined;

		stopFirst = world.on(DamageDealt, () => {
			calls.push("first");
			stopFirst();
		});

		world.on(DamageDealt, () => {
			calls.push("second");
		});

		world.emit(DamageDealt, { source: 1, target: 2, amount: 3 });
		world.emit(DamageDealt, { source: 1, target: 2, amount: 4 });

		expect(calls).toEqual(["first", "second", "second"]);
	});

	it("stores relation values and exposes directional lookup helpers", () => {
		const world = new World();
		const tower = world.createEntity();
		const player = world.createEntity();
		const firstEnemy = world.createEntity();
		const secondEnemy = world.createEntity();

		world.setRelation(tower, Targeting, firstEnemy, { priority: 10 });
		world.setRelation(tower, Targeting, secondEnemy, { priority: 5 });
		world.addRelation(tower, OwnedBy, player);
		world.setRelation(firstEnemy, Threat, tower, 0);

		expect(world.hasRelation(tower, Targeting, firstEnemy)).toBe(true);
		expect(world.getRelation(tower, Targeting, firstEnemy)).toEqual({
			priority: 10,
		});
		expect(world.getRelation(tower, OwnedBy, player)).toBe(true);
		expect(world.hasRelation(firstEnemy, Threat, tower)).toBe(true);
		expect(world.getRelation(firstEnemy, Threat, tower)).toBe(0);

		expect(world.targetsOf(tower, Targeting).sort()).toEqual(
			[firstEnemy, secondEnemy].sort(),
		);
		expect(world.sourcesOf(Targeting, firstEnemy)).toEqual([tower]);
		expect(world.queryRelation(Targeting, firstEnemy)).toEqual([
			{ source: tower, target: firstEnemy, value: { priority: 10 } },
		]);
	});

	it("removes individual relation edges", () => {
		const world = new World();
		const tower = world.createEntity();
		const enemy = world.createEntity();

		world.setRelation(tower, Targeting, enemy, { priority: 1 });
		world.removeRelation(tower, Targeting, enemy);

		expect(world.hasRelation(tower, Targeting, enemy)).toBe(false);
		expect(world.getRelation(tower, Targeting, enemy)).toBeUndefined();
		expect(world.targetsOf(tower, Targeting)).toEqual([]);
		expect(world.sourcesOf(Targeting, enemy)).toEqual([]);
	});

	it("removes all relation edges connected to a deleted entity", () => {
		const world = new World();
		const tower = world.createEntity();
		const owner = world.createEntity();
		const enemy = world.createEntity();

		world.setRelation(tower, Targeting, enemy, { priority: 1 });
		world.addRelation(enemy, OwnedBy, owner);
		world.setRelation(enemy, Threat, tower, 50);

		world.deleteEntity(enemy);

		expect(world.targetsOf(tower, Targeting)).toEqual([]);
		expect(world.sourcesOf(OwnedBy, owner)).toEqual([]);
		expect(world.queryRelation(Threat)).toEqual([]);
	});

	it("rejects relation writes with dead source or target entities", () => {
		const world = new World();
		const living = world.createEntity();
		const dead = world.createEntity();
		world.deleteEntity(dead);

		expect(() => {
			world.setRelation(dead, Targeting, living, { priority: 1 });
		}).toThrow();

		expect(() => {
			world.setRelation(living, Targeting, dead, { priority: 1 });
		}).toThrow();
	});
});

