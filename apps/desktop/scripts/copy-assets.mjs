import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const srcDir = path.join(appRoot, "src");
const distDir = path.join(appRoot, "dist");

const optionalAssets = ["renderer.css"];

await mkdir(distDir, { recursive: true });

for (const asset of optionalAssets) {
  const from = path.join(srcDir, asset);
  const to = path.join(distDir, asset);

  try {
    await access(from);
    await copyFile(from, to);
    console.log(`[desktop] copied asset ${asset}`);
  } catch {
    // Assets are optional in core-only build; UI worker can add them later.
  }
}

const rendererHtmlPath = path.join(srcDir, "renderer.html");
const rendererDistPath = path.join(distDir, "renderer.html");
const rendererCssPath = path.join(srcDir, "renderer.css");

try {
  const [html, css] = await Promise.all([
    readFile(rendererHtmlPath, "utf8"),
    readFile(rendererCssPath, "utf8")
  ]);

  const inlined = html.replace(
    '<link rel="stylesheet" href="./renderer.css" />',
    `<style>\n${css}\n</style>`
  );
  await writeFile(rendererDistPath, inlined, "utf8");
  console.log("[desktop] inlined renderer.css into renderer.html");
} catch {
  // HTML shell assets are optional in core-only build; UI worker can add them later.
}
