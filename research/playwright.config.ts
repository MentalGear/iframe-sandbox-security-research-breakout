import { defineConfig } from "@playwright/test"

export default defineConfig({
    testDir: "./01_csp_bypass",
    timeout: 30000,
    use: {
        baseURL: "http://localhost:3333",
        headless: true,
        launchOptions: {
            args: ['--host-resolver-rules=MAP sandbox.localhost 127.0.0.1'],
        },
    },
    webServer: {
        command: "bun server.ts",
        url: "http://localhost:3333",
        reuseExistingServer: true,
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: 'vendor/iframe-sandbox',
    },
})
