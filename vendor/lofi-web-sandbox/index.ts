import { serve } from "bun";
import { join } from "path";

const ROOT = join(process.cwd(), 'vendor/lofi-web-sandbox');

serve({
  port: 4444,
  async fetch(req) {
    const url = new URL(req.url);

    // Helper to serve with CORS
    const serveFile = async (path) => {
        const f = Bun.file(path);
        if (await f.exists()) {
            return new Response(f, {
                headers: {
                    'Content-Type': f.type,
                    'Access-Control-Allow-Origin': '*' // Allow fetching from sandbox
                }
            });
        }
        return new Response("Not Found", { status: 404 });
    }

    if (url.pathname === '/') return serveFile(join(ROOT, 'playground/security.html'));

    if (url.pathname.startsWith('/src/')) {
        const filePath = join(ROOT, url.pathname);
        if (filePath.endsWith('.ts')) {
            const build = await Bun.build({
                entrypoints: [filePath],
                target: "browser",
            });
            return new Response(build.outputs[0], {
                headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' }
            });
        }
        return serveFile(filePath);
    }

    if (url.pathname.startsWith('/vfs/')) {
        return new Response('console.log("VFS Loaded");', {
            headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' }
        });
    }

    return new Response("Not Found: " + url.pathname, { status: 404 });
  }
});
console.log("Lofi Server on 4444");
