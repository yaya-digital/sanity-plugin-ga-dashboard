import {defineConfig} from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'server/index': 'src/server/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['sanity', 'react', '@sanity/ui', '@sanity/icons', 'next', 'next/server', '@vercel/kv'],
  esbuildOptions(options) {
    options.jsx = 'automatic'
  },
})
