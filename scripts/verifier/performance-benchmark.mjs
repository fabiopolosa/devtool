#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const targetUrl = process.env.VERIFIER_TARGET_URL;
const indexPath = path.resolve(root, "apps/web/dist/index.html");
const reportPath = path.resolve(root, "artifacts/performance/dashboard-performance.json");

const thresholds = {
  domContentLoadedMs: Number(process.env.PERF_MAX_DCL_MS ?? 5000),
  loadEventMs: Number(process.env.PERF_MAX_LOAD_MS ?? 8000)
};

const ensureBuiltAsset = async () => {
  if (targetUrl) {
    return;
  }

  try {
    await stat(indexPath);
  } catch {
    throw new Error("Missing apps/web/dist/index.html. Run `pnpm --filter @cp/web build` before performance verification.");
  }
};

const run = async () => {
  await ensureBuiltAsset();
  await mkdir(path.dirname(reportPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let metrics;
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const pageUrl = targetUrl ?? `file://${indexPath}`;
    const startedAt = Date.now();
    await page.goto(pageUrl, { waitUntil: "networkidle" });

    const navigationMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      if (!nav) return null;
      const entry = nav;
      return {
        domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
        loadEventMs: Math.round(entry.loadEventEnd)
      };
    });

    metrics = {
      totalWallClockMs: Date.now() - startedAt,
      ...(navigationMetrics ?? { domContentLoadedMs: -1, loadEventMs: -1 })
    };
  } finally {
    await browser.close();
  }

  const failures = [];
  if (metrics.domContentLoadedMs > thresholds.domContentLoadedMs) {
    failures.push(`domContentLoadedMs ${metrics.domContentLoadedMs} > ${thresholds.domContentLoadedMs}`);
  }
  if (metrics.loadEventMs > thresholds.loadEventMs) {
    failures.push(`loadEventMs ${metrics.loadEventMs} > ${thresholds.loadEventMs}`);
  }

  const report = {
    check: "performance_benchmark",
    status: failures.length === 0 ? "pass" : "fail",
    target: targetUrl ?? `file://${indexPath}`,
    thresholds,
    metrics,
    failures,
    generatedAt: new Date().toISOString()
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  if (failures.length > 0) {
    console.error(`[performance] FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }

  console.log(`[performance] PASS - report: ${reportPath}`);
};

run().catch((error) => {
  console.error(`[performance] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
