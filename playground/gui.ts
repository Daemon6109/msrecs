import {
	defineComponent,
	defineResource,
	defineSystem,
	type Entity,
	Scheduler,
	World,
} from "../src";

type TowerKind = "Scout" | "Cannon" | "Ranger";

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
	kind: TowerKind;
	range: number;
	damage: number;
	cooldown: number;
	remainingCooldown: number;
	level: number;
	cost: number;
	kills: number;
}

interface ShotData {
	from: Position;
	to: Position;
	age: number;
	lifetime: number;
}

interface GameState {
	lives: number;
	gold: number;
	wave: number;
	spawned: number;
	killed: number;
	escaped: number;
	spawnTimer: number;
	running: boolean;
	message: string;
}

interface TowerTemplate {
	range: number;
	damage: number;
	cooldown: number;
	cost: number;
	color: string;
}

installRobloxRuntime();

const Position = defineComponent<Position>("Position");
const Enemy = defineComponent<EnemyData>("Enemy");
const Health = defineComponent<Health>("Health");
const Tower = defineComponent<TowerData>("Tower");
const Shot = defineComponent<ShotData>("Shot");
const Game = defineResource<GameState>("Game");

const canvas = document.getElementById("game");

if (!(canvas instanceof HTMLCanvasElement)) {
	error("Missing game canvas.");
}

const context = canvas.getContext("2d");

if (context === null) {
	error("Missing 2D canvas context.");
}

const towerButtons = [
	...document.querySelectorAll<HTMLButtonElement>("[data-tower]"),
];
const startButton = getButton("start");
const upgradeButton = getButton("upgrade");
const resetButton = getButton("reset");
const selectedText = getElement("selected");
const hintText = getElement("hint");
const logText = getElement("log");
const livesText = getElement("lives");
const goldText = getElement("gold");
const waveText = getElement("wave");
const killsText = getElement("kills");

const width = canvas.width;
const height = canvas.height;
const pathY = height * 0.52;
const baseX = width - 72;
const buildPads: Position[] = [
	{ x: 210, y: pathY - 125 },
	{ x: 355, y: pathY + 125 },
	{ x: 520, y: pathY - 120 },
	{ x: 690, y: pathY + 125 },
	{ x: 850, y: pathY - 118 },
];
const templates: Record<TowerKind, TowerTemplate> = {
	Scout: { range: 135, damage: 15, cooldown: 0.45, cost: 45, color: "#8bd450" },
	Cannon: {
		range: 155,
		damage: 38,
		cooldown: 1.05,
		cost: 75,
		color: "#f0b44c",
	},
	Ranger: { range: 190, damage: 24, cooldown: 0.7, cost: 95, color: "#6ab6ff" },
};

let world = createWorld();
let scheduler = createScheduler();
let selectedTowerKind: TowerKind = "Scout";
let selectedTowerEntity: Entity | undefined;
let lastTime = performance.now();

for (const button of towerButtons) {
	button.addEventListener("click", () => {
		const tower = button.dataset.tower;

		if (!isTowerKind(tower)) {
			return;
		}

		selectedTowerKind = tower;
		selectedTowerEntity = undefined;
		updateButtons();
	});
}

startButton.addEventListener("click", () => {
	const game = world.getResource(Game);

	if (game === undefined) {
		return;
	}

	if (game.running) {
		game.message = "Wave already running.";
		return;
	}

	game.running = true;
	game.message = `Wave ${game.wave} started.`;
});

upgradeButton.addEventListener("click", () => {
	if (selectedTowerEntity === undefined) {
		setMessage("Select a placed tower first.");
		return;
	}

	const tower = world.get(selectedTowerEntity, Tower);
	const game = world.getResource(Game);

	if (tower === undefined || game === undefined) {
		return;
	}

	const cost = tower.cost + tower.level * 45;

	if (game.gold < cost) {
		setMessage(`Need ${cost} gold to upgrade.`);
		return;
	}

	game.gold -= cost;
	tower.level++;
	tower.damage = Math.floor(tower.damage * 1.28);
	tower.range += 14;
	tower.cooldown = Math.max(0.18, tower.cooldown * 0.92);
	setMessage(`${tower.kind} upgraded to level ${tower.level}.`);
});

resetButton.addEventListener("click", () => {
	world = createWorld();
	scheduler = createScheduler();
	selectedTowerEntity = undefined;
	setMessage("Reset.");
});

