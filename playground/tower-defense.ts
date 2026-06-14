import "../tests/shims/roblox-globals";
import {
	defineComponent,
	defineRelation,
	defineResource,
	defineSystem,
	Scheduler,
	type SystemTiming,
	World,
} from "../src";

interface Position {
	x: number;
	y: number;
}

interface EnemyData {
	speed: number;
	reward: number;
	wave: number;
}

interface Health {
	current: number;
	max: number;
}

interface TowerData {
	name: string;
	range: number;
	damage: number;
	cooldown: number;
	remainingCooldown: number;
	kills: number;
}

interface ShotData {
	from: Position;
	to: Position;
	age: number;
	lifetime: number;
}

interface WaveData {
	count: number;
	health: number;
	speed: number;
	reward: number;
	spawnInterval: number;
}

interface GameState {
	time: number;
	lives: number;
	gold: number;
	waveIndex: number;
	waveSpawned: number;
	killed: number;
	escaped: number;
	spawnTimer: number;
	finished: boolean;
}

export interface SimulationResult {
	frames: string[];
	game: GameState;
	timings: SystemTiming[];
}

export const Position = defineComponent<Position>("Position");
export const Enemy = defineComponent<EnemyData>("Enemy");
export const Health = defineComponent<Health>("Health");
export const Tower = defineComponent<TowerData>("Tower");
export const Shot = defineComponent<ShotData>("Shot");
export const Game = defineResource<GameState>("Game");
export const Targeting = defineRelation<{ acquiredAt: number }>("Targeting");

const MapWidth = 72;
const MapHeight = 15;
const PathY = 7;
const PathStart = 0;
const BaseX = MapWidth - 2;
const FixedStep = 0.1;
const RenderEveryFrames = 20;
const MaxFrames = 700;

const Waves: WaveData[] = [
	{ count: 10, health: 45, speed: 7.2, reward: 10, spawnInterval: 0.65 },
	{ count: 14, health: 70, speed: 8.4, reward: 13, spawnInterval: 0.55 },
	{ count: 18, health: 105, speed: 9.2, reward: 16, spawnInterval: 0.48 },
];

export function setupWorld(): World {
	const world = new World();

	world.setResource(Game, {
		time: 0,
		lives: 20,
		gold: 130,
		waveIndex: 0,
		waveSpawned: 0,
		killed: 0,
		escaped: 0,
		spawnTimer: 0,
		finished: false,
	});

	spawnTower(world, "Scout", 18, PathY - 3, 18, 16, 0.55);
	spawnTower(world, "Cannon", 37, PathY + 3, 20, 34, 1.05);
	spawnTower(world, "Ranger", 56, PathY - 2, 24, 24, 0.75);

	return world;
}

function spawnTower(
	world: World,
	name: string,
	x: number,
	y: number,
	range: number,
	damage: number,
	cooldown: number,
): void {
	const tower = world.createEntity();

	world.set(tower, Position, { x, y });
	world.set(tower, Tower, {
		name,
		range,
		damage,
		cooldown,
		remainingCooldown: 0,
		kills: 0,
	});
}

function spawnEnemy(
	world: World,
	waveIndex: number,
	spawnedInWave: number,
): void {
	const wave = Waves[waveIndex];

	if (wave === undefined) {
		return;
	}

	const commands = world.commands();
	const enemy = commands.spawn();
	const health = wave.health + Math.floor(spawnedInWave / 5) * 8;

	commands
		.set(enemy, Position, { x: PathStart, y: PathY })
		.set(enemy, Enemy, {
			speed: wave.speed + spawnedInWave * 0.05,
			reward: wave.reward,
			wave: waveIndex + 1,
		})
		.set(enemy, Health, {
			current: health,
			max: health,
		})
		.flush(world);
}

function spawnShot(world: World, from: Position, to: Position): void {
	const shot = world.createEntity();

	world.set(shot, Shot, {
		from: { x: from.x, y: from.y },
		to: { x: to.x, y: to.y },
		age: 0,
		lifetime: 0.22,
	});
}

