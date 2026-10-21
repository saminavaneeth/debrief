import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // Orchestrator purity: the agent layer knows modules only through the gateway.
    files: ["src/agents/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/mcp/servers", "@/mcp/servers/*", "**/mcp/servers", "**/mcp/servers/*"],
              message: "src/agents must not import mock servers; use the gateway.",
            },
            {
              group: ["@/mcp/store", "@/mcp/store/*", "**/mcp/store/*"],
              message: "src/agents must not read the store directly; use the gateway.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".data/**"]),
]);

export default eslintConfig;
