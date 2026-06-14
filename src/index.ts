// MSR Entity Component System
// Written by Matthew Radulovich
// Started 6/14/2026

export type Entity = number;

export interface Component<T> {
	readonly id: string;
	readonly _type?: T;
}

export type ComponentType<T> = Component<T>;
export type Tag = Component<true>;

export interface Resource<T> {
	readonly id: string;
	readonly _type?: T;
}

export interface EventType<T> {
	readonly id: string;
	readonly _type?: T;
}

export interface Relation<T = true> {
	readonly id: string;
	readonly _type?: T;
}

export interface EntityRecord {
	readonly generation: number;
	readonly alive: boolean;
}

export interface System {
	readonly name?: string;
	readonly run: (world: World) => void;
}

type QueryData<T extends readonly ComponentType<unknown>[]> = {
	[Index in keyof T]: T[Index] extends ComponentType<infer Value>
		? Value
		: never;
};

type EventListener<T> = (payload: T) => void;

interface MutableEntityRecord {
	alive: boolean;
	generation: number;
}

export function defineComponent<T>(id: string): Component<T> {
	return { id };
}

export function defineTag(id: string): Tag {
	return defineComponent<true>(id);
}

export function defineResource<T>(id: string): Resource<T> {
	return { id };
}

export function defineEvent<T>(id: string): EventType<T> {
	return { id };
}

export function defineRelation<T = true>(id: string): Relation<T> {
	return { id };
}

export function defineSystem(
	name: string,
	run: (world: World) => void,
): System {
	return { name, run };
}

export function defineQuerySystem<T extends readonly ComponentType<unknown>[]>(
	name: string,
	componentTypes: T,
	run: (world: World, entity: Entity, ...components: QueryData<T>) => void,
): System {
	return {
		name,
		run: (world) => {
			world.queryEach(componentTypes, (entity, ...components) => {
				run(world, entity, ...components);
			});
		},
	};
}

export class Scheduler {
	private readonly systems: System[] = [];

	public add(system: System): this {
		this.systems.push(system);
		return this;
	}

	public run(world: World): void {
		for (const system of this.systems) {
			system.run(world);
		}
	}

	public clear(): void {
		this.systems.clear();
	}
}

export class World {
	private nextEntityId = 1;
	private readonly records = new Map<Entity, MutableEntityRecord>();
	private readonly components = new Map<string, Map<Entity, unknown>>();
	private readonly resources = new Map<string, unknown>();
	private readonly events = new Map<string, EventListener<unknown>[]>();
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

		this.components.forEach((componentStore) => {
			componentStore.delete(entity);
		});

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

		this.getOrCreateComponentStore(componentType).set(entity, component);
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

		return this.components.get(componentType.id)?.get(entity) as T | undefined;
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
		this.components.get(componentType.id)?.delete(entity);
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
			this.components.get(componentType.id)?.has(entity) === true
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
		const entities: Entity[] = [];

		this.records.forEach((record, entity) => {
			if (!record.alive) {
				return;
			}

			for (const componentType of componentTypes) {
				if (!this.has(entity, componentType)) {
					return;
				}
			}

			entities.push(entity);
		});

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

	private getOrCreateComponentStore<T>(
		componentType: ComponentType<T>,
	): Map<Entity, unknown> {
		let componentStore = this.components.get(componentType.id);

		if (componentStore === undefined) {
			componentStore = new Map<Entity, unknown>();
			this.components.set(componentType.id, componentStore);
		}

		return componentStore;
	}
}
