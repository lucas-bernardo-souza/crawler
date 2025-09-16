import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'), // Aponta para o popup.html na raiz
        background: resolve(__dirname, 'src/background.js'),
        content: resolve(__dirname, 'src/content.js'),
        crawler: resolve(__dirname, 'src/crawler.js'),
        tracer: resolve(__dirname, 'src/tracer.js')
      },
      output: {
        // Gera arquivos com nomes fixos no diretório de saída
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  publicDir: 'public',
});