import express from 'express';
import { env } from './config/env.js';
import { testConnection } from './config/database.js';

import { authRoutes } from './routes/auth.routes.js';
import { userRoutes } from './routes/user.routes.js';
import { menuRoutes, categoryRoutes } from './routes/menu.routes.js';
import { orderRoutes } from './routes/order.routes.js';
import { paymentRoutes } from './routes/payment.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { notificationRoutes } from './routes/notification.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { apiRateLimiter } from './middleware/rate-limit.middleware.js';
import { OrderService } from './services/order.service.js';

const app = express();
const orderService = new OrderService();

// Sembunyikan teknologi server (Finding L1).
app.disable('x-powered-by');

// Kepercayaan header proxy dikendalikan env (Finding N7). Default aman: produksi tidak mempercayai
// header apa pun (mencegah spoofing `X-Forwarded-For` untuk memintas rate limit/lockout); non-produksi
// memakai 'loopback' karena berada di belakang proxy Vite lokal.
function resolveTrustProxy(): boolean | number | string {
  const raw = env.TRUST_PROXY?.trim();
  if (raw) {
    const lower = raw.toLowerCase();
    if (lower === 'false' || lower === '0') return false;
    if (lower === 'true') return true;
    if (/^\d+$/.test(raw)) return Number(raw);
    return raw; // 'loopback' atau daftar IP dipisah koma
  }
  return env.NODE_ENV === 'production' ? false : 'loopback';
}

app.set('trust proxy', resolveTrustProxy());

// Allowlist origin eksplisit (CORS_ALLOWED_ORIGINS, dipisah koma) + FRONTEND_URL.
const explicitCorsOrigins = env.CORS_ALLOWED_ORIGINS
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Localhost dan rentang LAN privat hanya diizinkan bila di-opt-in secara eksplisit
// (atau di lingkungan non-produksi) agar produksi tidak terbuka lebar (Finding L3).
const allowLocalhost = env.NODE_ENV !== 'production' || env.CORS_ALLOW_LAN_ORIGINS;

function isOriginAllowed(origin: string): boolean {
  if (origin === env.FRONTEND_URL) return true;
  if (explicitCorsOrigins.includes(origin)) return true;
  if (allowLocalhost && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (
    env.CORS_ALLOW_LAN_ORIGINS &&
    /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)
  ) {
    return true;
  }
  // Terowongan pengembangan Microsoft Dev Tunnels (HTTPS, domain terkontrol).
  if (/^https:\/\/[a-z0-9-]+\.(asse\.)?devtunnels\.ms$/.test(origin)) return true;
  return false;
}

// ponytail: native security headers without helmet; upgrade to report-to endpoint if violation analytics are needed
app.use((_req, res, next) => {
  // connect-src dibatasi ketat di produksi ('self'); skema luas hanya untuk dev (Vite HMR) (Finding L4).
  const connectSrc =
    env.NODE_ENV === 'production' ? "'self'" : "'self' http: https: ws: wss:";
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    `connect-src ${connectSrc}`,
    "font-src 'self' https: data:",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    ...(env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ponytail: native CORS middleware without external package; adjust allowed headers if custom auth tokens are used
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});
// ponytail: 5mb JSON limit for base64 proof upload; switch to multipart streaming if larger files are needed
app.use(express.json({ limit: '5mb' }));
app.use('/api/v1', apiRateLimiter);

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/me/notifications', notificationRoutes); // harus sebelum /me (prefix match)
app.use('/api/v1/me', userRoutes);
app.use('/api/v1/menu', menuRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/settings', settingsRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' } });
});

// Global error handler (mengembalikan format error seragam dan pesan generik)
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    // Jika error memiliki status khusus dari service/controller
    const customErr = err as { status?: number; code?: string; message?: string };
    if (customErr && typeof customErr === 'object' && customErr.status) {
      res.status(customErr.status).json({
        error: {
          code: customErr.code || 'ERROR',
          message: customErr.message || 'Terjadi kesalahan',
        },
      });
      return;
    }

    // Detail error hanya dicetak di log internal (SECURITY.md bagian 3)
    console.error('[INTERNAL_ERROR]', err);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan internal pada server' },
    });
  }
);

async function startServer() {
  try {
    await testConnection();
    console.error(`[DB] Connected to ${env.DB_NAME}`);
  } catch (err) {
    console.error('[DB] Failed to connect:', err);
    process.exit(1);
  }

  app.listen(env.PORT, env.HOST, () => {
    console.error(`[Server] Running on ${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
  });

  // Pembersihan otomatis pesanan kedaluwarsa (> 5 menit) setiap 30 detik
  setInterval(() => {
    orderService.cancelExpiredOrders().catch((err) => {
      console.error('[AUTO_CANCEL_INTERVAL_ERROR]', err);
    });
  }, 30_000).unref();
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app };
