import type { ComponentType, Entity, QueryData } from "./types";
import type { World } from "./world";

export class Query<T extends readonly ComponentType<unknown>[]> {
	public constructor(
		private readonly world: World,
		private readonly componentTypes: T,
	) {}

	public entities(): Entity[] {
		return this.world.queryCached(...this.componentTypes);
	}

	public first(): Entity | undefined {
		return this.entities()[0];
	}

	public count(): number {
		return this.entities().size();
	}

	public each(
		callback: (entity: Entity, ...components: QueryData<T>) => void,
	): void {
		for (const entity of this.entities()) {
			const components = this.componentTypes.map((componentType) => {
				return this.world.get(entity, componentType);
			}) as QueryData<T>;

			callback(entity, ...components);
		}
	}
}
