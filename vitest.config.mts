import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "used-name",
          include: ["lezer/used-name/test/*.ts"],
        },
      },
    ],
  },
});
