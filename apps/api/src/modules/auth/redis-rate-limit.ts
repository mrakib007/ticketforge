import { createClient } from 'redis';
import type { RateLimitStore } from './rate-limit.js';

// One script ensures concurrent requests cannot bypass the counter or TTL.
// Redis TIME is not needed: PTTL measures the remaining fixed window atomically.
const consumeScript = `
local retry = 0
for i = 1, #KEYS do
  local count = redis.call('INCR', KEYS[i])
  if count == 1 then redis.call('PEXPIRE', KEYS[i], ARGV[1]) end
  if count > tonumber(ARGV[i + 1]) then
    local ttl = redis.call('PTTL', KEYS[i])
    retry = math.max(retry, math.ceil(math.max(ttl, 1) / 1000))
  end
end
return retry
`;

export function createRedisRateLimitStore(url: string) {
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries) => Math.min(retries * 200, 2000),
    },
  });
  // Required by node-redis even if connection errors are handled by the caller.
  client.on('error', () => {});
  const store: RateLimitStore = {
    async consume(keys, limits, windowMs) {
      const result = await client.eval(consumeScript, {
        keys,
        arguments: [String(windowMs), ...limits.map(String)],
      });
      if (
        typeof result !== 'number' ||
        !Number.isSafeInteger(result) ||
        result < 0
      )
        throw new Error('Invalid rate limit response');
      return result;
    },
  };
  return {
    store,
    connect: () => client.connect(),
    close: () => client.destroy(),
  };
}
