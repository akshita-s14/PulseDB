const Redis   = require('ioredis');
const config  = require('./config');

// Only enable Redis if REDIS_URL is configured
if (!config.redisUrl) {
  console.log('[Redis] REDIS_URL not set — running in single-instance mode');
  module.exports = { publisher: null, subscriber: null };
} else {
  const publisher  = new Redis(config.redisUrl);
  const subscriber = new Redis(config.redisUrl);

  publisher.on('error',  (e) => console.error('[Redis Publisher]',  e.message));
  subscriber.on('error', (e) => console.error('[Redis Subscriber]', e.message));

  module.exports = { publisher, subscriber };
}
