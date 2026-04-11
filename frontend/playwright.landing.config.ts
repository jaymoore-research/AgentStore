import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./tests",
  testMatch: "landing.spec.ts",
  timeout: 15000,
  use: {
    baseURL: "http://localhost:4174",
    headless: true,
  },
  webServer: {
    command: `npx serve ${path.resolve(__dirname, "../landing")} -l 4174 --no-clipboard`,
    port: 4174,
    reuseExistingServer: true,
  },
});
