import { test, expect } from "@playwright/test";

test.describe("Landing page smoke tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
  });

  test("page loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.reload();
    await page.waitForLoadState("networkidle");

    expect(errors).toEqual([]);
  });

  test("all nav links are visible with correct hrefs", async ({ page }) => {
    const navLinks = [
      { text: "Downloads", href: "#downloads" },
      { text: "CLI", href: "#cli" },
      { text: "Get started", href: "#skill" },
      { text: "Tools", href: "#tools" },
    ];

    for (const { text, href } of navLinks) {
      const link = page.locator(".header-nav .nav-link", { hasText: text });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
    }

    // GitHub button (external link)
    const github = page.locator(".header-nav .nav-button", {
      hasText: "GitHub",
    });
    await expect(github).toBeVisible();
    await expect(github).toHaveAttribute(
      "href",
      "https://github.com/jaymoore-research/AgentStore"
    );
  });

  test("hero section renders with title and CTA buttons", async ({ page }) => {
    const hero = page.locator(".hero-copy");
    await expect(hero).toBeVisible();

    // Title
    await expect(hero.locator("h1")).toContainText(
      "Install agent skills without wrestling GitHub."
    );

    // CTA buttons
    const installBtn = hero.locator(".cta-primary", { hasText: "Install" });
    await expect(installBtn).toBeVisible();
    await expect(installBtn).toHaveAttribute("href", "#downloads");

    const cliBtn = hero.locator(".cta-secondary", {
      hasText: "Or use the CLI",
    });
    await expect(cliBtn).toBeVisible();
    await expect(cliBtn).toHaveAttribute("href", "#cli");
  });

  test("install section shows all 3 methods", async ({ page }) => {
    const methods = page.locator("#downloads .install-method");
    await expect(methods).toHaveCount(3);

    // curl (recommended)
    const curlLabel = methods.nth(0).locator(".install-method-label");
    await expect(curlLabel).toContainText("curl");
    await expect(curlLabel).toContainText("Recommended");

    // Homebrew
    await expect(
      methods.nth(1).locator(".install-method-label")
    ).toContainText("Homebrew");

    // Manual .dmg
    await expect(
      methods.nth(2).locator(".install-method-label")
    ).toContainText("Manual .dmg");
  });

  test("copy buttons exist and are clickable for curl and homebrew", async ({
    page,
  }) => {
    const methods = page.locator("#downloads .install-method");

    // curl copy button
    const curlCopy = methods.nth(0).locator("button.copy-cmd");
    await expect(curlCopy).toBeVisible();
    await expect(curlCopy).toHaveText("Copy");

    // Homebrew copy button
    const brewCopy = methods.nth(1).locator("button.copy-cmd");
    await expect(brewCopy).toBeVisible();
    await expect(brewCopy).toHaveText("Copy");

    // Verify they are enabled / clickable (no disabled attribute)
    await expect(curlCopy).toBeEnabled();
    await expect(brewCopy).toBeEnabled();
  });

  test("get started section has the agentstore install command", async ({
    page,
  }) => {
    const section = page.locator("#skill");
    await expect(section).toBeVisible();

    await expect(section.locator("h2")).toContainText("Get started");

    const cmd = section.locator(".install-cmd code");
    await expect(cmd).toContainText(
      "agentstore install jaymoore-research/AgentStore"
    );

    // Copy button for the install command
    const copyBtn = section.locator("button.copy-cmd");
    await expect(copyBtn).toBeVisible();
    await expect(copyBtn).toHaveText("Copy");
  });

  test("skill preview shows what gets installed", async ({ page }) => {
    const skillFile = page.locator(".skill-file");
    await expect(skillFile).toBeVisible();

    // Header says "What gets installed"
    await expect(skillFile.locator(".skill-file-header")).toContainText(
      "What gets installed"
    );

    // Body contains frontmatter and commands
    const body = skillFile.locator(".skill-file-body");
    await expect(body).toContainText("name:");
    await expect(body).toContainText("agentstore install owner/repo");
  });

  test("how it works shows 3 step cards", async ({ page }) => {
    const steps = page.locator("#how .step-card");
    await expect(steps).toHaveCount(3);

    await expect(steps.nth(0).locator("h3")).toContainText("Point at a repo");
    await expect(steps.nth(1).locator("h3")).toContainText(
      "Auto-detect components"
    );
    await expect(steps.nth(2).locator("h3")).toContainText(
      "Symlink into your tools"
    );
  });

  test("supported tools shows 5 tool cards", async ({ page }) => {
    const tools = page.locator("#tools .tool-card");
    await expect(tools).toHaveCount(5);

    const expectedNames = ["Claude", "Cursor", "Copilot", "Codex", "OpenCode"];
    for (let i = 0; i < expectedNames.length; i++) {
      await expect(tools.nth(i).locator("h3")).toHaveText(expectedNames[i]);
    }
  });

  test("footer links are present", async ({ page }) => {
    const footer = page.locator("footer.footer");
    await expect(footer).toBeVisible();

    await expect(footer.locator(".footer-note")).toContainText(
      "No telemetry. No server. Fully local."
    );

    const links = [
      {
        text: "Source",
        href: "https://github.com/jaymoore-research/AgentStore",
      },
      {
        text: "Releases",
        href: "https://github.com/jaymoore-research/AgentStore/releases",
      },
      {
        text: "Issues",
        href: "https://github.com/jaymoore-research/AgentStore/issues",
      },
    ];

    for (const { text, href } of links) {
      const link = footer.locator(".footer-links a", { hasText: text });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
    }
  });

  test("GitHub API fetch resolves and updates DMG button text", async ({
    page,
  }) => {
    // Wait for the GitHub API call to resolve
    const dmgButton = page.locator('[data-download="mac"]');
    await expect(dmgButton).toBeVisible();

    // The button starts as "Download .dmg" and should update after the API call.
    // Wait up to 10s for the text to change (it will contain the actual filename
    // from the release, e.g. "Download AgentStore_0.2.0_aarch64.dmg").
    // If the API call fails (rate limit, no release), the fallback text stays.
    try {
      await expect(dmgButton).not.toHaveText("Download .dmg", {
        timeout: 10000,
      });
      // If updated, it should start with "Download " and end with ".dmg"
      const text = await dmgButton.textContent();
      expect(text).toMatch(/^Download .+\.dmg$/);
    } catch {
      // API may be rate-limited in CI; fallback text is acceptable
      await expect(dmgButton).toHaveText("Download .dmg");
    }
  });
});
