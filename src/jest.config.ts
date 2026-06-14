import { defineConfig } from "@isentinel/jest-roblox";

export default defineConfig({
	extends: "../jest.shared.ts",
	test: {
		coveragePathIgnorePatterns: ["**/tests/"],
		projects: [
			{
				test: {
					displayName: { name: "core", color: "magenta" },
					include: ["src/**/*.spec.ts"],
					mockDataModel: true,
					outDir: "dist",
				},
			},
			{
				test: {
					displayName: { name: "core:integration", color: "white" },
					include: ["test/**/*.spec.ts"],
					mockDataModel: true,
					outDir: "dist/tests",
				},
			},
		],
	},
});
