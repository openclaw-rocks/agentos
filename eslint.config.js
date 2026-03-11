import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import-x";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/src-tauri/**",
      "**/*.js",
      "**/*.cjs",
      "**/*.mjs",
    ],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript strict rules
  ...tseslint.configs.strict,

  // Import ordering
  {
    plugins: { "import-x": importPlugin },
    rules: {
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import-x/no-duplicates": "error",
    },
  },

  // Our project rules
  {
    rules: {
      // No any
      "@typescript-eslint/no-explicit-any": "error",

      // Prefer unknown over any
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",

      // Allow unused vars prefixed with _
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // No default exports
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportDefaultDeclaration",
          message: "Use named exports only. No default exports.",
        },
      ],

      // Allow empty functions for handler stubs
      "@typescript-eslint/no-empty-function": "off",

      // Non-null assertions are okay in tests and when we've narrowed
      "@typescript-eslint/no-non-null-assertion": "warn",

      // Allow dynamic delete
      "@typescript-eslint/no-dynamic-delete": "off",
    },
  },

  // Config file overrides (vite/vitest require default exports)
  {
    files: ["**/vite.config.ts", "**/vitest.config.ts", "**/vitest.workspace.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },

  // Test file overrides
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-restricted-syntax": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Prettier must be last to override formatting rules
  prettier,
);
