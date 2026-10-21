import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;

/**
 * End-to-end tests against a production build (the service worker only caches hashed assets in
 * production mode). Uses the installed Edge or Chrome, with a fake microphone and camera.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    permissions: ["microphone", "camera"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  projects: [
    {
      name: "phone",
      testIgnore: /present\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        channel: process.env.PW_CHANNEL ?? "msedge",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "desktop",
      testMatch: /present\.spec\.ts/,
      use: {
        ...devices["Desktop Edge"],
        channel: process.env.PW_CHANNEL ?? "msedge",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      DEBRIEF_SNAPSHOT: path.join(process.cwd(), ".data", "e2e-store.json"),
    },
  },
});
