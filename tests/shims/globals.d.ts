declare global {
	const error: (message: string) => never;
	const typeOf: (value: unknown) => string;
	const os: {
		clock(): number;
	};
	const assert: (condition: unknown, message?: string) => asserts condition;

	interface Array<T> {
		clear(): void;
		remove(index: number): void;
		size(): number;
	}

	interface Map<K, V> {
		size(): number;
	}
}

export {};
