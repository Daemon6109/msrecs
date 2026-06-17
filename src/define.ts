import type { ComponentType, Tag } from "./types";

export function defineComponent<T>(id: string): ComponentType<T> {
	return { id };
}

export function defineTag(id: string): Tag {
	return defineComponent<true>(id);
}
