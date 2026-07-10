export default {
  app: {
    name: "porkauto",
    identifier: "dev.porkauto.app",
    version: "0.0.1",
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
      external: [],
    },
    // Vite builds the React UI — Electrobun only copies dist into views://
    views: {},
    copy: {
      "dist/app/index.html": "views/app/index.html",
      "dist/app/assets": "views/app/assets",
    },
    watchIgnore: ["dist/**"],
    mac: {
      bundleCEF: false,
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
};
