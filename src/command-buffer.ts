//!native
//!optimize 2

import type {
	ComponentType,
	Entity,
	EntityTarget,
	EventType,
	Relation,
	Resource,
	SpawnedEntity,
	Tag,
} from "./types";
import type { World } from "./world";

export class CommandBuffer {
	private readonly commands: ((world: World) => void)[] = [];
	private readonly spawnedEntities = new Map<number, Entity>();
	private nextSpawnedEntityId = 1;

	public spawn(callback?: (entity: Entity) => void): SpawnedEntity {
		const spawnedEntity = {
			id: this.nextSpawnedEntityId++,
		};

		this.commands.push((world) => {
			const entity = world.createEntity();
			this.spawnedEntities.set(spawnedEntity.id, entity);
			callback?.(entity);
		});

		return spawnedEntity;
	}

	public delete(entity: EntityTarget): this {
		this.commands.push((world) => world.deleteEntity(this.resolve(entity)));
		return this;
	}

	public set<T>(
		entity: EntityTarget,
		componentType: ComponentType<T>,
		component: T,
	): this {
		this.commands.push((world) => {
			world.set(this.resolve(entity), componentType, component);
		});

		return this;
	}

	public remove<T>(
		entity: EntityTarget,
		componentType: ComponentType<T>,
	): this {
		this.commands.push((world) =>
			world.remove(this.resolve(entity), componentType),
		);
		return this;
	}

	public addTag(entity: EntityTarget, tag: Tag): this {
		this.commands.push((world) => world.addTag(this.resolve(entity), tag));
		return this;
	}

	public setResource<T>(resource: Resource<T>, value: T): this {
		this.commands.push((world) => world.setResource(resource, value));
		return this;
	}

	public emit<T>(eventType: EventType<T>, payload: T): this {
		this.commands.push((world) => world.emit(eventType, payload));
		return this;
	}

	public setRelation<T>(
		source: EntityTarget,
		relation: Relation<T>,
		target: EntityTarget,
		value: T,
	): this {
		this.commands.push((world) => {
			world.setRelation(
				this.resolve(source),
				relation,
				this.resolve(target),
				value,
			);
		});

		return this;
	}

	public addRelation(
		source: EntityTarget,
		relation: Relation<true>,
		target: EntityTarget,
	): this {
		this.commands.push((world) => {
			world.addRelation(this.resolve(source), relation, this.resolve(target));
		});

		return this;
	}

	public flush(world: World): void {
		for (const command of this.commands) {
			command(world);
		}

		this.commands.clear();
		this.spawnedEntities.clear();
	}

	private resolve(entity: EntityTarget): Entity {
		if (!this.isSpawnedEntity(entity)) {
			return entity;
		}

		const resolvedEntity = this.spawnedEntities.get(entity.id);

		if (resolvedEntity === undefined) {
			error("Cannot use command-buffer spawned entity before it is created.");
		}

		return resolvedEntity;
	}

	private isSpawnedEntity(entity: EntityTarget): entity is SpawnedEntity {
		return typeOf(entity) === "table";
	}
}
