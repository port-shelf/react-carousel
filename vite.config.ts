import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => mode === 'library' ? {
  build: {
    lib: {
      entry: 'src/library.js',
      formats: ['es', 'cjs'],
      fileName: (format) => format === 'es' ? 'index.js' : 'index.cjs',
      cssFileName: 'carousel',
    },
    rollupOptions: {
      external: /^react(?:\/|$)/,
    },
  },
} : {
  base: './',
  build: { outDir: 'demo-dist' },
})
