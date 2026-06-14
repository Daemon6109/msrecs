import { defineConfig } from "@isentinel/jest-roblox";

export default defineConfig({
	backend: "open-cloud",
	gameOutput: "game-output.log",
	jestPath: "ReplicatedStorage/rbxts_include/node_modules/@rbxts/jest/src",
	outputFile: "jest-output.log",
	placeFile: "test.rbxl",
	rojoProject: "test.project.json",
	test: {
		clearMocks: true,
		collectCoverage: true,
		coveragePathIgnorePatterns: ["**/tests/", "**/index.ts"],
		coverageThreshold: {
			branches: 100,
			functions: 100,
			lines: 100,
			statements: 100,
		},
		testTimeout: 5000,
	},
	timeout: 30000,
});
