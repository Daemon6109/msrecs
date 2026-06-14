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
