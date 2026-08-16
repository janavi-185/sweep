import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node22',
  clean: true,
  bundle: true,
  noExternal: ['@sweep/core', '@sweep/rules', '@sweep/types', '@sweep/database'],
  external: ['node:sqlite'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
