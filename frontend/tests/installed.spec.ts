import { test, expect, Page } from "@playwright/test";

// Mock package data
const MOCK_PACKAGES = [
  {
    name: "gstack",
    repo: "garrytan/gstack",
    description: "Full-stack skill pack",
    stars: 42,
    installed_at: "2025-01-01T00:00:00Z",
    supports: ["claude", "cursor"],
    enabled: {
      claude: { profile: true, projects: [] },
      cursor: { profile: false, projects: ["/Users/test/my-project"] },
    },
    components: {
      skills: [
        { name: "browse", description: "Fast headless browser for QA testing", file_path: ".claude/skills/browse/browse.md", size_bytes: 1200, has_frontmatter: true },
        { name: "review", description: "Pre-landing PR review and analysis", file_path: ".claude/skills/review/review.md", size_bytes: 900, has_frontmatter: true },
        { name: "ship", description: "Ship workflow: merge, test, bump, push", file_path: ".claude/skills/ship/ship.md", size_bytes: 800, has_frontmatter: true },
      ],
      mcp_servers: [],
      instructions: true,
      hooks: [],
      keybindings: [],
    },
  },
  {
    name: "superpowers",
    repo: "superagent/superpowers",
    description: "Agent superpowers",
    stars: 100,
    installed_at: "2025-01-02T00:00:00Z",
    supports: ["claude"],
    enabled: {
      claude: { profile: true, projects: [] },
    },
    components: {
      skills: [
        { name: "brainstorming", description: "Creative brainstorming for features", file_path: ".claude/skills/brainstorming/brainstorming.md", size_bytes: 600, has_frontmatter: true },
        { name: "tdd", description: "Test-driven development workflow", file_path: ".claude/skills/tdd/tdd.md", size_bytes: 700, has_frontmatter: true },
      ],
      mcp_servers: ["mcp-test"],
      instructions: false,
      hooks: ["pre-commit"],
      keybindings: [],
    },
  },
];

/** Inject Tauri mock API into the page before it loads. */
async function setupMocks(page: Page, options?: { packages?: typeof MOCK_PACKAGES }) {
  const packages = options?.packages ?? MOCK_PACKAGES;

  await page.addInitScript((pkgs) => {
    // Track all invoke calls for assertions
    (window as any).__INVOKE_LOG__ = [] as Array<{ cmd: string; args: any }>;
    // Mutable state so tests can verify mutations
    (window as any).__MOCK_PACKAGES__ = JSON.parse(JSON.stringify(pkgs));

    // Mock Tauri internals
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        (window as any).__INVOKE_LOG__.push({ cmd, args });
        const packages = (window as any).__MOCK_PACKAGES__;

        switch (cmd) {
          case "list_packages":
            return JSON.parse(JSON.stringify(packages));

          case "check_for_updates":
            return ["gstack"]; // gstack always has an update

          case "check_platform_dir":
            return true;

          case "get_config":
            return { github_token: null, first_run: false };

          case "toggle_platform": {
            const pkg = packages.find((p: any) => p.name === args.name);
            if (!pkg) throw new Error("Package not found");
            if (args.enable) {
              if (!pkg.enabled[args.platformId]) {
                pkg.enabled[args.platformId] = { profile: false, projects: [] };
              }
            } else {
              delete pkg.enabled[args.platformId];
            }
            return null;
          }

          case "toggle_profile": {
            const pkg = packages.find((p: any) => p.name === args.name);
            if (!pkg) throw new Error("Package not found");
            const state = pkg.enabled[args.platformId];
            if (state) state.profile = args.enable;
            return null;
          }

          case "add_project_dir": {
            const pkg = packages.find((p: any) => p.name === args.name);
            if (!pkg) throw new Error("Package not found");
            for (const state of Object.values(pkg.enabled) as any[]) {
              if (!state.projects.includes(args.projectPath)) {
                state.projects.push(args.projectPath);
              }
            }
            return null;
          }

          case "remove_project_dir": {
            const pkg = packages.find((p: any) => p.name === args.name);
            if (!pkg) throw new Error("Package not found");
            for (const state of Object.values(pkg.enabled) as any[]) {
              state.projects = state.projects.filter((p: string) => p !== args.projectPath);
            }
            return null;
          }

          case "uninstall_package": {
            const idx = packages.findIndex((p: any) => p.name === args.name);
            if (idx >= 0) packages.splice(idx, 1);
            return null;
          }

          case "update_package": {
            const pkg = packages.find((p: any) => p.name === args.name);
            if (!pkg) throw new Error("Package not found");
            return pkg;
          }

          case "read_package_file":
            return `# ${args.relPath}\n\nMock content for testing.`;

          case "install_package":
            return packages[0]; // return first mock package

          default:
            console.warn(`Unmocked invoke: ${cmd}`, args);
            return null;
        }
      },
      convertFileSrc: (path: string) => path,
    };

    // Mock the event listener (install-progress)
    (window as any).__TAURI_INTERNALS__.metadata = {
      currentWindow: { label: "main" },
    };
  }, packages);
}

