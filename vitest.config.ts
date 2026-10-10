import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		restoreMocks: true,
		unstubGlobals: true,
		environment: 'jsdom',
		include: ['tests/client/**/*.test.ts'],
		setupFiles: ['tests/client/setup.ts'],
	},
});
