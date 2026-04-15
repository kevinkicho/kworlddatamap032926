import globals from "globals";

export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        L: "readonly",
        turf: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { "vars": "local", "args": "none" }],
      "no-redeclare": "warn",
      "eqeqeq": ["warn", "always", { "null": "ignore" }],
    },
  },
  {
    files: ["scripts/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { "vars": "local", "args": "none" }],
      "no-redeclare": "warn",
    },
  },
];
