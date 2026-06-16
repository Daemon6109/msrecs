import {
	defineComponent,
	defineEvent,
	defineRelation,
	defineResource,
	defineTag,
} from "../../src";

export interface PositionData {
	x: number;
	y: number;
}

export interface VelocityData {
	x: number;
	y: number;
}

export interface HealthData {
	current: number;
	max: number;
}

export interface ManaData {
	current: number;
	max: number;
}

export interface GameClockData {
	elapsed: number;
	fixedStep: number;
}

export interface WaveStateData {
	wave: number;
	aliveEnemies: number;
}

export const Position = defineComponent<PositionData>("contract/Position");
export const Velocity = defineComponent<VelocityData>("contract/Velocity");
export const Health = defineComponent<HealthData>("contract/Health");
export const Mana = defineComponent<ManaData>("contract/Mana");

export const Enemy = defineTag("contract/Enemy");
export const Boss = defineTag("contract/Boss");
export const Frozen = defineTag("contract/Frozen");

export const GameClock = defineResource<GameClockData>("contract/GameClock");
export const WaveState = defineResource<WaveStateData>("contract/WaveState");

export const DamageDealt = defineEvent<{
	source: number;
	target: number;
	amount: number;
}>("contract/DamageDealt");

export const EnemySpawned = defineEvent<{
	entity: number;
	wave: number;
}>("contract/EnemySpawned");

export const Targeting = defineRelation<{
	priority: number;
}>("contract/Targeting");

export const OwnedBy = defineRelation("contract/OwnedBy");
export const Threat = defineRelation<number>("contract/Threat");

