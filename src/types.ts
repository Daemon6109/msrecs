export type Entity = number;

export interface EntityHandle {
	readonly id: Entity;
	readonly generation: number;
}

export interface SpawnedEntity {
	readonly id: number;
}

export type EntityTarget = Entity | SpawnedEntity;

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
	readonly phase?: string;
	readonly before?: readonly string[];
	readonly after?: readonly string[];
	readonly run: (world: import("./world").World) => void;
}

export interface SystemOptions {
	readonly phase?: string;
	readonly before?: readonly string[];
	readonly after?: readonly string[];
}

export interface RelationEntry<T> {
	readonly source: Entity;
	readonly target: Entity;
	readonly value: T;
}

export type QueryData<T extends readonly ComponentType<unknown>[]> = {
	[Index in keyof T]: T[Index] extends ComponentType<infer Value>
		? Value
		: never;
};

export type EventListener<T> = (payload: T) => void;