// Navigate to the installed view
async function goToInstalled(page: Page) {
  await page.goto("/installed");
  await page.waitForSelector(".package-card, .empty-state", { timeout: 5000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Installed View", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  test("renders package cards", async ({ page }) => {
    await goToInstalled(page);
    const cards = page.locator(".package-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first().locator(".package-name")).toHaveText("gstack");
    await expect(cards.nth(1).locator(".package-name")).toHaveText("superpowers");
  });

  test("shows update available badge only for packages with updates", async ({ page }) => {
    await goToInstalled(page);
    // gstack should have update badge
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await expect(gstackCard.locator("text=Update available")).toBeVisible();
    // superpowers should NOT have update badge
    const spCard = page.locator(".package-card").filter({ hasText: "superpowers" });
    await expect(spCard.locator("text=Update available")).not.toBeVisible();
  });

  test("check for updates button works", async ({ page }) => {
    await goToInstalled(page);
    const btn = page.locator("text=Check for updates");
    await expect(btn).toBeVisible();
    await btn.click();
    // Should show "Checking..." temporarily
    await expect(page.locator("text=Checking...").or(page.locator("text=Check for updates"))).toBeVisible();
  });

  test("expand/collapse skill list", async ({ page }) => {
    await goToInstalled(page);
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    const skillsBtn = gstackCard.locator(".meta-tag-interactive", { hasText: "Skills: 3" });
    await expect(skillsBtn).toBeVisible();

    // Click to expand
    await skillsBtn.click();
    const skillItems = gstackCard.locator(".skill-item");
    await expect(skillItems).toHaveCount(3);
    await expect(skillItems.first().locator(".skill-item-name")).toHaveText("browse");

    // Click to collapse
    await skillsBtn.click();
    await expect(gstackCard.locator(".skills-dropdown")).not.toBeVisible();
  });
});

