// MSR Entity Component System
// Written by Matthew Radulovich
// Started 6/14/2026

export type Entity = number;

interface EntityRecord {
	alive: boolean;
	generation: number;
}

export class World {
	private nextEntityId = 1;
	private records = new Map<Entity, EntityRecord>();

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
	}
}
