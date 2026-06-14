declare global {
	const error: (message: string) => never;
	const typeOf: (value: unknown) => string;
}

export {};
