import tseslint from 'typescript-eslint'

export default [
	{ ignores: ['dist/**', '.test-build/**', 'node_modules/**'] },
	{
		files: ['src/**/*.{ts,tsx}'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: { ecmaFeatures: {} },
		},
		plugins: {},
	},
]