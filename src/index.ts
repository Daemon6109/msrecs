// MSR Entity Component System
// Written by Matthew Radulovich
// Started 6/14/2026

export type Entity = number;
export type ComponentType<T> = string;

interface EntityRecord {
	alive: boolean;
	generation: number;
}

export class World {
	private nextEntityId = 1;
	private records = new Map<Entity, EntityRecord>();
	private components = new Map<string, Map<Entity, unknown>>();

	// this creates and returns a new entity, it sets it alive meaning it is active, and initializes the generation number to 0
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

	// this deletes the entity by setting it to alive = false which means it no longer is active and cannot be used, it then increments to generaiton to establish a new record
	public deleteEntity(entity: Entity) {
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

	// checks if the entity is dead or not, and then it gets the component store and sees whether it already exists or not, and ten it creates a new map with the entity as the index and the unknown value as the value, and then it sets it inside the component store under the components id
	public addComponent<T>(
		entity: Entity,
		componentType: ComponentType<T>,
		component: T,
	) {
		if (!this.isAlive(entity)) {
			error(`Cannot add component to dead entity: ${entity}`);
		}

		let componentStore = this.components.get(componentType);

		if (componentStore === undefined) {
			componentStore = new Map<Entity, unknown>();
			this.components.set(componentType, componentStore);
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

		return this.components.get(componentType)?.get(entity) as T | undefined;
	}
	public removeComponent<T>(
		entity: Entity,
		componentType: ComponentType<T>,
	): void {
		this.components.get(componentType)?.delete(entity);
	}

	public hasComponent<T>(
		entity: Entity,
		componentType: ComponentType<T>,
	): boolean {
		if (!this.isAlive(entity)) {
			return false;
		}
		return this.components.get(componentType)?.has(entity) === true;
	}
}
