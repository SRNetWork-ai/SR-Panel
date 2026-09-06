import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  customerLookup: { max: 12, windowMs: 60_000 },
  customerLogin: { max: 10, windowMs: 60_000 },
  checkout: { max: 8, windowMs: 60_000 },
  renewal: { max: 8, windowMs: 60_000 },
  tracking: { max: 30, windowMs: 60_000 },
  'claim-service': { max: 10, windowMs: 60_000 },
  telegramSession: { max: 20, windowMs: 60_000 },
  telegramWebhook: { max: 240, windowMs: 60_000 },
};

const DEFAULT_LIMIT = { max: 30, windowMs: 60_000 };

/**
 * Simple in-memory sliding-window rate limiter for public storefront routes.
 * Keys are scoped per action so one hot endpoint cannot exhaust another.
 */
@Injectable()
export class StoreRateLimitService {
  private buckets = new Map<string, Bucket>();

  check(action: string, key: string): void {
    const limit = LIMITS[action] || DEFAULT_LIMIT;
    const now = Date.now();
    const id = `${action}:${key}`;
    const bucket = this.buckets.get(id);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(id, { count: 1, resetAt: now + limit.windowMs });
      if (this.buckets.size > 10_000) this.cleanup(now);
      return;
    }
    bucket.count += 1;
    if (bucket.count > limit.max) {
      throw new HttpException(
        'Too many requests - please slow down and try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private cleanup(now: number): void {
    for (const [id, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(id);
    }
  }
}
