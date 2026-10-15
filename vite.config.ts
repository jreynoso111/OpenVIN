import { defineConfig } from 'vite';

export default defineConfig({
  // Vercel serves this app at the domain root. GitHub Pages uses build:pages.
  base: '/',
  build: {
    target: 'es2020',
  },
});
