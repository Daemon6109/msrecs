import type { ComponentType, Entity } from "./types";

interface MutableEntityRecord {
	alive: boolean;
	generation: number;
}

interface ArchetypeStore {
	componentIds: string[];
	entities: Entity[];
	entityToIndex: Map<Entity, number>;
}

interface ComponentStore {
	entities: Entity[];
	entityToIndex: Map<Entity, number>;
	values: Map<Entity, unknown>;
}

export class World {
	private nextEntityId = 1;
	private readonly records = new Map<Entity, MutableEntityRecord>();
	private readonly archetypes = new Map<string, ArchetypeStore>();
	private readonly components = new Map<string, ComponentStore>();

	public createEntity(): Entity {
		const entity = this.nextEntityId++;

		this.records.set(entity, {
			alive: true,
			generation: 0,
		});
		return entity;
	}

	public isAlive(entity: Entity): boolean {
		return this.records.get(entity)?.alive === true;
	}

	private getLivingEntities(): Entity[] {
		const entities: Entity[] = [];

		this.records.forEach((record, entity) => {
			if (record.alive) {
				entities.push(entity);
			}
		});

		return entities;
	}

	private archetypeMatches(
		archetypeStore: ArchetypeStore,
		componentTypes: readonly ComponentType<unknown>[],
	): boolean {
		for (const componentType of componentTypes) {
			if (archetypeStore.componentIds.indexOf(componentType.id) < 0) {
				return false;
			}
		}

		return true;
	}

	private queryArchetypes(
		componentTypes: readonly ComponentType<unknown>[],
	): Entity[] {
		const entities: Entity[] = [];

		this.archetypes.forEach((archetypeStore) => {
			if (!this.archetypeMatches(archetypeStore, componentTypes)) {
				return;
			}

			for (const entity of archetypeStore.entities) {
				if (this.isAlive(entity)) {
					entities.push(entity);
				}
			}
		});

		return entities;
	}

	public has<T>(entity: Entity, componentType: ComponentType<T>): boolean {
		return (
			this.isAlive(entity) &&
			this.components.get(componentType.id)?.values.has(entity) === true
		);
	}

	public query(...componentTypes: ComponentType<unknown>[]): Entity[] {
		if (componentTypes.size() === 0) {
			return this.getLivingEntities();
		}

		if (componentTypes.size() > 1) {
			return this.queryArchetypes(componentTypes);
		}

		let smallestStore: ComponentStore | undefined;

		for (const componentType of componentTypes) {
			const componentStore = this.components.get(componentType.id);

			if (componentStore === undefined) {
				return [];
			}

			if (
				smallestStore === undefined ||
				componentStore.entities.size() < smallestStore.entities.size()
			) {
				smallestStore = componentStore;
			}
		}

		if (smallestStore === undefined) {
			return [];
		}

		const entities: Entity[] = [];

		for (const entity of smallestStore.entities) {
			if (!this.isAlive(entity)) {
				continue;
			}
			let matches = true;
			for (const componentType of componentTypes) {
				if (!this.has(entity, componentType)) {
					matches = false;
					break;
				}
			}

			if (matches) {
				entities.push(entity);
			}
		}

		return entities;
	}
}
