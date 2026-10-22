import { defineConfig } from 'vite';

export default defineConfig({
  // Vercel serves the normal app; local Ubuntu development may proxy its private ODI mirror.
  base: '/',
  server: {
    proxy: {
      '/api/v1/nhtsa/odi': {
        target: 'http://127.0.0.1:3117',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (request) => {
            request.setHeader('host', '127.0.0.1:3117');
            request.removeHeader('origin');
            request.removeHeader('sec-fetch-site');
          });
        },
      },
    },
  },
  preview: {
    proxy: {
      '/api/v1/nhtsa/odi': {
        target: 'http://127.0.0.1:3117',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (request) => {
            request.setHeader('host', '127.0.0.1:3117');
            request.removeHeader('origin');
            request.removeHeader('sec-fetch-site');
          });
        },
      },
    },
  },
  build: {
    target: 'es2020',
  },
});
