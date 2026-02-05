import { serve } from "bun";
import { join } from "path";

const ROOT = join(process.cwd(), 'vendor/lofi-web-sandbox');

serve({
  port: 4444,
  async fetch(req) {
    const url = new URL(req.url);

    // Index
    if (url.pathname === '/') return new Response(Bun.file(join(ROOT, 'playground/security.html')));

    // Source Files (TS Transpilation)
    if (url.pathname.startsWith('/src/')) {
        const filePath = join(ROOT, url.pathname);
        if (filePath.endsWith('.ts')) {
            const build = await Bun.build({
                entrypoints: [filePath],
                target: "browser",
            });
            return new Response(build.outputs[0]);
        }
        return new Response(Bun.file(filePath));
    }

    // Mock VFS
    if (url.pathname.startsWith('/vfs/')) {
        return new Response('console.log("VFS Loaded"); window.parent.postMessage({type:"LOG", args:["VFS Loaded"]}, "*");', {
            headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' }
        });
    }

    return new Response("Not Found: " + url.pathname, { status: 404 });
  }
});
console.log("Lofi Server on 4444");
