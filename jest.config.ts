import { defineConfig } from "@isentinel/jest-roblox";

export default defineConfig({
	placeFile: "./game.rbxl",
	test: {
		projects: ["ReplicatedStorage/shared"],
	},
});
