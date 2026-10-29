import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

const root = resolve("build");
const base = (process.env.BASE_PATH || "/web-practice-3").replace(/\/$/, "");
const port = Number(process.env.PORT || 4173);
const types = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".png": "image/png",
	".ico": "image/x-icon"
};

if (!existsSync(root)) {
	console.error("Нет папки build. Сначала выполните: npm run build:pages");
	process.exit(1);
}

createServer((request, response) => {
	const raw = decodeURIComponent((request.url || "/").split("?")[0]);
	let relative = "";
	if (raw === base || raw === `${base}/`) {
		relative = "index.html";
	} else if (raw.startsWith(`${base}/`)) {
		relative = raw.slice(base.length + 1);
	} else {
		response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
		response.end("Not found");
		return;
	}

	const file = join(root, relative);
	if (!existsSync(file) || statSync(file).isDirectory()) {
		response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
		response.end("Not found");
		return;
	}

	response.writeHead(200, {
		"Content-Type": types[extname(file)] || "application/octet-stream",
		"Cache-Control": "no-store"
	});
	createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
	console.log(`Локальная проверка GitHub Pages: http://127.0.0.1:${port}${base}/`);
});
