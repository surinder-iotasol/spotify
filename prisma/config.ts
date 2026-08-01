import { defineConfig, env } from "prisma/config";

export default defineConfig({
  datasource: {
    db: {
      provider: "mongodb",
      url: env("DATABASE_URL"),
    },
  },
  generator: {
    client: {
      provider: "prisma-client-js",
    },
  },
});
