import {
	defineComponent,
	defineEvent,
	defineRelation,
	defineResource,
	defineTag,
} from "../src";

export interface Position {
	x: number;
	y: number;
}

export interface Health {
	current: number;
	max: number;
}

export const Position = defineComponent<Position>("Position");
export const Health = defineComponent<Health>("Health");
export const Velocity = defineComponent<{ x: number; y: number }>("Velocity");
export const Enemy = defineTag("Enemy");
export const Boss = defineTag("Boss");
export const GameTime = defineResource<{ elapsed: number }>("GameTime");
export const EnemyKilled = defineEvent<{ enemy: number; killer: number }>(
	"EnemyKilled",
);
export const Targeting = defineRelation<{ priority: number }>("Targeting");
export const OwnedBy = defineRelation("OwnedBy");
