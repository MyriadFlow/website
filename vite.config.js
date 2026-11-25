import { defineConfig } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const page = (file) => fileURLToPath(new URL(file, import.meta.url));
const root = fileURLToPath(new URL(".", import.meta.url));

/* Shared chrome lives once, in partials/: `<!--@include nav-->` pulls in partials/nav.html.
   Resolved for both the dev server and the build, so what CI checks is what ships. */
function includes() {
  const read = (name) => readFileSync(resolve(root, "partials", `${name}.html`), "utf8").trimEnd();
  return {
    name: "myriadflow-includes",
    enforce: "pre",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(/([ \t]*)<!--@include ([\w-]+)-->/g, (_m, indent, name) =>
          read(name)
            .split("\n")
            .map((line) => (line ? indent + line : line))
            .join("\n"),
        );
      },
    },
    configureServer(server) {
      server.watcher.add(resolve(root, "partials"));
      server.watcher.on("change", (file) => {
        if (file.includes("partials/")) server.ws.send({ type: "full-reload" });
      });
      server.middlewares.use(cleanUrls(root));
    },
    configurePreviewServer(server) {
      server.middlewares.use(cleanUrls(resolve(root, "dist")));
    },
  };
}

/* GitHub Pages serves /builds from builds/index.html; locally, send it to /builds/ so
   the same links work in `vite dev`, `vite preview` and production. */
function cleanUrls(base) {
  return (req, res, next) => {
    const [path, query = ""] = req.url.split("?");
    if (
      path.length > 1 &&
      !path.endsWith("/") &&
      !path.startsWith("/@") &&
      !path.split("/").pop().includes(".") &&
      existsSync(resolve(base, `.${path}`, "index.html"))
    ) {
      // 302: a 301 would stick in the browser cache across config changes
      res.writeHead(302, { Location: `${path}/${query && `?${query}`}` });
      return res.end();
    }
    next();
  };
}

export default defineConfig({
  plugins: [includes()],
  appType: "mpa",
  build: {
    // the pitch deck and the Builds teardown bundle three.js for their 3D models
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: page("./index.html"),
        builds: page("./builds/index.html"),
        phygitals: page("./phygitals/index.html"),
        contact: page("./contact/index.html"),
        terms: page("./legal/terms/index.html"),
        privacy: page("./legal/privacy/index.html"),
        "creator-terms": page("./legal/creator-terms/index.html"),
        "community-guidelines": page("./legal/community-guidelines/index.html"),
        "archive-creator-terms": page("./legal/archive/creator-terms/index.html"),
        "archive-community-guidelines": page("./legal/archive/community-guidelines/index.html"),
        resources: page("./resources/index.html"),
        pitch: page("./resources/pitch/index.html"),
      },
    },
  },
});
