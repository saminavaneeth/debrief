import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter";

/** Server-side helpers for reading the JSON and markdown files under `data/` and `fixtures/`. */

export const PROJECT_ROOT = process.cwd();

// Data files are read at runtime from the checkout; the app runs as one long-lived Node process.
export const dataPath = (...segments: string[]) =>
  path.join(/*turbopackIgnore: true*/ PROJECT_ROOT, ...segments);

export function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Files in a directory (non-recursive) with the given extension, sorted by name. */
export function listFiles(dir: string, ext: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(ext))
    .sort()
    .map((name) => path.join(dir, name));
}

/** Files under a directory tree with the given extension, sorted by path. */
export function listFilesDeep(dir: string, ext: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

export function readMarkdown(file: string) {
  return parseFrontmatter(fs.readFileSync(file, "utf8"));
}
