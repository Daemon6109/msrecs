import type { System, SystemOptions, SystemTiming } from "./types";
import type { World } from "./world";

export class Scheduler {
	private readonly systems: System[] = [];
	private readonly phases: string[] = [];
	private readonly startedSystems = new Map<System, true>();
	private readonly timings = new Map<System, SystemTiming>();
	private fixedStepSeconds = 1 / 60;
	private fixedAccumulator = 0;

	public phase(name: string): this {
		if (this.phases.indexOf(name) < 0) {
			this.phases.push(name);
		}

		return this;
	}

	public add(system: System, options: SystemOptions = {}): this {
		this.systems.push({ ...system, ...options });
		return this;
	}

	public withFixedStep(seconds: number): this {
		if (seconds <= 0) {
			error("Scheduler fixed step must be greater than zero.");
		}

		this.fixedStepSeconds = seconds;
		return this;
	}

	public run(world: World): void {
		for (const phase of this.getPhaseOrder()) {
			for (const system of this.sortSystems(this.getSystemsForPhase(phase))) {
				this.startSystem(world, system);
				this.timeSystem(system, () => system.run(world));
			}
		}
	}

	public fixedUpdate(world: World, deltaTime: number): number {
		if (deltaTime < 0) {
			error("Scheduler deltaTime cannot be negative.");
		}

		let steps = 0;
		this.fixedAccumulator += deltaTime;

		while (this.fixedAccumulator >= this.fixedStepSeconds) {
			this.runFixedStep(world, this.fixedStepSeconds);
			this.fixedAccumulator -= this.fixedStepSeconds;
			world.advanceTick();
			steps++;
		}

		return steps;
	}

	public stop(world: World): void {
		for (const system of this.systems) {
			if (this.startedSystems.has(system)) {
				system.onStop?.(world);
			}
		}

		this.startedSystems.clear();
	}

	public clear(): void {
		this.systems.clear();
		this.startedSystems.clear();
		this.timings.clear();
	}

	public inspect(): SystemTiming[] {
		const timings: SystemTiming[] = [];

		this.timings.forEach((timing) => {
			timings.push(timing);
		});

		return timings;
	}

	private getPhaseOrder(): string[] {
		const order = [...this.phases];

		for (const system of this.systems) {
			const phase = system.phase ?? "default";

			if (order.indexOf(phase) < 0) {
				order.push(phase);
			}
		}

		return order;
	}

	private getSystemsForPhase(phase: string): System[] {
		const systems: System[] = [];

		for (const system of this.systems) {
			if ((system.phase ?? "default") === phase) {
				systems.push(system);
			}
		}

		return systems;
	}

	private sortSystems(systems: System[]): System[] {
		const remaining = [...systems];
		const sorted: System[] = [];

		while (remaining.size() > 0) {
			let progressed = false;

			for (let index = 0; index < remaining.size(); index++) {
				const system = remaining[index];

				if (system === undefined || this.isSystemBlocked(system, remaining)) {
					continue;
				}

				sorted.push(system);
				remaining.remove(index);
				progressed = true;
				break;
			}

			if (!progressed) {
				error("Scheduler dependency cycle detected.");
			}
		}

		return sorted;
	}

	private isSystemBlocked(system: System, remaining: System[]): boolean {
		for (const dependencyName of system.after ?? []) {
			if (this.hasNamedSystem(remaining, dependencyName, system)) {
				return true;
			}
		}

		if (system.name === undefined) {
			return false;
		}

		for (const other of remaining) {
			if (other === system) {
				continue;
			}

			if ((other.before ?? []).indexOf(system.name) >= 0) {
				return true;
			}
		}

		return false;
	}

	private hasNamedSystem(
		systems: System[],
		name: string,
		ignoredSystem: System,
	): boolean {
		for (const system of systems) {
			if (system !== ignoredSystem && system.name === name) {
				return true;
			}
		}

		return false;
	}

	private runFixedStep(world: World, deltaTime: number): void {
		for (const phase of this.getPhaseOrder()) {
			for (const system of this.sortSystems(this.getSystemsForPhase(phase))) {
				this.startSystem(world, system);

				if (system.onFixedUpdate !== undefined) {
					this.timeSystem(system, () =>
						system.onFixedUpdate?.(world, deltaTime),
					);
				}
			}
		}
	}

	private startSystem(world: World, system: System): void {
		if (this.startedSystems.has(system)) {
			return;
		}

		this.startedSystems.set(system, true);
		system.onStart?.(world);
	}

	private timeSystem(system: System, callback: () => void): void {
		const startedAt = os.clock();
		callback();
		const elapsed = os.clock() - startedAt;
		const previous = this.timings.get(system);
		const runs = (previous?.runs ?? 0) + 1;
		const totalSeconds = (previous?.totalSeconds ?? 0) + elapsed;

		this.timings.set(system, {
			name: system.name ?? "anonymous",
			phase: system.phase ?? "default",
			runs,
			totalSeconds,
			lastSeconds: elapsed,
		});
	}
}
