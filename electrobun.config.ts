export default {
  app: {
    name: "hello-world",
    identifier: "helloworld.electrobun.dev",
    version: "0.0.1",
  },
  build: {
    views: {
      mainview: {
        entrypoint: "src/mainview/main.tsx",
        external: [],
      },
    },
    copy: {
      "dist/mainview/index.html": "views/mainview/index.html",
      "dist/mainview/assets": "views/mainview/assets",
    },
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
