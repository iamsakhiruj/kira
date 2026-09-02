import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    // Mirror tsconfig's "@/*" -> "./*" so tests can import modules that use the
    // alias (e.g. proxy.ts importing "@/lib/session").
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
