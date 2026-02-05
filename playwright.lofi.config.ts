import { defineConfig } from "@playwright/test"

export default defineConfig({
    testDir: "test/lofi",
    timeout: 30000,
    use: {
        baseURL: "http://localhost:4444",
        headless: true,
    },
    webServer: {
        command: "bun vendor/lofi-web-sandbox/index.ts",
        url: "http://localhost:4444",
        reuseExistingServer: !true,
        stdout: 'pipe',
        stderr: 'pipe',
    },
})
