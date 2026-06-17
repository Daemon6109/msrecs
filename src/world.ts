import { Query } from "./query";
import type {
	ComponentType,
	Entity,
	EntityHandle,
	EntityRecord,
	Tag,
} from "./types";

interface MutableEntityRecord {
	alive: boolean;
	generation: number;
}

interface ComponentStore {
	entities: Entity[];
	entityToIndex: Map<Entity, number>;
	values: Map<Entity, unknown>;
}

export class World {
	private nextEntityId = 1;
	private readonly records = new Map<Entity, MutableEntityRecord>();
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

	public createEntityHandle(): EntityHandle {
		const entity = this.createEntity();
		const record = this.records.get(entity);

		assert(record, `Entity record missing for entity ${entity}`);

		return {
			id: entity,
			generation: record.generation,
		};
	}

	public isHandleAlive(handle: EntityHandle): boolean {
		const record = this.records.get(handle.id);
		if (record === undefined) {
			return false;
		}

		return record.alive === true && handle.generation === record.generation;
	}

	public resolveEntity(handle: EntityHandle): Entity | undefined {
		if (this.isHandleAlive(handle)) {
			return handle.id;
		}
		return undefined;
	}

	public getEntityRecord(entity: Entity): EntityRecord | undefined {
		const record = this.records.get(entity);

		if (record === undefined) {
			return undefined;
		}

		return {
			alive: record.alive,
			generation: record.generation,
		};
	}

	private removeFromComponentStore(
		componentStore: ComponentStore,
		entity: Entity,
	): void {
		const removedIndex = componentStore.entityToIndex.get(entity);
		if (removedIndex === undefined) {
			return;
		}

		const lastIndex = componentStore.entities.size() - 1;
		const lastEntity = componentStore.entities[lastIndex];
		if (lastEntity === undefined) {
			return;
		}

		if (removedIndex !== lastIndex) {
			componentStore.entities[removedIndex] = lastEntity;
			componentStore.entityToIndex.set(lastEntity, removedIndex);
		}

		componentStore.entityToIndex.delete(entity);
		componentStore.entities.remove(lastIndex);
		componentStore.values.delete(entity);
	}

	public deleteEntity(entity: Entity): void {
		const record = this.records.get(entity);
		if (record === undefined || record.alive === false) {
			return;
		}

		record.alive = false;
		record.generation++;

		this.components.forEach((componentStore) => {
			this.removeFromComponentStore(componentStore, entity);
		});
	}

	private getOrCreateComponentStore(
		componentType: ComponentType<unknown>,
	): ComponentStore {
		let componentStore = this.components.get(componentType.id);
		if (componentStore !== undefined) {
			return componentStore;
		}
		componentStore = {
			entities: [],
			entityToIndex: new Map<Entity, number>(),
			values: new Map<Entity, unknown>(),
		};

		this.components.set(componentType.id, componentStore);

		return componentStore;
	}

	public set<T>(
		entity: Entity,
		componentType: ComponentType<T>,
		value: T,
	): void {
		assert(this.isAlive(entity), `Entity is dead ${entity}`);

		const componentStore = this.getOrCreateComponentStore(componentType);
		const hadComponent = componentStore.values.has(entity);
		if (!hadComponent) {
			componentStore.entityToIndex.set(entity, componentStore.entities.size());
			componentStore.entities.push(entity);
		}
		componentStore.values.set(entity, value);
	}

	public get<T>(
		entity: Entity,
		componentType: ComponentType<T>,
	): T | undefined {
		if (!this.isAlive(entity)) {
			return undefined;
		}

		const componentStore = this.components.get(componentType.id);
		if (componentStore === undefined) {
			return undefined;
		}

		return componentStore.values.get(entity) as T | undefined;
	}

	public update<T>(
		entity: Entity,
		componentType: ComponentType<T>,
		updater: (component: T) => T,
	): T {
		const current = this.get(entity, componentType);
		assert(
			current !== undefined,
			`ComponentType is undefined ${entity}, ${componentType.id}`,
		);

		const updated = updater(current);

		this.set(entity, componentType, updated);

		return updated;
	}

	public remove<T>(entity: Entity, componentType: ComponentType<T>): void {
		const componentStore = this.components.get(componentType.id);
		if (componentStore === undefined) {
			return;
		}

		this.removeFromComponentStore(componentStore, entity);
	}

	public addTag(entity: Entity, tag: Tag): void {
		this.set(entity, tag, true);
	}

	public removeTag(entity: Entity, tag: Tag): void {
		this.remove(entity, tag);
	}

	public hasTag(entity: Entity, tag: Tag): boolean {
		return this.has(entity, tag);
	}

	public queryObject<T extends readonly ComponentType<unknown>[]>(
		componentTypes: T,
	): Query<T> {
		return new Query(this, componentTypes);
	}
}
