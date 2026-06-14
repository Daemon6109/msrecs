import { CommandBuffer } from "./command-buffer";
import type {
	ComponentType,
	Entity,
	EntityHandle,
	EntityRecord,
	EventListener,
	EventType,
	QueryData,
	Relation,
	RelationEntry,
	Resource,
	Tag,
} from "./types";

interface MutableEntityRecord {
	alive: boolean;
	generation: number;
}

// A component store is a sparse set:
// - values stores the actual component data by entity id.
// - entities is a dense list of entities that currently have this component.
// - entityToIndex lets us remove an entity from entities in O(1) by swap-removing.
interface ComponentStore {
	entities: Entity[];
	entityToIndex: Map<Entity, number>;
	values: Map<Entity, unknown>;
}

export class World {
	// Entity ids only move forward for now; this keeps stale-id behavior easy to reason about.
	private nextEntityId = 1;
	// Entity records answer: "does this id exist, is it alive, and what generation is it?"
	private readonly records = new Map<Entity, MutableEntityRecord>();
	// Component id -> sparse-set component store.
	private readonly components = new Map<string, ComponentStore>();
	// Entity id -> sorted component ids. This is the lightweight archetype index.
	private readonly entityComponents = new Map<Entity, string[]>();
	// Cached query results are invalidated whenever component membership changes.
	private readonly queryCache = new Map<string, Entity[]>();
	// Change maps are intentionally frame-like: call clearChanges after systems observe them.
	private readonly addedComponents = new Map<string, Entity[]>();
	private readonly changedComponents = new Map<string, Entity[]>();
	private readonly removedComponents = new Map<string, Entity[]>();
	// Resource id -> singleton resource value.
	private readonly resources = new Map<string, unknown>();
	// Event id -> listener list.
	private readonly events = new Map<string, EventListener<unknown>[]>();
	// Relation id -> source entity -> target entity -> relation payload.
	private readonly relations = new Map<
		string,
		Map<Entity, Map<Entity, unknown>>
	>();

	public createEntity(): Entity {
		const entity = this.nextEntityId++;

		this.records.set(entity, {
			alive: true,
			generation: 0,
		});

		return entity;
	}

	public createEntityHandle(): EntityHandle {
		const entity = this.createEntity();
		return this.getEntityHandle(entity) as EntityHandle;
	}

	public getEntityHandle(entity: Entity): EntityHandle | undefined {
		const record = this.records.get(entity);

		if (record === undefined) {
			return undefined;
		}

		return {
			id: entity,
			generation: record.generation,
		};
	}

	public isHandleAlive(handle: EntityHandle): boolean {
		const record = this.records.get(handle.id);
		return record?.alive === true && record.generation === handle.generation;
	}

	public resolveEntity(handle: EntityHandle): Entity | undefined {
		if (!this.isHandleAlive(handle)) {
			return undefined;
		}

		return handle.id;
	}

