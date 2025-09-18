import { resolve } from 'path';
import { defineConfig } from 'vite';
import copy from 'rollup-plugin-copy';

export default defineConfig({
  build: {
    minify: false,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup.js'), // Aponta para o popup.html na raiz
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
      plugins: [
        // Copia arquivos estáticos para a pasta dist
        copy({
          targets: [
            { src: 'libs/filesaver.js', dest: 'dist/libs' },
            { src: 'manifest.json', dest: 'dist' },
            { src: 'icons/*', dest: 'dist/icons' },
            { src: 'popup.html', dest: 'dist' }
          ],
          hook: 'writeBundle'
        }),
      ],
    },
  },
  publicDir: 'public',
});