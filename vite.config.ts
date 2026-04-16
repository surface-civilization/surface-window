/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@visual-grammar': fileURLToPath(new URL('./visual-grammar', import.meta.url)),
    },
    // stats-gl (pulled in by @react-three/drei) lists `three` in both `dependencies`
    // and `peerDependencies`, so npm installs a nested three@0.170.0 alongside the
    // top-level three@0.183.2. Without deduplication, Rollup sees two distinct module
    // paths and ships both, triggering "Multiple instances of Three.js" at runtime.
    // `dedupe` collapses every `three` import to the root node_modules copy.
    dedupe: ['three'],
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy dependencies into stable long-term cache buckets.
        //
        // Observed Rolldown (Vite 8) behaviour: manualChunks hints are not always
        // honoured — React + three.js + postprocessing are coerced into a single
        // vendor-pp chunk (~320 kB gzip), and vendor-r3f (r3f + drei, ~63 kB gzip)
        // imports three.js symbols from vendor-pp. All three chunks are preloaded
        // in parallel; the globe cannot render until vendor-pp completes.
        //
        // vendor-three and vendor-react hints below are retained so if Rolldown
        // ever honours them they produce sensible cache buckets. PostProcessing is
        // still lazy-loaded from App.tsx (React.lazy), deferring its React component
        // one tick after first paint even though the underlying bundle is preloaded.
        manualChunks(id: string) {
          if (id.includes('node_modules/three/')) return 'vendor-three';
          if (
            id.includes('node_modules/postprocessing/') ||
            id.includes('node_modules/@react-three/postprocessing/')
          )
            return 'vendor-pp';
          if (id.includes('node_modules/@react-three/'))
            return 'vendor-r3f';
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/')
          )
            return 'vendor-react';
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
})
