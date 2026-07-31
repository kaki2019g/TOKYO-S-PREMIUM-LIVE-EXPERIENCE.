import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(rootDir, "dist");
const staticFiles = ["index.html", "styles.css", "app.js", "favicon.svg"];

await rm(outputDir, { recursive: true, force: true });
await mkdir(path.join(outputDir, "data"), { recursive: true });

await Promise.all(
  staticFiles.map((file) => copyFile(path.join(rootDir, file), path.join(outputDir, file))),
);
await copyFile(path.join(rootDir, "data", "events.json"), path.join(outputDir, "data", "events.json"));

console.log(`Built static site in ${outputDir}`);
