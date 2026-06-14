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
	readonly onStart?: (world: import("./world").World) => void;
	readonly onStop?: (world: import("./world").World) => void;
	readonly onFixedUpdate?: (
		world: import("./world").World,
		deltaTime: number,
	) => void;
	readonly run: (world: import("./world").World) => void;
}

export interface SystemOptions {
	readonly phase?: string;
	readonly before?: readonly string[];
	readonly after?: readonly string[];
	readonly onStart?: (world: import("./world").World) => void;
	readonly onStop?: (world: import("./world").World) => void;
	readonly onFixedUpdate?: (
		world: import("./world").World,
		deltaTime: number,
	) => void;
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

export interface ComponentChange {
	readonly entity: Entity;
	readonly tick: number;
}

export type ComponentAddObserver<T> = (
	entity: Entity,
	component: T,
	world: import("./world").World,
) => void;

export type ComponentChangeObserver<T> = (
	entity: Entity,
	component: T,
	world: import("./world").World,
) => void;

export type ComponentRemoveObserver<_T> = (
	entity: Entity,
	world: import("./world").World,
) => void;

export interface WorldOptions {
	readonly debug?: boolean;
}

export interface SnapshotComponent {
	readonly id: string;
	readonly value: unknown;
}

export interface SnapshotEntity {
	readonly id: Entity;
	readonly generation: number;
	readonly alive: boolean;
	readonly components: readonly SnapshotComponent[];
}

export interface SnapshotResource {
	readonly id: string;
	readonly value: unknown;
}

export interface SnapshotRelation {
	readonly id: string;
	readonly source: Entity;
	readonly target: Entity;
	readonly value: unknown;
}

export interface WorldSnapshot {
	readonly tick: number;
	readonly nextEntityId: number;
	readonly entities: readonly SnapshotEntity[];
	readonly resources: readonly SnapshotResource[];
	readonly relations: readonly SnapshotRelation[];
}

export interface ComponentDebugInfo {
	readonly id: string;
	readonly entities: number;
}

export interface ArchetypeDebugInfo {
	readonly key: string;
	readonly components: readonly string[];
	readonly entities: number;
}

export interface RelationDebugInfo {
	readonly id: string;
	readonly edges: number;
}

export interface WorldDebugInfo {
	readonly tick: number;
	readonly entities: number;
	readonly aliveEntities: number;
	readonly components: readonly ComponentDebugInfo[];
	readonly archetypes: readonly ArchetypeDebugInfo[];
	readonly resources: readonly string[];
	readonly relations: readonly RelationDebugInfo[];
}

export interface SystemTiming {
	readonly name: string;
	readonly phase: string;
	readonly runs: number;
	readonly totalSeconds: number;
	readonly lastSeconds: number;
}
