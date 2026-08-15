import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node18',
  clean: true,
  bundle: true,
  noExternal: ['@sweep/core', '@sweep/rules'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
