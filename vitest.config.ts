import { defineConfig } from 'vitest/config';

// Only our tests: visa/similar-tools/** and website/** have their own *.test.ts files.
export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
        environment: 'node',
    },
});
