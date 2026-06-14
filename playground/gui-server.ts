const outdir = "playground/.gui";
const port = Number(process.env.PORT ?? 5173);

const build = await Bun.build({
	entrypoints: ["playground/gui.ts"],
	outdir,
	target: "browser",
	format: "esm",
	sourcemap: "inline",
});

if (!build.success) {
	for (const log of build.logs) {
		console.error(log);
	}

	process.exit(1);
}

const html = await Bun.file("playground/gui.html").text();
const url = `http://localhost:${port}`;

Bun.serve({
	port,
	fetch(request) {
		const pathname = new URL(request.url).pathname;

		if (pathname === "/" || pathname === "/index.html") {
			return new Response(html, {
				headers: { "content-type": "text/html; charset=utf-8" },
			});
		}

		if (pathname === "/gui.js") {
			return new Response(Bun.file(`${outdir}/gui.js`), {
				headers: { "content-type": "text/javascript; charset=utf-8" },
			});
		}

		return new Response("Not found", { status: 404 });
	},
});

console.log(`MSRECS GUI playground running at ${url}`);

if (process.platform === "darwin" && process.env.NO_OPEN !== "1") {
	Bun.spawn(["open", url]);
}

await new Promise(() => undefined);