function distanceSquared(a: Position, b: Position): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;

	return dx * dx + dy * dy;
}

export function createScheduler(): Scheduler {
	return new Scheduler()
		.withFixedStep(FixedStep)
		.phase("spawn")
		.phase("simulate")
		.phase("combat")
		.phase("cleanup")
		.add(
			defineSystem("spawn-waves", () => undefined, {
				phase: "spawn",
				onFixedUpdate: (world, deltaTime) => {
					const game = world.getResource(Game);

					if (game === undefined || game.finished) {
						return;
					}

					const wave = Waves[game.waveIndex];

					if (wave === undefined) {
						if (world.query(Enemy).size() === 0) {
							game.finished = true;
						}

						return;
					}

					if (game.waveSpawned >= wave.count) {
						if (world.query(Enemy).size() === 0) {
							game.waveIndex++;
							game.waveSpawned = 0;
							game.spawnTimer = 1.5;
						}

						return;
					}

					game.spawnTimer -= deltaTime;

					if (game.spawnTimer > 0) {
						return;
					}

					spawnEnemy(world, game.waveIndex, game.waveSpawned);
					game.waveSpawned++;
					game.spawnTimer = wave.spawnInterval;
				},
			}),
		)
		.add(
			defineSystem("move-enemies", () => undefined, {
				phase: "simulate",
				onFixedUpdate: (world, deltaTime) => {
					const game = world.getResource(Game);

					if (game === undefined) {
						return;
					}

					world.queryObject([Position, Enemy]).each((enemy, position, data) => {
						position.x += data.speed * deltaTime;

						if (position.x >= BaseX) {
							game.lives--;
							game.escaped++;
							world.deleteEntity(enemy);
						}
					});
				},
			}),
		)
		.add(
			defineSystem("tower-targeting", () => undefined, {
				phase: "combat",
				onFixedUpdate: (world, deltaTime) => {
					const game = world.getResource(Game);

					if (game === undefined) {
						return;
					}

					const enemies = world.queryObject([Position, Enemy, Health]);

					world
						.queryObject([Position, Tower])
						.each((towerEntity, towerPosition, tower) => {
							tower.remainingCooldown = Math.max(
								0,
								tower.remainingCooldown - deltaTime,
							);

							if (tower.remainingCooldown > 0) {
								return;
							}

							let target = 0;
							let targetPosition: Position | undefined;
							let targetHealth: Health | undefined;
							let farthestProgress = -Infinity;

							enemies.each((enemy, enemyPosition, _enemyData, health) => {
								if (
									distanceSquared(towerPosition, enemyPosition) >
									tower.range * tower.range
								) {
									return;
								}

								if (enemyPosition.x > farthestProgress) {
									target = enemy;
									targetPosition = enemyPosition;
									targetHealth = health;
									farthestProgress = enemyPosition.x;
								}
							});

							if (
								target === 0 ||
								targetPosition === undefined ||
								targetHealth === undefined
							) {
								return;
							}

							world.setRelation(towerEntity, Targeting, target, {
								acquiredAt: game.time,
							});
							spawnShot(world, towerPosition, targetPosition);
							targetHealth.current -= tower.damage;
							tower.remainingCooldown = tower.cooldown;

							if (targetHealth.current <= 0) {
								const enemyData = world.get(target, Enemy);
								game.gold += enemyData?.reward ?? 0;
								game.killed++;
								tower.kills++;
								world.deleteEntity(target);
							}
						});
				},
			}),
		)
		.add(
			defineSystem("shot-lifetime", () => undefined, {
				phase: "cleanup",
				onFixedUpdate: (world, deltaTime) => {
					world.queryObject([Shot]).each((shotEntity, shot) => {
						shot.age += deltaTime;

						if (shot.age >= shot.lifetime) {
							world.deleteEntity(shotEntity);
						}
					});
				},
			}),
		)
		.add(
			defineSystem("advance-game-time", () => undefined, {
				phase: "cleanup",
				onFixedUpdate: (world, deltaTime) => {
					const game = world.getResource(Game);

					if (game !== undefined) {
						game.time += deltaTime;
					}
				},
			}),
		);
}

