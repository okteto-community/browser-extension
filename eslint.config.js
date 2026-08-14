"use strict";

const js = require("@eslint/js");

const EXTENSION_GLOBALS = {
  chrome: "readonly",
  document: "readonly",
  window: "readonly",
  fetch: "readonly",
  AbortController: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  URL: "readonly",
  module: "writable",
  require: "readonly",
};

module.exports = [
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: EXTENSION_GLOBALS,
    },
    rules: {
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The extension loads api.js and popup.js as plain scripts sharing one
    // global scope, so popup.js legitimately references api.js's functions.
    files: ["popup.js"],
    languageOptions: {
      globals: {
        ...EXTENSION_GLOBALS,
        fetchSpaces: "readonly",
        normalizeInstanceUrl: "readonly",
        defaultDomainsFor: "readonly",
        parseDomains: "readonly",
        originPatternsFor: "readonly",
        permissionOriginsFor: "readonly",
      },
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        ...EXTENSION_GLOBALS,
        global: "writable",
        jest: "readonly",
        describe: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        __dirname: "readonly",
      },
    },
  },
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: { ...EXTENSION_GLOBALS, process: "readonly", __dirname: "readonly" },
    },
  },
];
