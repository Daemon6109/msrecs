const glob = new Bun.Glob("dist/**/*.luau");

for (const file of glob.scanSync(".")) {
	const source = await Bun.file(file).text();
	const fixed = source.replace(/\.\.\.: ([^)]*)\) ->/g, "...$1) ->");

	if (fixed !== source) {
		await Bun.write(file, fixed);
	}
}