	public deleteEntityHandle(handle: EntityHandle): void {
		if (this.isHandleAlive(handle)) {
			this.deleteEntity(handle.id);
		}
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

	public isAlive(entity: Entity): boolean {
		return this.records.get(entity)?.alive === true;
	}

	public deleteEntity(entity: Entity): void {
		const record = this.records.get(entity);

		if (record === undefined || !record.alive) {
			return;
		}

		record.alive = false;
		record.generation++;

		this.components.forEach((componentStore, componentId) => {
			this.removeFromComponentStore(componentStore, entity, componentId);
		});

		this.entityComponents.delete(entity);
		this.invalidateQueryCache();

		this.relations.forEach((relationStore) => {
			relationStore.delete(entity);

			relationStore.forEach((targets, source) => {
				targets.delete(entity);

				if (targets.size() === 0) {
					relationStore.delete(source);
				}
			});
		});
	}

	public set<T>(
		entity: Entity,
		componentType: ComponentType<T>,
		component: T,
	): void {
		if (!this.isAlive(entity)) {
			error(
				`Cannot set component "${componentType.id}" on dead entity: ${entity}`,
			);
		}

		const componentStore = this.getOrCreateComponentStore(componentType);
		const hadComponent = componentStore.values.has(entity);

		if (!hadComponent) {
			componentStore.entityToIndex.set(entity, componentStore.entities.size());
			componentStore.entities.push(entity);
			this.addToArchetype(entity, componentType.id);
			this.recordComponentAdded(componentType.id, entity);
			this.invalidateQueryCache();
		} else {
			this.recordComponentChanged(componentType.id, entity);
		}

		componentStore.values.set(entity, component);
	}

	public addComponent<T>(
		entity: Entity,
		componentType: ComponentType<T>,
		component: T,
	): void {
		this.set(entity, componentType, component);
	}

	public get<T>(
		entity: Entity,
		componentType: ComponentType<T>,
	): T | undefined {
		if (!this.isAlive(entity)) {
			return undefined;
		}

		return this.components.get(componentType.id)?.values.get(entity) as
			| T
			| undefined;
	}

	public getComponent<T>(
		entity: Entity,
		componentType: ComponentType<T>,
	): T | undefined {
		return this.get(entity, componentType);
	}

	public update<T>(
		entity: Entity,
		componentType: ComponentType<T>,
		updater: (component: T) => T,
	): T {
		const current = this.get(entity, componentType);

		if (current === undefined) {
			error(
				`Cannot update missing component "${componentType.id}" on entity: ${entity}`,
			);
		}

		const updated = updater(current);
		this.set(entity, componentType, updated);
		return updated;
	}

	public updateComponent<T>(
		entity: Entity,
		componentType: ComponentType<T>,
		updater: (component: T) => T,
	): T {
		return this.update(entity, componentType, updater);
	}

	public remove<T>(entity: Entity, componentType: ComponentType<T>): void {
		const componentStore = this.components.get(componentType.id);

		if (componentStore === undefined) {
			return;
		}

		this.removeFromComponentStore(componentStore, entity, componentType.id);
	}

	public removeComponent<T>(
		entity: Entity,
		componentType: ComponentType<T>,
	): void {
		this.remove(entity, componentType);
	}

	public has<T>(entity: Entity, componentType: ComponentType<T>): boolean {
		return (
			this.isAlive(entity) &&
			this.components.get(componentType.id)?.values.has(entity) === true
		);
	}

	public hasComponent<T>(
		entity: Entity,
		componentType: ComponentType<T>,
	): boolean {
		return this.has(entity, componentType);
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

	public queryCached(...componentTypes: ComponentType<unknown>[]): Entity[] {
		const cacheKey = this.getQueryKey(componentTypes);
		const cached = this.queryCache.get(cacheKey);

		if (cached !== undefined) {
			return [...cached];
		}

		const entities = this.query(...componentTypes);
		this.queryCache.set(cacheKey, [...entities]);
		return entities;
	}

	public queryEach<T extends readonly ComponentType<unknown>[]>(
		componentTypes: T,
		callback: (entity: Entity, ...components: QueryData<T>) => void,
	): void {
		for (const entity of this.query(...componentTypes)) {
			const components = componentTypes.map((componentType) => {
				return this.get(entity, componentType);
			}) as QueryData<T>;

			callback(entity, ...components);
		}
	}

	public getArchetype(entity: Entity): string[] {
		const componentIds = this.entityComponents.get(entity);

		if (!this.isAlive(entity) || componentIds === undefined) {
			return [];
		}

		return [...componentIds];
	}

	public getArchetypeKey(entity: Entity): string {
		return this.getArchetype(entity).join("|");
	}

	public added<T>(componentType: ComponentType<T>): Entity[] {
		return [...(this.addedComponents.get(componentType.id) ?? [])];
	}

	public changed<T>(componentType: ComponentType<T>): Entity[] {
		return [...(this.changedComponents.get(componentType.id) ?? [])];
	}

	public removed<T>(componentType: ComponentType<T>): Entity[] {
		return [...(this.removedComponents.get(componentType.id) ?? [])];
	}

	public clearChanges(): void {
		this.addedComponents.clear();
		this.changedComponents.clear();
		this.removedComponents.clear();
	}

	public commands(): CommandBuffer {
		return new CommandBuffer();
	}

	public setResource<T>(resource: Resource<T>, value: T): void {
		this.resources.set(resource.id, value);
	}

	public getResource<T>(resource: Resource<T>): T | undefined {
		return this.resources.get(resource.id) as T | undefined;
	}

	public hasResource<T>(resource: Resource<T>): boolean {
		return this.resources.has(resource.id);
	}

	public updateResource<T>(resource: Resource<T>, updater: (value: T) => T): T {
		const current = this.getResource(resource);

		if (current === undefined) {
			error(`Cannot update missing resource "${resource.id}".`);
		}

		const updated = updater(current);
		this.setResource(resource, updated);
		return updated;
	}

	public removeResource<T>(resource: Resource<T>): void {
		this.resources.delete(resource.id);
	}

	public on<T>(
		eventType: EventType<T>,
		listener: EventListener<T>,
	): () => void {
		let listeners = this.events.get(eventType.id);

		if (listeners === undefined) {
			listeners = [];
			this.events.set(eventType.id, listeners);
		}

		listeners.push(listener as EventListener<unknown>);

		return () => {
			const currentListeners = this.events.get(eventType.id);

			if (currentListeners === undefined) {
				return;
			}

			const index = currentListeners.indexOf(
				listener as EventListener<unknown>,
			);

			if (index >= 0) {
				currentListeners.remove(index);
			}
		};
	}

	public emit<T>(eventType: EventType<T>, payload: T): void {
		const listeners = this.events.get(eventType.id);

		if (listeners === undefined) {
			return;
		}

		for (const listener of [...listeners]) {
			(listener as EventListener<T>)(payload);
		}
	}

	public setRelation<T>(
		source: Entity,
		relation: Relation<T>,
		target: Entity,
		value: T,
	): void {
		if (!this.isAlive(source)) {
			error(
				`Cannot set relation "${relation.id}" from dead source entity: ${source}`,
			);
		}

		if (!this.isAlive(target)) {
			error(
				`Cannot set relation "${relation.id}" to dead target entity: ${target}`,
			);
		}

		let relationStore = this.relations.get(relation.id);

		if (relationStore === undefined) {
			relationStore = new Map<Entity, Map<Entity, unknown>>();
			this.relations.set(relation.id, relationStore);
		}

		let targetStore = relationStore.get(source);

		if (targetStore === undefined) {
			targetStore = new Map<Entity, unknown>();
			relationStore.set(source, targetStore);
		}

		targetStore.set(target, value);
	}

	public addRelation(
		source: Entity,
		relation: Relation<true>,
		target: Entity,
	): void {
		this.setRelation(source, relation, target, true);
	}

	public getRelation<T>(
		source: Entity,
		relation: Relation<T>,
		target: Entity,
	): T | undefined {
		if (!this.isAlive(source) || !this.isAlive(target)) {
			return undefined;
		}

		return this.relations.get(relation.id)?.get(source)?.get(target) as
			| T
			| undefined;
	}

	public hasRelation<T>(
		source: Entity,
		relation: Relation<T>,
		target: Entity,
	): boolean {
		return this.getRelation(source, relation, target) !== undefined;
	}

	public removeRelation<T>(
		source: Entity,
		relation: Relation<T>,
		target: Entity,
	): void {
		const relationStore = this.relations.get(relation.id);
		const targetStore = relationStore?.get(source);

		if (targetStore === undefined) {
			return;
		}

		targetStore.delete(target);

		if (targetStore.size() === 0) {
			relationStore?.delete(source);
		}
	}

	public relationTargets<T>(source: Entity, relation: Relation<T>): Entity[] {
		if (!this.isAlive(source)) {
			return [];
		}

		const targetStore = this.relations.get(relation.id)?.get(source);

		if (targetStore === undefined) {
			return [];
		}

		const targets: Entity[] = [];

		targetStore.forEach((_value, target) => {
			if (this.isAlive(target)) {
				targets.push(target);
			}
		});

		return targets;
	}

	public targetsOf<T>(source: Entity, relation: Relation<T>): Entity[] {
		return this.relationTargets(source, relation);
	}

	public relationSources<T>(relation: Relation<T>, target: Entity): Entity[] {
		if (!this.isAlive(target)) {
			return [];
		}

		const relationStore = this.relations.get(relation.id);

		if (relationStore === undefined) {
			return [];
		}

		const sources: Entity[] = [];

		relationStore.forEach((targets, source) => {
			if (this.isAlive(source) && targets.has(target)) {
				sources.push(source);
			}
		});

		return sources;
	}

	public sourcesOf<T>(relation: Relation<T>, target: Entity): Entity[] {
		return this.relationSources(relation, target);
	}

	public relationEntries<T>(relation: Relation<T>): RelationEntry<T>[] {
		const relationStore = this.relations.get(relation.id);
		const entries: RelationEntry<T>[] = [];

		if (relationStore === undefined) {
			return entries;
		}

		relationStore.forEach((targets, source) => {
			if (!this.isAlive(source)) {
				return;
			}

			targets.forEach((value, target) => {
				if (this.isAlive(target)) {
					entries.push({
						source,
						target,
						value: value as T,
					});
				}
			});
		});

		return entries;
	}

	public queryRelation<T>(
		relation: Relation<T>,
		target?: Entity,
	): RelationEntry<T>[] {
		const entries = this.relationEntries(relation);

		if (target === undefined) {
			return entries;
		}

		const matchingEntries: RelationEntry<T>[] = [];

		for (const entry of entries) {
			if (entry.target === target) {
				matchingEntries.push(entry);
			}
		}

		return matchingEntries;
	}

	private getOrCreateComponentStore<T>(
		componentType: ComponentType<T>,
	): ComponentStore {
		let componentStore = this.components.get(componentType.id);

		if (componentStore === undefined) {
			componentStore = {
				entities: [],
				entityToIndex: new Map<Entity, number>(),
				values: new Map<Entity, unknown>(),
			};
			this.components.set(componentType.id, componentStore);
		}

		return componentStore;
	}

	private removeFromComponentStore(
		componentStore: ComponentStore,
		entity: Entity,
		componentId: string,
	): void {
		// If the entity is not in the sparse set, there is nothing to remove.
		const removedIndex = componentStore.entityToIndex.get(entity);

		if (removedIndex === undefined) {
			return;
		}

		// Swap the final dense entity into the removed slot, then trim the end.
		const lastIndex = componentStore.entities.size() - 1;
		const lastEntity = componentStore.entities[lastIndex];

		if (removedIndex !== lastIndex && lastEntity !== undefined) {
			componentStore.entities[removedIndex] = lastEntity;
			componentStore.entityToIndex.set(lastEntity, removedIndex);
		}

		componentStore.entities.remove(lastIndex);
		componentStore.entityToIndex.delete(entity);
		componentStore.values.delete(entity);
		this.removeFromArchetype(entity, componentId);
		this.recordComponentRemoved(componentId, entity);
		this.invalidateQueryCache();
	}

	private addToArchetype(entity: Entity, componentId: string): void {
		let componentIds = this.entityComponents.get(entity);

		if (componentIds === undefined) {
			componentIds = [];
			this.entityComponents.set(entity, componentIds);
		}

		if (componentIds.indexOf(componentId) < 0) {
			componentIds.push(componentId);
			componentIds.sort();
		}
	}

	private removeFromArchetype(entity: Entity, componentId: string): void {
		const componentIds = this.entityComponents.get(entity);

		if (componentIds === undefined) {
			return;
		}

		const index = componentIds.indexOf(componentId);

		if (index >= 0) {
			componentIds.remove(index);
		}

		if (componentIds.size() === 0) {
			this.entityComponents.delete(entity);
		}
	}

	private invalidateQueryCache(): void {
		this.queryCache.clear();
	}

	private getQueryKey(
		componentTypes: readonly ComponentType<unknown>[],
	): string {
		const componentIds: string[] = [];

		for (const componentType of componentTypes) {
			componentIds.push(componentType.id);
		}

		componentIds.sort();
		return componentIds.join("|");
	}

	private recordComponentAdded(componentId: string, entity: Entity): void {
		this.pushUnique(this.addedComponents, componentId, entity);
	}

	private recordComponentChanged(componentId: string, entity: Entity): void {
		this.pushUnique(this.changedComponents, componentId, entity);
	}

	private recordComponentRemoved(componentId: string, entity: Entity): void {
		this.pushUnique(this.removedComponents, componentId, entity);
	}

	private pushUnique(
		componentMap: Map<string, Entity[]>,
		componentId: string,
		entity: Entity,
	): void {
		let entities = componentMap.get(componentId);

		if (entities === undefined) {
			entities = [];
			componentMap.set(componentId, entities);
		}

		if (entities.indexOf(entity) < 0) {
			entities.push(entity);
		}
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
}
