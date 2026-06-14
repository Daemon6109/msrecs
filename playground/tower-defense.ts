import "../tests/shims/roblox-globals";
import {
	defineComponent,
	defineResource,
	defineSystem,
	Scheduler,
	World,
} from "../src";

interface Position {
	x: number;
	y: number;
}

interface EnemyData {
	speed: number;
	reward: number;
}

interface Health {
	current: number;
	max: number;
}

interface TowerData {
	range: number;
	damage: number;
	cooldown: number;
	remainingCooldown: number;
}

interface GameState {
	time: number;
	lives: number;
	gold: number;
	wave: number;
	spawned: number;
	killed: number;
	escaped: number;
	spawnTimer: number;
}

const Position = defineComponent<Position>("Position");
const Enemy = defineComponent<EnemyData>("Enemy");
const Health = defineComponent<Health>("Health");
const Tower = defineComponent<TowerData>("Tower");
const Game = defineResource<GameState>("Game");

const PathStart = 0;
const BaseX = 100;
const EnemyCount = 14;

function setupWorld(): World {
	const world = new World();

	world.setResource(Game, {
		time: 0,
		lives: 10,
		gold: 100,
		wave: 1,
		spawned: 0,
		killed: 0,
		escaped: 0,
		spawnTimer: 0,
	});

	spawnTower(world, 28, 0, 26, 18, 0.6);
	spawnTower(world, 58, 0, 22, 30, 0.9);

	return world;
}

function spawnTower(
	world: World,
	x: number,
	y: number,
	range: number,
	damage: number,
	cooldown: number,
): void {
	const tower = world.createEntity();

	world.set(tower, Position, { x, y });
	world.set(tower, Tower, {
		range,
		damage,
		cooldown,
		remainingCooldown: 0,
	});
}

function spawnEnemy(world: World, index: number): void {
	const commands = world.commands();
	const enemy = commands.spawn();
	const bonusHealth = Math.floor(index / 4) * 10;

	commands
		.set(enemy, Position, { x: PathStart, y: 0 })
		.set(enemy, Enemy, {
			speed: 7 + index * 0.15,
			reward: 10,
		})
		.set(enemy, Health, {
			current: 45 + bonusHealth,
			max: 45 + bonusHealth,
		})
		.flush(world);
}

function distanceSquared(a: Position, b: Position): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;

	return dx * dx + dy * dy;
}

function createScheduler(): Scheduler {
	return new Scheduler()
		.withFixedStep(0.1)
		.phase("spawn")
		.phase("simulate")
		.phase("combat")
		.phase("cleanup")
		.add(
			defineSystem("spawn-wave", () => undefined, {
				phase: "spawn",
				onFixedUpdate: (world, deltaTime) => {
					const game = world.getResource(Game);

					if (game === undefined || game.spawned >= EnemyCount) {
						return;
					}

					game.spawnTimer -= deltaTime;

					if (game.spawnTimer > 0) {
						return;
					}

					spawnEnemy(world, game.spawned);
					game.spawned++;
					game.spawnTimer = 0.65;
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
						.each((_tower, towerPosition, tower) => {
							tower.remainingCooldown = Math.max(
								0,
								tower.remainingCooldown - deltaTime,
							);

							if (tower.remainingCooldown > 0) {
								return;
							}

							let target = 0;
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
									targetHealth = health;
									farthestProgress = enemyPosition.x;
								}
							});

							if (target === 0 || targetHealth === undefined) {
								return;
							}

							targetHealth.current -= tower.damage;
							tower.remainingCooldown = tower.cooldown;

							if (targetHealth.current <= 0) {
								const enemyData = world.get(target, Enemy);
								game.gold += enemyData?.reward ?? 0;
								game.killed++;
								world.deleteEntity(target);
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

function printState(world: World): void {
	const game = world.getResource(Game);

	if (game === undefined) {
		return;
	}

	const aliveEnemies = world.query(Enemy).size();
	const firstEnemy = world.queryObject([Position, Enemy, Health]).first();
	const firstEnemyPosition =
		firstEnemy === undefined ? undefined : world.get(firstEnemy, Position);

	const progress =
		firstEnemyPosition === undefined
			? "none"
			: `${firstEnemyPosition.x.toFixed(1)}/${BaseX}`;

	console.log(
		`time=${game.time.toFixed(1)} wave=${game.wave} lives=${game.lives} gold=${game.gold} spawned=${game.spawned}/${EnemyCount} alive=${aliveEnemies} killed=${game.killed} escaped=${game.escaped} lead=${progress}`,
	);
}

function run(): void {
	const world = setupWorld();
	const scheduler = createScheduler();

	console.log("MSRECS tower defense playground");
	printState(world);

	for (let frame = 0; frame < 220; frame++) {
		const game = world.getResource(Game);

		if (game === undefined || game.lives <= 0) {
			break;
		}

		if (game.spawned >= EnemyCount && world.query(Enemy).size() === 0) {
			break;
		}

		scheduler.fixedUpdate(world, 0.1);

		if (frame % 5 === 0) {
			printState(world);
		}
	}

	printState(world);
	console.log("system timings", scheduler.inspect());
}

run();
