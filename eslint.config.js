import js from "@eslint/js";
import globals from "globals";

const javascriptFiles = [
    "src/**/*.js",
    "test/**/*.js",
    "test-support/**/*.js",
];

export default [
    {
        ignores: ["node_modules/**", "coverage/**", "dist/**"],
    },
    {
        files: javascriptFiles,
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: globals.node,
        },
        rules: js.configs.recommended.rules,
    },
    {
        files: ["src/app.js"],
        rules: {
            "no-unused-vars": [
                "error",
                {
                    args: "all",
                        argsIgnorePattern: "^(_req|next)$",
                },
            ],
        },
    },
];