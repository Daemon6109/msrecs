import type {
	Component,
	ComponentType,
	Entity,
	EventType,
	QueryData,
	Relation,
	Resource,
	System,
	SystemOptions,
	Tag,
} from "./types";
import type { World } from "./world";

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
	options: SystemOptions = {},
): System {
	return { name, run, ...options };
}

export function defineQuerySystem<T extends readonly ComponentType<unknown>[]>(
	name: string,
	componentTypes: T,
	run: (world: World, entity: Entity, ...components: QueryData<T>) => void,
	options: SystemOptions = {},
): System {
	return {
		name,
		...options,
		run: (world) => {
			world.queryEach(componentTypes, (entity, ...components) => {
				run(world, entity, ...components);
			});
		},
	};
}
