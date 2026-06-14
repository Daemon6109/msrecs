import { CommandBuffer } from "./command-buffer";
import { Query } from "./query";
import type {
	ComponentAddObserver,
	ComponentChange,
	ComponentChangeObserver,
	ComponentRemoveObserver,
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
	SnapshotComponent,
	SnapshotEntity,
	Tag,
	WorldDebugInfo,
	WorldOptions,
	WorldSnapshot,
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

interface ArchetypeStore {
	componentIds: string[];
	entities: Entity[];
	entityToIndex: Map<Entity, number>;
}

interface ComponentObservers {
	add: ((entity: Entity, value: unknown, world: World) => void)[];
	change: ((entity: Entity, value: unknown, world: World) => void)[];
	remove: ((entity: Entity, world: World) => void)[];
}

export class World {
	private nextEntityId = 1;
	private tick = 0;
	private debugEnabled: boolean;
	private readonly records = new Map<Entity, MutableEntityRecord>();
	private readonly components = new Map<string, ComponentStore>();
	private readonly entityComponents = new Map<Entity, string[]>();
	private readonly archetypes = new Map<string, ArchetypeStore>();
	private readonly entityArchetypeKeys = new Map<Entity, string>();
	private readonly queryCache = new Map<string, Entity[]>();
	private readonly addedComponents = new Map<
		string,
		Map<Entity, ComponentChange>
	>();
	private readonly changedComponents = new Map<
		string,
		Map<Entity, ComponentChange>
	>();
	private readonly removedComponents = new Map<
		string,
		Map<Entity, ComponentChange>
	>();
	private readonly componentObservers = new Map<string, ComponentObservers>();
	private readonly resources = new Map<string, unknown>();
	private readonly events = new Map<string, EventListener<unknown>[]>();
	private readonly relations = new Map<
		string,
		Map<Entity, Map<Entity, unknown>>
	>();

	public constructor(options: WorldOptions = {}) {
		this.debugEnabled = options.debug === true;
	}

	public createEntity(): Entity {
		const entity = this.nextEntityId++;

		this.records.set(entity, {
			alive: true,
			generation: 0,
		});
		this.entityComponents.set(entity, []);

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

	public getTick(): number {
		return this.tick;
	}

	public advanceTick(): number {
		this.tick++;
		return this.tick;
	}

	public setDebugEnabled(enabled: boolean): void {
		this.debugEnabled = enabled;
	}

	public isDebugEnabled(): boolean {
		return this.debugEnabled;
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

		this.removeEntityFromArchetype(entity);
		this.entityComponents.delete(entity);
		this.entityArchetypeKeys.delete(entity);
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
		this.assertAlive(
			entity,
			`Cannot set component "${componentType.id}" on dead entity: ${entity}`,
		);

		const componentStore = this.getOrCreateComponentStore(componentType);
		const hadComponent = componentStore.values.has(entity);

		if (!hadComponent) {
			componentStore.entityToIndex.set(entity, componentStore.entities.size());
			componentStore.entities.push(entity);
			this.addToArchetype(entity, componentType.id);
			this.recordComponentAdded(componentType.id, entity);
			this.notifyComponentAdded(componentType.id, entity, component);
			this.invalidateQueryCache();
		} else {
			this.recordComponentChanged(componentType.id, entity);
			this.notifyComponentChanged(componentType.id, entity, component);
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

	public queryObject<T extends readonly ComponentType<unknown>[]>(
		componentTypes: T,
	): Query<T> {
		return new Query(this, componentTypes);
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
		return this.getChangedEntities(this.addedComponents, componentType.id);
	}

	public changed<T>(componentType: ComponentType<T>): Entity[] {
		return this.getChangedEntities(this.changedComponents, componentType.id);
	}

	public removed<T>(componentType: ComponentType<T>): Entity[] {
		return this.getChangedEntities(this.removedComponents, componentType.id);
	}

	public addedChanges<T>(componentType: ComponentType<T>): ComponentChange[] {
		return this.getChanges(this.addedComponents, componentType.id);
	}

	public changedChanges<T>(componentType: ComponentType<T>): ComponentChange[] {
		return this.getChanges(this.changedComponents, componentType.id);
	}

	public removedChanges<T>(componentType: ComponentType<T>): ComponentChange[] {
		return this.getChanges(this.removedComponents, componentType.id);
	}

	public clearChanges(): void {
		this.addedComponents.clear();
		this.changedComponents.clear();
		this.removedComponents.clear();
	}

	public commands(): CommandBuffer {
		return new CommandBuffer();
	}

	public onAdd<T>(
		componentType: ComponentType<T>,
		observer: ComponentAddObserver<T>,
	): () => void {
		const observers = this.getOrCreateComponentObservers(componentType.id);
		const wrappedObserver = observer as (
			entity: Entity,
			value: unknown,
			world: World,
		) => void;

		observers.add.push(wrappedObserver);
		return () => this.removeObserver(observers.add, wrappedObserver);
	}

	public onChange<T>(
		componentType: ComponentType<T>,
		observer: ComponentChangeObserver<T>,
	): () => void {
		const observers = this.getOrCreateComponentObservers(componentType.id);
		const wrappedObserver = observer as (
			entity: Entity,
			value: unknown,
			world: World,
		) => void;

		observers.change.push(wrappedObserver);
		return () => this.removeObserver(observers.change, wrappedObserver);
	}

	public onRemove<T>(
		componentType: ComponentType<T>,
		observer: ComponentRemoveObserver<T>,
	): () => void {
		const observers = this.getOrCreateComponentObservers(componentType.id);
		const wrappedObserver = observer as (entity: Entity, world: World) => void;

		observers.remove.push(wrappedObserver);
		return () => this.removeObserver(observers.remove, wrappedObserver);
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

	public snapshot(): WorldSnapshot {
		const entities: SnapshotEntity[] = [];
		const resources: { id: string; value: unknown }[] = [];
		const relations: {
			id: string;
			source: Entity;
			target: Entity;
			value: unknown;
		}[] = [];

		this.records.forEach((record, entity) => {
			entities.push({
				id: entity,
				alive: record.alive,
				generation: record.generation,
				components: this.snapshotComponents(entity),
			});
		});

		this.resources.forEach((value, id) => {
			resources.push({ id, value });
		});

		this.relations.forEach((sourceStore, id) => {
			sourceStore.forEach((targetStore, source) => {
				targetStore.forEach((value, target) => {
					relations.push({ id, source, target, value });
				});
			});
		});

		return {
			tick: this.tick,
			nextEntityId: this.nextEntityId,
			entities,
			resources,
			relations,
		};
	}

	public restore(snapshot: WorldSnapshot): void {
		this.nextEntityId = snapshot.nextEntityId;
		this.tick = snapshot.tick;
		this.records.clear();
		this.components.clear();
		this.entityComponents.clear();
		this.archetypes.clear();
		this.entityArchetypeKeys.clear();
		this.queryCache.clear();
		this.resources.clear();
		this.relations.clear();
		this.clearChanges();

		for (const entity of snapshot.entities) {
			this.records.set(entity.id, {
				alive: entity.alive,
				generation: entity.generation,
			});
			this.entityComponents.set(entity.id, []);

			for (const component of entity.components) {
				this.restoreComponent(entity.id, component);
			}
		}

		for (const resource of snapshot.resources) {
			this.resources.set(resource.id, resource.value);
		}

		for (const relation of snapshot.relations) {
			let sourceStore = this.relations.get(relation.id);

			if (sourceStore === undefined) {
				sourceStore = new Map<Entity, Map<Entity, unknown>>();
				this.relations.set(relation.id, sourceStore);
			}

			let targetStore = sourceStore.get(relation.source);

			if (targetStore === undefined) {
				targetStore = new Map<Entity, unknown>();
				sourceStore.set(relation.source, targetStore);
			}

			targetStore.set(relation.target, relation.value);
		}
	}

	public inspect(): WorldDebugInfo {
		const components: { id: string; entities: number }[] = [];
		const archetypes: {
			key: string;
			components: string[];
			entities: number;
		}[] = [];
		const resources: string[] = [];
		const relations: { id: string; edges: number }[] = [];

		this.components.forEach((componentStore, id) => {
			components.push({ id, entities: componentStore.entities.size() });
		});

		this.archetypes.forEach((archetypeStore, key) => {
			archetypes.push({
				key,
				components: [...archetypeStore.componentIds],
				entities: archetypeStore.entities.size(),
			});
		});

		this.resources.forEach((_value, id) => {
			resources.push(id);
		});

		this.relations.forEach((sourceStore, id) => {
			let edges = 0;

			sourceStore.forEach((targetStore) => {
				edges += targetStore.size();
			});

			relations.push({ id, edges });
		});

		return {
			tick: this.tick,
			entities: this.records.size(),
			aliveEntities: this.getLivingEntities().size(),
			components,
			archetypes,
			resources,
			relations,
		};
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
		const removedIndex = componentStore.entityToIndex.get(entity);

		if (removedIndex === undefined) {
			return;
		}

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
		this.notifyComponentRemoved(componentId, entity);
		this.invalidateQueryCache();
	}

	private addToArchetype(entity: Entity, componentId: string): void {
		let componentIds = this.entityComponents.get(entity);
		const previousKey = this.entityArchetypeKeys.get(entity) ?? "";

		if (componentIds === undefined) {
			componentIds = [];
			this.entityComponents.set(entity, componentIds);
		}

		if (componentIds.indexOf(componentId) < 0) {
			componentIds.push(componentId);
			componentIds.sort();
			this.moveEntityBetweenArchetypes(
				entity,
				previousKey,
				this.getArchetypeKeyFromIds(componentIds),
			);
		}
	}

	private removeFromArchetype(entity: Entity, componentId: string): void {
		const componentIds = this.entityComponents.get(entity);
		const previousKey = this.entityArchetypeKeys.get(entity) ?? "";

		if (componentIds === undefined) {
			return;
		}

		const index = componentIds.indexOf(componentId);

		if (index >= 0) {
			componentIds.remove(index);
		}

		if (componentIds.size() === 0) {
			this.removeEntityFromArchetype(entity);
			return;
		}

		this.moveEntityBetweenArchetypes(
			entity,
			previousKey,
			this.getArchetypeKeyFromIds(componentIds),
		);
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

	private moveEntityToArchetype(entity: Entity, archetypeKey: string): void {
		this.entityArchetypeKeys.set(entity, archetypeKey);
		let archetypeStore = this.archetypes.get(archetypeKey);

		if (archetypeStore === undefined) {
			archetypeStore = {
				componentIds: this.getComponentIdsFromKey(archetypeKey),
				entities: [],
				entityToIndex: new Map<Entity, number>(),
			};
			this.archetypes.set(archetypeKey, archetypeStore);
		}

		if (!archetypeStore.entityToIndex.has(entity)) {
			archetypeStore.entityToIndex.set(entity, archetypeStore.entities.size());
			archetypeStore.entities.push(entity);
		}
	}

	private moveEntityBetweenArchetypes(
		entity: Entity,
		previousKey: string,
		nextKey: string,
	): void {
		if (previousKey === nextKey) {
			return;
		}

		this.removeEntityFromArchetype(entity);
		this.moveEntityToArchetype(entity, nextKey);
	}

	private removeEntityFromArchetype(entity: Entity): void {
		const archetypeKey = this.entityArchetypeKeys.get(entity);

		if (archetypeKey === undefined) {
			return;
		}

		const archetypeStore = this.archetypes.get(archetypeKey);

		if (archetypeStore !== undefined) {
			const removedIndex = archetypeStore.entityToIndex.get(entity);

			if (removedIndex !== undefined) {
				const lastIndex = archetypeStore.entities.size() - 1;
				const lastEntity = archetypeStore.entities[lastIndex];

				if (removedIndex !== lastIndex && lastEntity !== undefined) {
					archetypeStore.entities[removedIndex] = lastEntity;
					archetypeStore.entityToIndex.set(lastEntity, removedIndex);
				}

				archetypeStore.entities.remove(lastIndex);
				archetypeStore.entityToIndex.delete(entity);
			}

			if (archetypeStore.entities.size() === 0) {
				this.archetypes.delete(archetypeKey);
			}
		}

		this.entityArchetypeKeys.delete(entity);
	}

	private getArchetypeKeyFromIds(componentIds: readonly string[]): string {
		const sortedIds = [...componentIds];
		sortedIds.sort();
		return sortedIds.join("|");
	}

	private getComponentIdsFromKey(archetypeKey: string): string[] {
		if (archetypeKey === "") {
			return [];
		}

		return archetypeKey.split("|");
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
		componentMap: Map<string, Map<Entity, ComponentChange>>,
		componentId: string,
		entity: Entity,
	): void {
		let changes = componentMap.get(componentId);

		if (changes === undefined) {
			changes = new Map<Entity, ComponentChange>();
			componentMap.set(componentId, changes);
		}

		if (!changes.has(entity)) {
			changes.set(entity, { entity, tick: this.tick });
		}
	}

	private getChangedEntities(
		componentMap: Map<string, Map<Entity, ComponentChange>>,
		componentId: string,
	): Entity[] {
		const entities: Entity[] = [];
		const changes = componentMap.get(componentId);

		if (changes === undefined) {
			return entities;
		}

		changes.forEach((_change, entity) => {
			entities.push(entity);
		});

		return entities;
	}

	private getChanges(
		componentMap: Map<string, Map<Entity, ComponentChange>>,
		componentId: string,
	): ComponentChange[] {
		const changeList: ComponentChange[] = [];
		const changes = componentMap.get(componentId);

		if (changes === undefined) {
			return changeList;
		}

		changes.forEach((change) => {
			changeList.push(change);
		});

		return changeList;
	}

	private getOrCreateComponentObservers(
		componentId: string,
	): ComponentObservers {
		let observers = this.componentObservers.get(componentId);

		if (observers === undefined) {
			observers = {
				add: [],
				change: [],
				remove: [],
			};
			this.componentObservers.set(componentId, observers);
		}

		return observers;
	}

	private removeObserver(observers: defined[], observer: defined): void {
		const index = observers.indexOf(observer);

		if (index >= 0) {
			observers.remove(index);
		}
	}

	private notifyComponentAdded(
		componentId: string,
		entity: Entity,
		value: unknown,
	): void {
		for (const observer of this.componentObservers.get(componentId)?.add ??
			[]) {
			observer(entity, value, this);
		}
	}

	private notifyComponentChanged(
		componentId: string,
		entity: Entity,
		value: unknown,
	): void {
		for (const observer of this.componentObservers.get(componentId)?.change ??
			[]) {
			observer(entity, value, this);
		}
	}

	private notifyComponentRemoved(componentId: string, entity: Entity): void {
		for (const observer of this.componentObservers.get(componentId)?.remove ??
			[]) {
			observer(entity, this);
		}
	}

	private snapshotComponents(entity: Entity): SnapshotComponent[] {
		const components: SnapshotComponent[] = [];

		this.components.forEach((componentStore, id) => {
			if (componentStore.values.has(entity)) {
				components.push({
					id,
					value: componentStore.values.get(entity),
				});
			}
		});

		return components;
	}

	private restoreComponent(entity: Entity, component: SnapshotComponent): void {
		const componentStore = this.getOrCreateComponentStore({ id: component.id });

		if (!componentStore.values.has(entity)) {
			componentStore.entityToIndex.set(entity, componentStore.entities.size());
			componentStore.entities.push(entity);
			this.addToArchetype(entity, component.id);
		}

		componentStore.values.set(entity, component.value);
	}

	private assertAlive(entity: Entity, message: string): void {
		if (!this.isAlive(entity)) {
			error(message);
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