test.describe("Settings Modal", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await goToInstalled(page);
  });

  test("opens and closes with Done button", async ({ page }) => {
    // Open settings for gstack
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    // Modal should be visible
    const modal = page.locator(".settings-dialog");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".dialog-title")).toHaveText("gstack Settings");

    // Click Done
    await modal.locator("button", { hasText: "Done" }).click();

    // Modal should be gone
    await expect(modal).not.toBeVisible();
  });

  test("closes by clicking overlay backdrop", async ({ page }) => {
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");
    await expect(modal).toBeVisible();

    // Click the overlay (not the dialog itself)
    await page.locator(".dialog-overlay").click({ position: { x: 10, y: 10 } });
    await expect(modal).not.toBeVisible();
  });

  test("Done button stays clickable after interacting with settings", async ({ page }) => {
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");
    await expect(modal).toBeVisible();

    // Toggle a platform checkbox
    const codexCheckbox = modal.locator("label.platform-check-label", { hasText: "codex" }).locator("input");
    await codexCheckbox.check();
    // Small wait for state update
    await page.waitForTimeout(300);

    // Done should still work
    await modal.locator("button", { hasText: "Done" }).click();
    await expect(modal).not.toBeVisible();
  });

  test("platform checkboxes reflect enabled state", async ({ page }) => {
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");

    // claude and cursor should be checked (they're in enabled)
    const claudeCheck = modal.locator("label.platform-check-label", { hasText: "claude" }).locator("input");
    const cursorCheck = modal.locator("label.platform-check-label", { hasText: "cursor" }).locator("input");
    const codexCheck = modal.locator("label.platform-check-label", { hasText: "codex" }).locator("input");

    await expect(claudeCheck).toBeChecked();
    await expect(cursorCheck).toBeChecked();
    await expect(codexCheck).not.toBeChecked();
  });

  test("toggling platform on calls toggle_platform with enable=true", async ({ page }) => {
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");
    const codexCheck = modal.locator("label.platform-check-label", { hasText: "codex" }).locator("input");
    await codexCheck.check();

    await page.waitForTimeout(500);

    const log = await page.evaluate(() => (window as any).__INVOKE_LOG__);
    const toggleCall = log.find(
      (l: any) => l.cmd === "toggle_platform" && l.args.platformId === "codex"
    );
    expect(toggleCall).toBeTruthy();
    expect(toggleCall.args.enable).toBe(true);
  });

  test("toggling platform off calls toggle_platform with enable=false", async ({ page }) => {
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");
    const cursorCheck = modal.locator("label.platform-check-label", { hasText: "cursor" }).locator("input");
    await cursorCheck.uncheck();

    await page.waitForTimeout(500);

    const log = await page.evaluate(() => (window as any).__INVOKE_LOG__);
    const toggleCall = log.find(
      (l: any) => l.cmd === "toggle_platform" && l.args.platformId === "cursor"
    );
    expect(toggleCall).toBeTruthy();
    expect(toggleCall.args.enable).toBe(false);
  });

  test("profile toggle reflects state and sends toggle_profile", async ({ page }) => {
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");
    const profileCheck = modal.locator(".profile-toggle input");

    // gstack has claude with profile=true, so profile toggle should be checked
    await expect(profileCheck).toBeChecked();

    // Uncheck profile
    await profileCheck.uncheck();
    await page.waitForTimeout(500);

    const log = await page.evaluate(() => (window as any).__INVOKE_LOG__);
    const profileCalls = log.filter((l: any) => l.cmd === "toggle_profile");
    expect(profileCalls.length).toBeGreaterThan(0);
    // Should have called toggle_profile for each enabled platform with enable=false
    expect(profileCalls.every((c: any) => c.args.enable === false)).toBe(true);
  });

  test("profile toggle on then off does not crash", async ({ page }) => {
    // Regression: toggling scope rapidly should not crash the app
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");
    const profileCheck = modal.locator(".profile-toggle input");

    await expect(profileCheck).toBeChecked();

    // Toggle off
    await profileCheck.uncheck();
    await page.waitForTimeout(300);

    // Toggle back on
    await profileCheck.check();
    await page.waitForTimeout(300);

    // App should still be responsive, modal should still be visible
    await expect(modal).toBeVisible();

    // Verify all toggle_profile calls were made
    const log = await page.evaluate(() => (window as any).__INVOKE_LOG__);
    const profileCalls = log.filter((l: any) => l.cmd === "toggle_profile");
    // Should have calls for disable (all platforms) then enable (all platforms)
    expect(profileCalls.length).toBeGreaterThanOrEqual(4); // 2 platforms x 2 toggles

    // Done button should still work
    await modal.locator("button", { hasText: "Done" }).click();
    await expect(modal).not.toBeVisible();
  });

  test("app shows error when toggle_profile fails instead of crashing", async ({ page }) => {
    // Set up mocks fresh with a failing toggle_profile
    await setupMocks(page);

    // Inject error-throwing override after page loads
    await page.goto("/installed");
    await page.waitForSelector(".package-card", { timeout: 5000 });

    await page.evaluate(() => {
      const tauri = (window as any).__TAURI_INTERNALS__;
      const orig = tauri.invoke.bind(tauri);
      tauri.invoke = async (cmd: string, args: any) => {
        if (cmd === "toggle_profile") {
          throw new Error("Cannot resolve skills directory for platform claude");
        }
        return orig(cmd, args);
      };
    });

    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");
    const profileCheck = modal.locator(".profile-toggle input");

    // Toggle off should trigger the error (use click, not uncheck,
    // because the error handler reloads state which resets the checkbox)
    await profileCheck.click();
    await page.waitForTimeout(500);

    // App should still be alive (not crashed), modal still visible
    await expect(modal).toBeVisible();

    // Error message should be displayed somewhere
    const errorText = page.locator("text=Cannot resolve skills directory");
    await expect(errorText).toBeVisible({ timeout: 3000 });
  });

  test("project list shows existing projects", async ({ page }) => {
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");
    // gstack's cursor platform has project /Users/test/my-project
    const projectEntry = modal.locator(".project-entry");
    await expect(projectEntry).toHaveCount(1);
    await expect(projectEntry.locator(".project-path")).toHaveText("/Users/test/my-project");
  });

  test("remove project button calls remove_project_dir", async ({ page }) => {
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");
    const removeBtn = modal.locator(".project-remove");
    await removeBtn.click();

    await page.waitForTimeout(500);

    const log = await page.evaluate(() => (window as any).__INVOKE_LOG__);
    const removeCall = log.find((l: any) => l.cmd === "remove_project_dir");
    expect(removeCall).toBeTruthy();
    expect(removeCall.args.name).toBe("gstack");
    expect(removeCall.args.projectPath).toBe("/Users/test/my-project");
  });

  test("add project button is visible", async ({ page }) => {
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");
    const addBtn = modal.locator("button", { hasText: "+ Add project" });
    await expect(addBtn).toBeVisible();
    await expect(addBtn).toBeEnabled();
  });

  test("uninstall button in settings calls uninstall_package", async ({ page }) => {
    // Override confirm dialog
    page.on("dialog", (dialog) => dialog.accept());

    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");
    await modal.locator("button", { hasText: "Uninstall" }).click();

    await page.waitForTimeout(500);

    const log = await page.evaluate(() => (window as any).__INVOKE_LOG__);
    const uninstallCall = log.find((l: any) => l.cmd === "uninstall_package");
    expect(uninstallCall).toBeTruthy();
    expect(uninstallCall.args.name).toBe("gstack");

    // Modal should close after uninstall
    await expect(modal).not.toBeVisible();
  });

  test("settings modal scrollable body does not hide footer", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 400 }); // Small viewport

    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator("text=Settings").click();

    const modal = page.locator(".settings-dialog");
    const doneBtn = modal.locator("button", { hasText: "Done" });

    // The Done button should be visible even in a small viewport
    await expect(doneBtn).toBeVisible();

    // And it should be clickable
    await doneBtn.click();
    await expect(modal).not.toBeVisible();
  });
});

