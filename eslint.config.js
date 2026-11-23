/**
 * Lint rules. The later blocks keep the layers apart: data stays free of React,
 * state does not import pages, and Recharts can only be imported from graph components.
 */

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ["src/data/**/*.{ts,tsx}"],
    rules: {
      "no-console": "warn",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "src/data must stay free of React." },
            { name: "react-dom", message: "src/data must stay free of React." },
            {
              name: "react-router-dom",
              message: "src/data must stay free of routing.",
            },
            {
              name: "recharts",
              message: "src/data must stay free of Recharts.",
            },
            {
              name: "@tanstack/react-table",
              message: "src/data must stay free of TanStack Table.",
            },
          ],
          patterns: [
            {
              group: ["@/state", "@/state/*"],
              message: "src/data must not import from state/.",
            },
            {
              group: ["@/components", "@/components/*"],
              message: "src/data must not import from components/.",
            },
            {
              group: ["@/pages", "@/pages/*"],
              message: "src/data must not import from pages/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/state/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-router-dom",
              message: "src/state must not import react-router-dom.",
            },
            {
              name: "recharts",
              message: "recharts may only be imported from components/graphs/.",
            },
          ],
          patterns: [
            {
              group: ["@/components", "@/components/*"],
              message: "src/state must not import from components/.",
            },
            {
              group: ["@/pages", "@/pages/*"],
              message: "src/state must not import from pages/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}"],
    ignores: ["src/components/graphs/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "recharts",
              message: "recharts may only be imported from components/graphs/.",
            },
          ],
          patterns: [
            {
              group: ["@/pages", "@/pages/*"],
              message: "src/components must not import from pages/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/graphs/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/pages", "@/pages/*"],
              message: "src/components must not import from pages/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/pages/**/*.{ts,tsx}", "src/App.tsx", "src/main.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "recharts",
              message: "recharts may only be imported from components/graphs/.",
            },
          ],
        },
      ],
    },
  },
);
