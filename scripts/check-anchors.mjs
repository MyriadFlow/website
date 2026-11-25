/* Checks every in-page link in dist/ against the ids that exist on the page it points to,
 * so a moved section (say, #launchpad leaving the homepage for /builds) fails CI instead
 * of silently scrolling nowhere. Also catches include markers the build left unresolved.
 *
 *   node scripts/check-anchors.mjs [dist]
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, posix } from "node:path";

const dist = resolve(process.argv[2] ?? "dist");

async function pages(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await pages(full)));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

// the route a page answers to: dist/builds/index.html -> /builds
const routeOf = (file) =>
  "/" + relative(dist, file).replace(/index\.html$/, "").replace(/\.html$/, "").replace(/\/$/, "");

const files = await pages(dist);
const ids = new Map(); // route -> Set(ids)
const docs = new Map(); // route -> html
const problems = [];

for (const file of files) {
  const html = await readFile(file, "utf8");
  const route = routeOf(file);
  docs.set(route, html);
  ids.set(route, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  for (const m of html.matchAll(/<!--@include\s+([\w-]+)-->/g)) {
    problems.push(`${route}: include marker left unresolved: ${m[0]}`);
  }
}

for (const [route, html] of docs) {
  const hrefs = [...html.matchAll(/href="([^"]*#[^"]+)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    if (/^(https?:|mailto:|tel:)/.test(href)) continue;
    const [path, hash] = href.split("#");
    const target = !path
      ? route
      : path.startsWith("/")
        ? path.replace(/\/$/, "") || "/"
        : posix.normalize(posix.join(route, "..", path)).replace(/\/$/, "") || "/";
    if (!ids.has(target)) {
      problems.push(`${route}: ${href} → no page at ${target}`);
    } else if (!ids.get(target).has(hash)) {
      problems.push(`${route}: ${href} → ${target} has no #${hash}`);
    }
  }
}

if (problems.length) {
  console.error(`✖ ${problems.length} anchor problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`✓ every in-page anchor in ${files.length} pages resolves`);