canvas.addEventListener("click", (event) => {
	const rect = canvas.getBoundingClientRect();
	const x = ((event.clientX - rect.left) / rect.width) * width;
	const y = ((event.clientY - rect.top) / rect.height) * height;
	const tower = findTowerAt(x, y);

	if (tower !== undefined) {
		selectedTowerEntity = tower;
		updateButtons();
		return;
	}

	const pad = findBuildPadAt(x, y);

	if (pad === undefined) {
		selectedTowerEntity = undefined;
		updateButtons();
		return;
	}

	if (isPadOccupied(pad)) {
		setMessage("That build pad is occupied.");
		return;
	}

	placeTower(pad, selectedTowerKind);
});

requestAnimationFrame(loop);

function installRobloxRuntime(): void {
	const globals = globalThis as Record<string, unknown>;

	globals.error ??= (message: string): never => {
		throw new Error(message);
	};
	globals.typeOf ??= (value: unknown): string => {
		if (value === undefined || value === null) {
			return "nil";
		}

		if (Array.isArray(value) || typeof value === "object") {
			return "table";
		}

		return typeof value;
	};
	globals.os ??= {
		clock: () => performance.now() / 1000,
	};

	const arrayPrototype = Array.prototype as unknown as Record<string, unknown>;

	arrayPrototype.clear ??= function clearArray(this: unknown[]) {
		this.splice(0);
	};
	arrayPrototype.size ??= function getArraySize(this: unknown[]) {
		return this.length;
	};
	arrayPrototype.remove ??= function removeArrayValue(
		this: unknown[],
		index: number,
	) {
		this.splice(index, 1);
	};

	const mapSizeDescriptor = Object.getOwnPropertyDescriptor(
		Map.prototype,
		"size",
	);

	if (mapSizeDescriptor !== undefined) {
		Object.defineProperty(Map.prototype, "size", {
			get() {
				const count = mapSizeDescriptor.get?.call(this) ?? 0;
				const size = (() => count) as unknown as number;

				Object.defineProperty(size, Symbol.toPrimitive, {
					value: () => count,
					configurable: true,
				});

				return size;
			},
			configurable: true,
			enumerable: false,
		});
	}
}

function createWorld(): World {
	const nextWorld = new World();

	nextWorld.setResource(Game, {
		lives: 20,
		gold: 160,
		wave: 1,
		spawned: 0,
		killed: 0,
		escaped: 0,
		spawnTimer: 0,
		running: false,
		message: "Place towers, then start the wave.",
	});

	return nextWorld;
}

function createScheduler(): Scheduler {
	return new Scheduler()
		.withFixedStep(1 / 30)
		.phase("spawn")
		.phase("move")
		.phase("combat")
		.phase("cleanup")
		.add(
			defineSystem("spawn", () => undefined, {
				phase: "spawn",
				onFixedUpdate: (runningWorld, deltaTime) => {
					const game = runningWorld.getResource(Game);

					if (game === undefined || !game.running) {
						return;
					}

					const count = 9 + game.wave * 3;

					if (game.spawned >= count) {
						if (runningWorld.query(Enemy).size() === 0) {
							game.running = false;
							game.wave++;
							game.spawned = 0;
							game.gold += 40;
							game.message = "Wave cleared. Build or upgrade before starting.";
						}

						return;
					}

					game.spawnTimer -= deltaTime;

					if (game.spawnTimer > 0) {
						return;
					}

					spawnEnemy(runningWorld, game.wave, game.spawned);
					game.spawned++;
					game.spawnTimer = Math.max(0.22, 0.58 - game.wave * 0.04);
				},
			}),
		)
		.add(
			defineSystem("move", () => undefined, {
				phase: "move",
				onFixedUpdate: (runningWorld, deltaTime) => {
					const game = runningWorld.getResource(Game);

					if (game === undefined) {
						return;
					}

					runningWorld
						.queryObject([Position, Enemy] as const)
						.each((enemy, position, data) => {
							position.x += data.speed * deltaTime;

							if (position.x >= baseX) {
								game.lives--;
								game.escaped++;
								runningWorld.deleteEntity(enemy);
								game.message = "An enemy reached the base.";
							}
						});
				},
			}),
		)
		.add(
			defineSystem("combat", () => undefined, {
				phase: "combat",
				onFixedUpdate: (runningWorld, deltaTime) => {
					const game = runningWorld.getResource(Game);

					if (game === undefined) {
						return;
					}

					const enemies = runningWorld.queryObject([
						Position,
						Enemy,
						Health,
					] as const);

					runningWorld
						.queryObject([Position, Tower] as const)
						.each((_towerEntity, towerPosition, tower) => {
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
							let farthest = -Infinity;

							enemies.each((enemy, enemyPosition, _enemyData, health) => {
								if (
									distanceSquared(towerPosition, enemyPosition) >
									tower.range ** 2
								) {
									return;
								}

								if (enemyPosition.x > farthest) {
									target = enemy;
									targetPosition = enemyPosition;
									targetHealth = health;
									farthest = enemyPosition.x;
								}
							});

							if (
								target === 0 ||
								targetPosition === undefined ||
								targetHealth === undefined
							) {
								return;
							}

							spawnShot(
								runningWorld,
								towerPosition,
								targetPosition,
								tower.kind,
							);
							targetHealth.current -= tower.damage;
							tower.remainingCooldown = tower.cooldown;

							if (targetHealth.current <= 0) {
								const enemyData = runningWorld.get(target, Enemy);
								game.gold += enemyData?.reward ?? 0;
								game.killed++;
								tower.kills++;
								runningWorld.deleteEntity(target);
							}
						});
				},
			}),
		)
		.add(
			defineSystem("shots", () => undefined, {
				phase: "cleanup",
				onFixedUpdate: (runningWorld, deltaTime) => {
					runningWorld.queryObject([Shot] as const).each((shot, data) => {
						data.age += deltaTime;

						if (data.age >= data.lifetime) {
							runningWorld.deleteEntity(shot);
						}
					});
				},
			}),
		);
}

