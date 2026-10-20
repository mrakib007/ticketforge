import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

export interface RateLimitStore {
  // Atomically count all keys in one fixed window; return seconds until allowed.
  consume(keys: string[], limits: number[], windowMs: number): Promise<number>;
}

export interface AuthRateLimiter {
  check(
    request: FastifyRequest,
    mode: 'login' | 'register',
    email: string,
  ): Promise<number>;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createAuthRateLimiter(store: RateLimitStore): AuthRateLimiter {
  return {
    check(request, mode, email) {
      // TODO: Next.js server actions proxy auth requests, so request.ip is the
      // Next.js server's IP and this budget is shared by its visitors. Add
      // per-visitor IP limiting at a trusted public ingress before deployment.
      const ip = digest(request.ip);
      const account = digest(email.trim().toLowerCase());
      return mode === 'login'
        ? store.consume(
            [`auth:login:ip:${ip}`, `auth:login:email:${account}`],
            [300, 10],
            15 * 60_000,
          )
        : store.consume(
            [`auth:register:ip:${ip}`, `auth:register:email:${account}`],
            [60, 3],
            60 * 60_000,
          );
    },
  };
}
