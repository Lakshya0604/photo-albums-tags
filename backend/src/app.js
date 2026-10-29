const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { openDb } = require('./db');
const { loadConfig } = require('./config');
const { authRouter, requireUser } = require('./auth');
const { photosRouter } = require('./routes/photos');
const { albumsRouter } = require('./routes/albums');
const { publicRouter } = require('./routes/public');
const { sameOriginOnly, rateLimit } = require('./security');

function createApp(overrides = {}) {
  const config = loadConfig(overrides);
  const db = openDb(config.dataDir);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(sameOriginOnly);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  const needUser = requireUser(db);
  app.use('/api/auth', rateLimit({ max: config.authRateLimit, windowMs: 10 * 60 * 1000 }), authRouter(db, config));
  app.get('/api/me', needUser, (req, res) => res.json({ user: req.user }));
  app.use('/api/photos', needUser, photosRouter(db, config));
  app.use('/api/albums', needUser, albumsRouter(db, config));
  app.use('/api/public', publicRouter(db, config));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));
  // Share links open the same page; the page asks the public API for the album.
  app.get('/s/:token', (req, res) => res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'shared.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return { app, db, config };
}
module.exports = { createApp };