test.describe("Doc Modal", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await goToInstalled(page);
  });

  test("clicking Instructions opens doc modal", async ({ page }) => {
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator(".meta-tag-interactive", { hasText: "Instructions" }).click();

    const docModal = page.locator(".doc-modal");
    await expect(docModal).toBeVisible();
    await expect(docModal.locator(".doc-modal-title")).toContainText("Instructions");
  });

  test("doc modal close button works", async ({ page }) => {
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    await gstackCard.locator(".meta-tag-interactive", { hasText: "Instructions" }).click();

    const docModal = page.locator(".doc-modal");
    await expect(docModal).toBeVisible();

    await docModal.locator(".doc-modal-close").click();
    await expect(docModal).not.toBeVisible();
  });

  test("clicking skill item opens doc modal for that skill", async ({ page }) => {
    const gstackCard = page.locator(".package-card").filter({ hasText: "gstack" });
    // Expand skills
    await gstackCard.locator(".meta-tag-interactive", { hasText: "Skills: 3" }).click();
    // Click a skill row
    await gstackCard.locator(".skill-item", { hasText: "browse" }).click();

    const docModal = page.locator(".doc-modal");
    await expect(docModal).toBeVisible();
    await expect(docModal.locator(".doc-modal-title")).toContainText("browse");
  });
});

test.describe("Empty state", () => {
  test("shows empty message when no packages installed", async ({ page }) => {
    await setupMocks(page, { packages: [] });
    await goToInstalled(page);
    await expect(page.locator(".empty-state")).toBeVisible();
    await expect(page.locator(".empty-state")).toContainText("No packages installed");
  });
});
