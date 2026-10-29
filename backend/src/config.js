require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const path = require('path');

function loadConfig(overrides = {}) {
  return {
    port: Number(process.env.PORT) || 3000,
    dataDir: path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data')),
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 10,
    maxFiles: Number(process.env.MAX_FILES_PER_UPLOAD) || 10,
    authRateLimit: process.env.AUTH_RATE_LIMIT === undefined ? 30 : Number(process.env.AUTH_RATE_LIMIT),
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    ...overrides,
  };
}
module.exports = { loadConfig };
