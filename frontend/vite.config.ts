import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const webSslDir = path.resolve(__dirname, '../web/ssl');
const webCertificate = path.join(webSslDir, 'web-server-cert.pem');
const webPrivateKey = path.join(webSslDir, 'web-server-key.pem');
const https = fs.existsSync(webCertificate) && fs.existsSync(webPrivateKey)
  ? { cert: fs.readFileSync(webCertificate), key: fs.readFileSync(webPrivateKey) }
  : undefined;

type MiddlewareServer = {
  use: (fn: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void) => void;
};

/** Decode percent-encoding berlapis (mis. `%2573` -> `%73` -> `s`) dengan batas aman. */
function decodePathname(value: string): string {
  let current = value;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

/**
 * Normalisasi path mentah ke bentuk kanonik: decode persen, samakan `\` -> `/`, ciutkan `/`
 * ganda, selesaikan segmen `.`/`..`, dan buang `/` di ujung.
 *
 * Finding A-F1: guard `pathname === '/staff.html'` sebelumnya hanya cocok untuk string persis,
 * sehingga `//staff.html`, `/%73taff.html`, `/staff.html/`, `\staff.html`, dsb. tetap menyajikan
 * berkas entri staff. Perbandingan kini memakai bentuk kanonik ini.
 */
function normalizePathname(rawPathname: string): string {
  const decoded = decodePathname(rawPathname).replace(/\\/g, '/');
  const stack: string[] = [];
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return `/${stack.join('/')}`;
}

/**
 * Finding N11: portal login staff berada di entri build terpisah (`staff.html`) supaya jalur/kodenya
 * tidak ikut dalam bundel publik. Jalur rahasianya dibaca di sisi server dari `STAFF_LOGIN_PATH`
 * (bukan `VITE_*`), lalu permintaan ke jalur itu di-rewrite ke `/staff.html`. Permintaan langsung ke
 * `/staff.html` diblokir agar berkas entri tidak bisa ditemukan dengan menebak nama berkas.
 */
function staffEntryPlugin(staffLoginPath: string): Plugin {
  const attach = (middlewares: MiddlewareServer) => {
    middlewares.use((req, res, next) => {
      const url = req.url || '/';
      const pathname = normalizePathname(url.split('?')[0]);
      const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';

      if (pathname === staffLoginPath) {
        req.url = `/staff.html${query}`;
        return next();
      }

      // Sembunyikan berkas entri mentah; hanya bisa dimuat lewat jalur rahasia di atas.
      if (pathname === '/staff.html' && staffLoginPath !== '/staff.html') {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }

      next();
    });
  };

  return {
    name: 'sajiin-staff-entry',
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

function normalizeStaffPath(raw: string | undefined): string {
  const value = (raw || '/staff/login').trim();
  if (!value.startsWith('/')) {
    throw new Error(`STAFF_LOGIN_PATH harus diawali "/" (diterima: "${value}")`);
  }
  const normalized = normalizePathname(value);
  return normalized === '/' ? '/staff/login' : normalized;
}

export default defineConfig(({ mode }) => {
  // Prefix '' = muat semua variabel (termasuk yang tanpa awalan VITE_) dari .env* agar
  // STAFF_LOGIN_PATH bisa dibaca dari .env.local tanpa ikut ter-inject ke bundel klien.
  const env = loadEnv(mode, process.cwd(), '');
  const staffLoginPath = normalizeStaffPath(env.STAFF_LOGIN_PATH || process.env.STAFF_LOGIN_PATH);

  return {
    plugins: [react(), staffEntryPlugin(staffLoginPath)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        // Dua entri: aplikasi publik (index.html) dan portal staff terpisah (staff.html).
        input: {
          main: path.resolve(__dirname, 'index.html'),
          staff: path.resolve(__dirname, 'staff.html'),
        },
      },
    },
    server: {
      port: 5173,
      // Default aman: hanya loopback. Jangan bind ke 0.0.0.0 kecuali untuk pengujian LAN terpercaya,
      // karena dev server menyajikan kode sumber mentah + `import.meta.env` (Finding N11).
      host: process.env.VITE_HOST || '127.0.0.1',
      https,
      // Finding N11: tolak penyajian berkas sensitif lewat dev server (defense-in-depth; default Vite
      // sudah menolak sebagian). Dev server tidak boleh dipakai di produksi.
      fs: {
        strict: true,
        deny: ['**/.env', '**/.env.*', '**/*.pem', '**/*.key', '**/*.crt', '**/*.p12', '**/.git/**'],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          xfwd: true,
        },
      },
    },
  };
});
