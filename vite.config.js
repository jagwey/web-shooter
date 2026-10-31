import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4731,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4731,
    strictPort: true,
  },
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        main: "index.html",
        overlay: "overlay.html",
      },
    },
  },
});
