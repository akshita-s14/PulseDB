require('dotenv').config();

const required = ['DATABASE_URL', 'PORT'];

required.forEach((key) => {
  if (!process.env[key]) {
    console.error(`[Config] Missing required env var: ${key}`);
    process.exit(1);  // Fail fast — don't let the app limp along
  }
});

module.exports = {
  port:        parseInt(process.env.PORT, 10) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  nodeEnv:     process.env.NODE_ENV || 'development',
  redisUrl:    process.env.REDIS_URL || null,  // Optional for Phase 4
  geminiKey:   process.env.GEMINI_API_KEY || null,
};
