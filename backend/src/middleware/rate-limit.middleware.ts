import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message: string;
}

// ponytail: native Map rate limiter for single-process server; upgrade to Redis only for multi-replica cluster
export function createRateLimiter(opts: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Bersihkan entri kedaluwarsa secara berkala
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetAt) {
        hits.delete(key);
      }
    }
  }, opts.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = hits.get(ip);

    if (!record || now > record.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + opts.windowMs });
      res.setHeader('RateLimit-Limit', opts.max);
      res.setHeader('RateLimit-Remaining', opts.max - 1);
      res.setHeader('RateLimit-Reset', Math.ceil((now + opts.windowMs) / 1000));
      return next();
    }

    record.count++;
    const remaining = Math.max(0, opts.max - record.count);
    res.setHeader('RateLimit-Limit', opts.max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', Math.ceil(record.resetAt / 1000));

    if (record.count > opts.max) {
      res.status(429).json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: opts.message,
        },
      });
      return;
    }

    next();
  };
}

// Rate limit untuk endpoint auth: 5 percobaan / menit (SECURITY.md & API.md)
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Terlalu banyak percobaan autentikasi. Silakan coba lagi dalam 1 menit.',
});

// Rate limit untuk endpoint publik (mis. katalog menu): 120 / menit
export const publicRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Terlalu banyak permintaan. Silakan coba lagi sebentar lagi.',
});

// Rate limit umum untuk API: 300 / menit
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Batas permintaan terlampaui. Silakan coba lagi nanti.',
});
