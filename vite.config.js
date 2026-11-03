import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const page = (file) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  build: {
    // the pitch deck bundles three.js for its 3D teardown slides
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: page("./index.html"),
        contact: page("./contact.html"),
        terms: page("./legal/terms.html"),
        privacy: page("./legal/privacy.html"),
        "creator-terms": page("./legal/creator-terms.html"),
        "community-guidelines": page("./legal/community-guidelines.html"),
        pitch: page("./resources/pitch/index.html"),
      },
    },
  },
});
