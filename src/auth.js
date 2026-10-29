const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const { HttpError, validateCredentials } = require('./validate');

const COOKIE = 'sid';

function authRouter(db, config) {
  const router = express.Router();
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 7 * 24 * 3600 * 1000 };

  function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
    res.cookie(COOKIE, token, cookieOpts);
  }

  router.post('/register', (req, res) => {
    const { email, password } = validateCredentials(req.body, { strictPassword: true });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'An account with this email already exists.');
    }
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
    startSession(res, info.lastInsertRowid);
    res.status(201).json({ id: info.lastInsertRowid, email });
  });

  router.post('/login', (req, res) => {
    const { email, password } = validateCredentials(req.body, { strictPassword: false });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      throw new HttpError(401, 'Wrong email or password.');
    }
    startSession(res, user.id);
    res.json({ id: user.id, email: user.email });
  });

  router.post('/logout', (req, res) => {
    const token = req.cookies?.[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  return router;
}

function requireUser(db) {
  return (req, res, next) => {
    const token = req.cookies?.[COOKIE];
    const row = token
      ? db.prepare('SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token)
      : null;
    if (!row) throw new HttpError(401, 'Please log in.');
    req.user = row;
    next();
  };
}

module.exports = { authRouter, requireUser };
