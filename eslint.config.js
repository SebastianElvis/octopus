import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript strict rules
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Apply TypeScript rules to TS/TSX files
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // React hooks
      ...reactHooks.configs.recommended.rules,

      // No unused vars (TypeScript handles this, but keep as warning)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // Warn on explicit any
      "@typescript-eslint/no-explicit-any": "warn",

      // Floating promises should be handled
      "@typescript-eslint/no-floating-promises": "error",

      // Consistent type imports
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],

      // Allow void operator to handle floating promises
      "no-void": ["error", { allowAsStatement: true }],

      // Relax some strict rules that are noisy for React apps
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],

      // String.prototype.match() is fine for non-global patterns
      "@typescript-eslint/prefer-regexp-exec": "off",

      // Numbers in template literals are intentional (e.g. timeAgo)
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],

      // void return type in generics is valid for Tauri invoke<void> and Promise<void>
      "@typescript-eslint/no-invalid-void-type": "off",

      // type aliases are fine alongside interfaces
      "@typescript-eslint/consistent-type-definitions": "off",
    },
  },

  // Relaxed rules for test files
  {
    files: [
      "src/**/*.test.{ts,tsx}",
      "src/__tests__/**/*.{ts,tsx}",
      "src/test/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },

  // Ignore generated/build output
  {
    ignores: ["dist/", "src-tauri/", "node_modules/", "*.config.js", "*.config.ts"],
  },
);
