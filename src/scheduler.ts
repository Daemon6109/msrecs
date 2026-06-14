import type { System, SystemOptions } from "./types";
import type { World } from "./world";

export class Scheduler {
	private readonly systems: System[] = [];
	private readonly phases: string[] = [];

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

	public run(world: World): void {
		for (const phase of this.getPhaseOrder()) {
			for (const system of this.sortSystems(this.getSystemsForPhase(phase))) {
				system.run(world);
			}
		}
	}

	public clear(): void {
		this.systems.clear();
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
}
