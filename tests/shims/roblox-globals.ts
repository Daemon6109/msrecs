function robloxError(message: string): never {
	throw new Error(message);
}

function robloxTypeOf(value: unknown): string {
	if (value === undefined || value === null) {
		return "nil";
	}

	if (Array.isArray(value) || typeof value === "object") {
		return "table";
	}

	return typeof value;
}

const globals = globalThis as Record<string, unknown>;

globals.error ??= robloxError;
globals.typeOf ??= robloxTypeOf;
globals.os ??= {
	clock: () => performance.now() / 1000,
};

const arrayPrototype = Array.prototype as Record<string, unknown>;

arrayPrototype.clear ??= function clearArray(this: unknown[]) {
	this.splice(0);
};

arrayPrototype.size ??= function getArraySize(this: unknown[]) {
	return this.length;
};

arrayPrototype.remove ??= function removeArrayValue(
	this: unknown[],
	index: number,
) {
	this.splice(index, 1);
};

const mapSizeDescriptor = Object.getOwnPropertyDescriptor(
	Map.prototype,
	"size",
);

if (mapSizeDescriptor !== undefined) {
	Object.defineProperty(Map.prototype, "size", {
		get() {
			const count = mapSizeDescriptor.get?.call(this) ?? 0;
			const size = (() => count) as unknown as number;

			Object.defineProperty(size, Symbol.toPrimitive, {
				value: () => count,
				configurable: true,
			});

			return size;
		},
		configurable: true,
		enumerable: false,
	});
}
