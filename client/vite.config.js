import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const base = command === 'build' && env.BUILD_TARGET === 'gh-pages'
    ? '/'
    : '/';

  return {
    base,
    build: {
      outDir: '../docs',
      emptyOutDir: true,
      target: 'es2020',
      rollupOptions: {
        input: '/index.html',
        output: {
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash].[ext]'
        }
      }
    },
    server: {
      origin: 'http://localhost:5173',
    }
  }
})
