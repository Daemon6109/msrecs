declare global {
	const error: (message: string) => never;
	const typeOf: (value: unknown) => string;

	interface Array<T> {
		clear(): void;
		remove(index: number): void;
	}

	interface Map<K, V> {
		size(): number;
	}
}

export {};
