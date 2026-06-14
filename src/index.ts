// MSR Entity Component System
// Written by Matthew Radulovich
// Started 6/14/2026

export type Entity = number;

export interface Component<T> {
	readonly id: string;
	readonly _type?: T;
}

export type ComponentType<T> = Component<T>;

interface EntityRecord {
	alive: boolean;
	generation: number;
}

export function defineComponent<T>(id: string): Component<T> {
	return { id };
}

export class World {
	private nextEntityId = 1;
	private records = new Map<Entity, EntityRecord>();
	private components = new Map<string, Map<Entity, unknown>>();

	public createEntity(): Entity {
		const entity = this.nextEntityId++;

		this.records.set(entity, {
			alive: true,
			generation: 0,
		});

		return entity;
	}

	// this checks if it is currently alive which is whether or not it is active essentially
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
	}

	public addComponent<T>(
		entity: Entity,
		componentType: ComponentType<T>,
		component: T,
	): void {
		if (!this.isAlive(entity)) {
			error(`Cannot add component to dead entity: ${entity}`);
		}

		const componentId = this.getComponentId(componentType);
		let componentStore = this.components.get(componentId);

		if (componentStore === undefined) {
			componentStore = new Map<Entity, unknown>();
			this.components.set(componentId, componentStore);
		}

		componentStore.set(entity, component);
	}

	public getComponent<T>(
		entity: Entity,
		componentType: ComponentType<T>,
	): T | undefined {
		if (!this.isAlive(entity)) {
			return undefined;
		}

		return this.components
			.get(this.getComponentId(componentType))
			?.get(entity) as T | undefined;
	}

	public removeComponent<T>(
		entity: Entity,
		componentType: ComponentType<T>,
	): void {
		this.components.get(this.getComponentId(componentType))?.delete(entity);
	}

	public hasComponent<T>(
		entity: Entity,
		componentType: ComponentType<T>,
	): boolean {
		if (!this.isAlive(entity)) {
			return false;
		}
		return (
			this.components.get(this.getComponentId(componentType))?.has(entity) ===
			true
		);
	}

	public query(...componentTypes: ComponentType<unknown>[]): Entity[] {
		const entities: Entity[] = [];

		this.records.forEach((record, entity) => {
			if (!record.alive) {
				return;
			}

			for (const componentType of componentTypes) {
				if (!this.hasComponent(entity, componentType)) {
					return;
				}
			}

			entities.push(entity);
		});

		return entities;
	}

	private getComponentId<T>(componentType: ComponentType<T>): string {
		return componentType.id;
	}
}
