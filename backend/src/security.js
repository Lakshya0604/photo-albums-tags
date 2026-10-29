const { HttpError } = require('./validate');

// Blocks cross-site state-changing requests: if the browser sends an Origin header
// on a non-GET request, it must match this server's host. Cookies are also SameSite=Lax.
function sameOriginOnly(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { host = null; }
    if (host !== req.get('host')) throw new HttpError(403, 'Cross-site request blocked.');
  }
  next();
}

// Small in-memory limiter (per IP) for login and register. Enough to slow password guessing.
function rateLimit({ max, windowMs }) {
  const hits = new Map();
  return (req, res, next) => {
    if (max <= 0) return next();
    const now = Date.now();
    const key = req.ip;
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    next();
  };
}

module.exports = { sameOriginOnly, rateLimit };
