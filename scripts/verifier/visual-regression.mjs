#!/usr/bin/env node
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const targetUrl = process.env.VERIFIER_TARGET_URL;
const indexPath = path.resolve(root, "apps/web/dist/index.html");
const outputDir = path.resolve(root, "artifacts/visual/current");
const baselineDir = path.resolve(root, "artifacts/visual/baseline");
const screenshotPath = path.join(outputDir, "dashboard-home.png");
const baselinePath = path.join(baselineDir, "dashboard-home.png");
const reportPath = path.resolve(root, "artifacts/visual/report.json");

const ensureBuiltAsset = async () => {
  if (targetUrl) {
    return;
  }

  try {
    await stat(indexPath);
  } catch {
    throw new Error("Missing apps/web/dist/index.html. Run `pnpm --filter @cp/web build` before visual verification.");
  }
};

const sha256 = async (filePath) => {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
};

const run = async () => {
  await ensureBuiltAsset();
  await mkdir(outputDir, { recursive: true });
  await mkdir(baselineDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const pageUrl = targetUrl ?? `file://${indexPath}`;
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } finally {
    await browser.close();
  }

  let baselineCreated = false;
  try {
    await stat(baselinePath);
  } catch {
    await copyFile(screenshotPath, baselinePath);
    baselineCreated = true;
  }

  const currentHash = await sha256(screenshotPath);
  const baselineHash = await sha256(baselinePath);
  const matched = currentHash === baselineHash;

  const report = {
    check: "visual_regression",
    status: matched ? "pass" : baselineCreated ? "pass" : "fail",
    baselineCreated,
    matched,
    target: targetUrl ?? `file://${indexPath}`,
    currentHash,
    baselineHash,
    screenshotPath,
    baselinePath,
    generatedAt: new Date().toISOString()
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  if (!matched && !baselineCreated) {
    console.error("[visual] Regression detected: screenshot hash changed.");
    process.exit(1);
  }

  console.log(`[visual] ${report.status.toUpperCase()} - report: ${reportPath}`);
};

run().catch((error) => {
  console.error(`[visual] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