export function render(world: World): string {
	const grid: string[][] = [];

	for (let y = 0; y < MapHeight; y++) {
		const row: string[] = [];

		for (let x = 0; x < MapWidth; x++) {
			row.push(y === PathY ? "." : " ");
		}

		grid.push(row);
	}

	plot(grid, BaseX, PathY, "B");

	world.queryObject([Shot]).each((_shotEntity, shot) => {
		const alpha = Math.min(1, shot.age / shot.lifetime);
		const x = shot.from.x + (shot.to.x - shot.from.x) * alpha;
		const y = shot.from.y + (shot.to.y - shot.from.y) * alpha;
		plot(grid, x, y, "*");
	});

	world.queryObject([Position, Tower]).each((_towerEntity, position) => {
		plot(grid, position.x, position.y, "T");
	});

	world
		.queryObject([Position, Enemy, Health])
		.each((_enemy, position, _data, health) => {
			const symbol = health.current / health.max > 0.5 ? "E" : "e";
			plot(grid, position.x, position.y, symbol);
		});

	const lines: string[] = [];

	for (const row of grid) {
		lines.push(`|${row.join("")}|`);
	}

	lines.push(renderStats(world));
	lines.push(renderTowers(world));

	return lines.join("\n");
}

function plot(grid: string[][], x: number, y: number, symbol: string): void {
	const gridX = Math.floor(x);
	const gridY = Math.floor(y);

	if (gridY < 0 || gridY >= grid.size()) {
		return;
	}

	const row = grid[gridY];

	if (row === undefined || gridX < 0 || gridX >= row.size()) {
		return;
	}

	row[gridX] = symbol;
}

function renderStats(world: World): string {
	const game = world.getResource(Game);

	if (game === undefined) {
		return "missing game state";
	}

	const activeWave = Waves[game.waveIndex];
	const waveText =
		activeWave === undefined
			? "complete"
			: `${game.waveIndex + 1}/${Waves.size()} ${game.waveSpawned}/${activeWave.count}`;

	return [
		`time=${game.time.toFixed(1)}`,
		`wave=${waveText}`,
		`lives=${game.lives}`,
		`gold=${game.gold}`,
		`alive=${world.query(Enemy).size()}`,
		`killed=${game.killed}`,
		`escaped=${game.escaped}`,
	].join("  ");
}

function renderTowers(world: World): string {
	const towers: string[] = [];

	world.queryObject([Tower]).each((_towerEntity, tower) => {
		towers.push(
			`${tower.name}:dmg=${tower.damage}:range=${tower.range}:kills=${tower.kills}`,
		);
	});

	return towers.join("  ");
}

function shouldStop(world: World): boolean {
	const game = world.getResource(Game);

	if (game === undefined) {
		return true;
	}

	return game.lives <= 0 || game.finished;
}

export function simulateTowerDefense(): SimulationResult {
	const world = setupWorld();
	const scheduler = createScheduler();
	const frames: string[] = [];

	frames.push("MSRECS tower defense playground");
	frames.push(render(world));

	for (let frame = 0; frame < MaxFrames; frame++) {
		if (shouldStop(world)) {
			break;
		}

		scheduler.fixedUpdate(world, FixedStep);

		if (frame % RenderEveryFrames === 0) {
			frames.push(render(world));
		}
	}

	frames.push(render(world));
	const game = world.getResource(Game);

	if (game === undefined) {
		error("Missing game state after simulation.");
	}

	return {
		frames,
		game: { ...game },
		timings: scheduler.inspect(),
	};
}

function run(): void {
	const result = simulateTowerDefense();

	result.frames.push(
		`system timings: ${JSON.stringify(result.timings, undefined, 2)}`,
	);

	console.log(result.frames.join("\n\n"));
}

if (import.meta.main) {
	run();
}
