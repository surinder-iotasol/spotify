// Prisma v7 config — uses Prisma's defineConfig at build time.
// This file is not imported at runtime; Next.js typescript checker
// just needs it to not fail. The prisma package is not installed
// in node_modules, so we provide a minimal shim.

export function defineConfig(cfg: Record<string, unknown>) {
  return cfg;
}

export default defineConfig({
  datasource: {
    db: {
      provider: "mongodb",
      url: process.env.DATABASE_URL,
    },
  },
  generator: {
    client: {
      provider: "prisma-client-js",
    },
  },
});
