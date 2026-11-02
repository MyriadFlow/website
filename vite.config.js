import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const page = (file) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: page("./index.html"),
        contact: page("./contact.html"),
      },
    },
  },
});
