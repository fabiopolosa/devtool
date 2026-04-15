import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import guardrailsPlugin from "./eslint-rules/index.mjs";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**"
    ]
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "cp-guardrails": guardrailsPlugin
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/no-explicit-any": "off"
      ,
      "cp-guardrails/no-direct-prompt-build": [
        "error",
        {
          allowWithin: ["/packages/prompt-builder/"]
        }
      ],
      "cp-guardrails/no-subprompts-outside-builder": [
        "error",
        {
          allowWithin: ["/packages/prompt-builder/"]
        }
      ],
      "cp-guardrails/no-brainstormplan-legacy": "error",
      "cp-guardrails/no-orchestration-outside-ruflo": [
        "error",
        {
          allowWithin: ["/packages/orchestration-ruflo/", "/apps/worker/"]
        }
      ]
    }
  }
];
