import { defineConfig } from "@playwright/test"

export default defineConfig({
    testDir: ".",
    timeout: 30000,
    use: {
        baseURL: "http://localhost:3333",
        headless: true,
        launchOptions: {
            args: ['--host-resolver-rules=MAP sandbox.localhost 127.0.0.1, MAP *.sandbox.localhost 127.0.0.1'],
        },
    },
})
