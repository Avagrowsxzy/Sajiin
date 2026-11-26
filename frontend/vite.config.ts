import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';

const webSslDir = path.resolve(__dirname, '../web/ssl');
const webCertificate = path.join(webSslDir, 'web-server-cert.pem');
const webPrivateKey = path.join(webSslDir, 'web-server-key.pem');
const https = fs.existsSync(webCertificate) && fs.existsSync(webPrivateKey)
  ? { cert: fs.readFileSync(webCertificate), key: fs.readFileSync(webPrivateKey) }
  : undefined;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: process.env.VITE_HOST || '127.0.0.1',
    https,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        xfwd: true,
      },
    },
  },
});
