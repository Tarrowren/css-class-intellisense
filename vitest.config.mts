import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "lezer-used-name",
          include: ["lezer/used-name/test/*.ts"],
        },
      },
      {
        test: {
          name: "lezer-less",
          include: ["lezer/less/test/*.ts"],
        },
      },
    ],
  },
});
