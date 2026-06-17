import type { ComponentType, Entity, QueryData } from "./types";
import type { World } from "./world";

export class Query<TComponents extends readonly ComponentType<unknown>[]> {
	constructor(
		private readonly world: World,
		private readonly componentTypes: TComponents,
	) {}

	public count(): number {
		return this.world.query(...this.componentTypes).size();
	}

	public entities(): Entity[] {
		return this.world.query(...this.componentTypes);
	}

	public first(): Entity | undefined {
		return this.entities()[0];
	}

	public each(
		callback: (entity: Entity, ...components: QueryData<TComponents>) => void,
	): void {
		for (const entity of this.entities()) {
			const components = this.componentTypes.map((componentType) => {
				return this.world.get(entity, componentType);
			}) as QueryData<TComponents>;
			callback(entity, ...components);
		}
	}
}
