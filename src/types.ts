export type Entity = number;

export interface EntityHandle {
	readonly id: Entity;
	readonly generation: number;
}

export interface EntityRecord {
	readonly alive: boolean;
	readonly generation: number;
}

export interface Component<T> {
	readonly id: string;
	readonly _type?: T;
}

export type ComponentType<T> = Component<T>;

export type Tag = Component<true>;
