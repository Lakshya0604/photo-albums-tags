require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });

function loadConfig(overrides = {}) {
  return {
    port: Number(process.env.PORT) || 3000,
    mongoUri: process.env.MONGODB_URI || '',
    mongoDb: process.env.MONGODB_DB || 'photoalbums',
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 10,
    maxFiles: Number(process.env.MAX_FILES_PER_UPLOAD) || 10,
    // Total stored image bytes across all users. Protects the 512 MB free database.
    maxTotalMb: Number(process.env.MAX_TOTAL_STORAGE_MB) || 350,
    authRateLimit: process.env.AUTH_RATE_LIMIT === undefined ? 30 : Number(process.env.AUTH_RATE_LIMIT),
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    trustProxy: process.env.TRUST_PROXY === 'true',
    ...overrides,
  };
}
module.exports = { loadConfig };
