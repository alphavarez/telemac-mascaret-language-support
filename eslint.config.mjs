import tseslint from 'typescript-eslint';
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';

export default [
    {
        files: ['**/*.ts', 'eslint.config.mjs'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
    {
        plugins: {
            '@typescript-eslint': tseslint.plugin,
            '@stylistic': stylistic,
        },

        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 2022,
            sourceType: 'module',
        },

        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'import',
                    format: ['camelCase', 'PascalCase'],
                },
            ],

            curly: 'off',
            eqeqeq: 'warn',
            'no-throw-literal': 'warn',
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/indent': ['warn', 4, {
                'flatTernaryExpressions': true,
                'SwitchCase': 1,
            }],
            'no-useless-assignment': 'warn',
            '@stylistic/comma-dangle': ['warn', 'always-multiline'],
            '@stylistic/eol-last': ['warn', 'always'],
            '@stylistic/no-extra-parens': ['warn', 'all'],
            '@stylistic/no-trailing-spaces': ['warn', { 'ignoreComments': true }],
            '@stylistic/quotes': ['error', 'single', { 'avoidEscape': true }],
            '@typescript-eslint/no-empty-function': 'off',
            'prefer-const': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    'argsIgnorePattern': '^_',
                },
            ],
        },
    },
    {
        files: ['esbuild.js'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser,
            },
            parserOptions: {
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
];