function spawnEnemy(runningWorld: World, wave: number, index: number): void {
	const commands = runningWorld.commands();
	const enemy = commands.spawn();
	const health = 40 + wave * 18 + Math.floor(index / 4) * 8;

	commands
		.set(enemy, Position, { x: 42, y: pathY })
		.set(enemy, Enemy, {
			speed: 52 + wave * 8 + index * 0.8,
			reward: 8 + wave * 2,
		})
		.set(enemy, Health, { current: health, max: health })
		.flush(runningWorld);
}

function spawnShot(
	runningWorld: World,
	from: Position,
	to: Position,
	kind: TowerKind,
): void {
	const shot = runningWorld.createEntity();
	const template = templates[kind];

	runningWorld.set(shot, Shot, {
		from: { x: from.x, y: from.y },
		to: { x: to.x, y: to.y },
		age: 0,
		lifetime: Math.max(0.08, template.cooldown * 0.22),
	});
}

function placeTower(position: Position, kind: TowerKind): void {
	const game = world.getResource(Game);
	const template = templates[kind];

	if (game === undefined) {
		return;
	}

	if (game.gold < template.cost) {
		setMessage(`Need ${template.cost} gold for ${kind}.`);
		return;
	}

	game.gold -= template.cost;

	const tower = world.createEntity();
	world.set(tower, Position, { x: position.x, y: position.y });
	world.set(tower, Tower, {
		kind,
		range: template.range,
		damage: template.damage,
		cooldown: template.cooldown,
		remainingCooldown: 0,
		level: 1,
		cost: template.cost,
		kills: 0,
	});

	selectedTowerEntity = tower;
	setMessage(`${kind} placed.`);
	updateButtons();
}

function loop(now: number): void {
	const deltaTime = Math.min(0.1, (now - lastTime) / 1000);
	lastTime = now;

	scheduler.fixedUpdate(world, deltaTime);
	draw();
	updateHud();
	requestAnimationFrame(loop);
}

function draw(): void {
	context.clearRect(0, 0, width, height);
	context.fillStyle = "#182027";
	context.fillRect(0, 0, width, height);
	drawPath();
	drawPads();
	drawShots();
	drawTowers();
	drawEnemies();
	drawBase();
}

function drawPath(): void {
	context.strokeStyle = "#485767";
	context.lineWidth = 42;
	context.lineCap = "round";
	context.beginPath();
	context.moveTo(42, pathY);
	context.lineTo(baseX, pathY);
	context.stroke();

	context.strokeStyle = "#2b3641";
	context.lineWidth = 2;
	context.setLineDash([12, 10]);
	context.beginPath();
	context.moveTo(42, pathY);
	context.lineTo(baseX, pathY);
	context.stroke();
	context.setLineDash([]);
}

function drawPads(): void {
	for (const pad of buildPads) {
		const occupied = isPadOccupied(pad);
		context.fillStyle = occupied ? "#29343e" : "#1d2831";
		context.strokeStyle = occupied ? "#4a5967" : "#566879";
		context.lineWidth = 2;
		context.beginPath();
		context.arc(pad.x, pad.y, 22, 0, Math.PI * 2);
		context.fill();
		context.stroke();
	}
}

function drawTowers(): void {
	world
		.queryObject([Position, Tower] as const)
		.each((entity, position, tower) => {
			const template = templates[tower.kind];
			const selected = selectedTowerEntity === entity;

			if (selected) {
				context.strokeStyle = "rgba(255, 255, 255, 0.22)";
				context.lineWidth = 2;
				context.beginPath();
				context.arc(position.x, position.y, tower.range, 0, Math.PI * 2);
				context.stroke();
			}

			context.fillStyle = template.color;
			context.strokeStyle = selected ? "#ffffff" : "#111820";
			context.lineWidth = selected ? 4 : 2;
			context.beginPath();
			context.arc(position.x, position.y, 18 + tower.level * 2, 0, Math.PI * 2);
			context.fill();
			context.stroke();

			context.fillStyle = "#101418";
			context.font = "700 12px system-ui";
			context.textAlign = "center";
			context.textBaseline = "middle";
			context.fillText(String(tower.level), position.x, position.y);
		});
}

