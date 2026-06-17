import type { ComponentType } from "./types";

export function defineComponent<T>(id: string): ComponentType<T> {
	return { id };
}
