require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });

// Either MONGODB_URI, or the parts (host, user, password) so a hosting dashboard can hold the
// password on its own. The password is URL-encoded here.
function mongoUriFromEnv() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const { MONGODB_HOST: host, MONGODB_USER: user, MONGODB_PASSWORD: pass } = process.env;
  if (!host || !user || !pass) return '';
  return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/?retryWrites=true&w=majority`;
}

function loadConfig(overrides = {}) {
  return {
    port: Number(process.env.PORT) || 3000,
    mongoUri: mongoUriFromEnv(),
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