function drawEnemies(): void {
	world
		.queryObject([Position, Enemy, Health] as const)
		.each((_enemy, position, _data, health) => {
			const healthRatio = Math.max(0, health.current / health.max);

			context.fillStyle = healthRatio > 0.5 ? "#f25f5c" : "#f0b44c";
			context.beginPath();
			context.arc(position.x, position.y, 13, 0, Math.PI * 2);
			context.fill();

			context.fillStyle = "#111820";
			context.fillRect(position.x - 16, position.y - 25, 32, 4);
			context.fillStyle = "#8bd450";
			context.fillRect(position.x - 16, position.y - 25, 32 * healthRatio, 4);
		});
}

function drawShots(): void {
	world.queryObject([Shot] as const).each((_shotEntity, shot) => {
		const alpha = Math.min(1, shot.age / shot.lifetime);
		const x = shot.from.x + (shot.to.x - shot.from.x) * alpha;
		const y = shot.from.y + (shot.to.y - shot.from.y) * alpha;

		context.strokeStyle = "rgba(255, 255, 255, 0.45)";
		context.lineWidth = 2;
		context.beginPath();
		context.moveTo(shot.from.x, shot.from.y);
		context.lineTo(x, y);
		context.stroke();

		context.fillStyle = "#ffffff";
		context.beginPath();
		context.arc(x, y, 4, 0, Math.PI * 2);
		context.fill();
	});
}

function drawBase(): void {
	context.fillStyle = "#d94f70";
	context.fillRect(baseX - 16, pathY - 42, 32, 84);
	context.fillStyle = "#edf2f7";
	context.font = "700 14px system-ui";
	context.textAlign = "center";
	context.fillText("BASE", baseX, pathY - 52);
}

function updateHud(): void {
	const game = world.getResource(Game);

	if (game === undefined) {
		return;
	}

	livesText.textContent = String(game.lives);
	goldText.textContent = String(game.gold);
	waveText.textContent = String(game.wave);
	killsText.textContent = String(game.killed);
	logText.textContent = game.message;
	hintText.textContent = game.running
		? "Wave running. Upgrade during combat or wait for the clear bonus."
		: "Select a tower, click a build pad, start the wave.";

	const selectedTower =
		selectedTowerEntity === undefined
			? undefined
			: world.get(selectedTowerEntity, Tower);

	selectedText.textContent =
		selectedTower === undefined
			? `Build mode: ${selectedTowerKind}`
			: `${selectedTower.kind} level ${selectedTower.level}, damage ${selectedTower.damage}, range ${selectedTower.range}, kills ${selectedTower.kills}`;

	updateButtons();
}

function updateButtons(): void {
	for (const button of towerButtons) {
		button.dataset.active = String(button.dataset.tower === selectedTowerKind);
	}
}

function findBuildPadAt(x: number, y: number): Position | undefined {
	for (const pad of buildPads) {
		if (distanceSquared(pad, { x, y }) <= 28 ** 2) {
			return pad;
		}
	}

	return undefined;
}

function findTowerAt(x: number, y: number): Entity | undefined {
	let found: Entity | undefined;

	world.queryObject([Position, Tower] as const).each((entity, position) => {
		if (found === undefined && distanceSquared(position, { x, y }) <= 26 ** 2) {
			found = entity;
		}
	});

	return found;
}

function isPadOccupied(pad: Position): boolean {
	let occupied = false;

	world.queryObject([Position, Tower] as const).each((_entity, position) => {
		if (distanceSquared(position, pad) <= 6 ** 2) {
			occupied = true;
		}
	});

	return occupied;
}

function setMessage(message: string): void {
	const game = world.getResource(Game);

	if (game !== undefined) {
		game.message = message;
	}
}

function getButton(id: string): HTMLButtonElement {
	const element = document.getElementById(id);

	if (!(element instanceof HTMLButtonElement)) {
		error(`Missing button: ${id}`);
	}

	return element;
}

function getElement(id: string): HTMLElement {
	const element = document.getElementById(id);

	if (element === null) {
		error(`Missing element: ${id}`);
	}

	return element;
}

function isTowerKind(value: string | undefined): value is TowerKind {
	return value === "Scout" || value === "Cannon" || value === "Ranger";
}

function distanceSquared(a: Position, b: Position): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;

	return dx * dx + dy * dy;
}
