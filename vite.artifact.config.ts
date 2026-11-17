import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Single-file build for hosting as a claude.ai Artifact: React and ReactDOM
 * come from pinned cdnjs UMD scripts, everything else is bundled into one
 * IIFE that scripts/build-artifact.mjs inlines into the page.
 */
const GLOBALS: Record<string, string> = { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' };

export default defineConfig({
  plugins: [react()],
  // Lets the app hide features the artifact viewer does not allow (file downloads).
  define: { 'import.meta.env.VITE_HOSTED': JSON.stringify('1') },
  resolve: {
    alias: { 'react/jsx-runtime': fileURLToPath(new URL('./scripts/jsx-runtime-shim.js', import.meta.url)) },
  },
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/main.tsx', import.meta.url)),
      external: (id) => id in GLOBALS,
      output: {
        format: 'iife',
        globals: GLOBALS,
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]',
      },
    },
  },
});
