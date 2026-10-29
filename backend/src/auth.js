const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const { HttpError, validateCredentials } = require('./validate');

const COOKIE = 'sid';
const SESSION_MS = 7 * 24 * 3600 * 1000;

function authRouter(db, config) {
  const router = express.Router();
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: SESSION_MS };

  async function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.sessions.insertOne({ _id: token, userId, createdAt: new Date() });
    res.cookie(COOKIE, token, cookieOpts);
  }

  router.post('/register', async (req, res) => {
    const { email, password } = validateCredentials(req.body, { strictPassword: true });
    const hash = await bcrypt.hash(password, 10);
    let id;
    try {
      id = (await db.users.insertOne({ email, passwordHash: hash, createdAt: new Date() })).insertedId;
    } catch (err) {
      if (err.code === 11000) throw new HttpError(409, 'An account with this email already exists.');
      throw err;
    }
    await startSession(res, id);
    res.status(201).json({ id: id.toHexString(), email });
  });

  router.post('/login', async (req, res) => {
    const { email, password } = validateCredentials(req.body, { strictPassword: false });
    const user = await db.users.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, 'Wrong email or password.');
    }
    await startSession(res, user._id);
    res.json({ id: user._id.toHexString(), email: user.email });
  });

  router.post('/logout', async (req, res) => {
    const token = req.cookies?.[COOKIE];
    if (typeof token === 'string') await db.sessions.deleteOne({ _id: token });
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  return router;
}

function requireUser(db) {
  return async (req, res, next) => {
    const token = req.cookies?.[COOKIE];
    const session = typeof token === 'string' && token
      ? await db.sessions.findOne({ _id: token, createdAt: { $gt: new Date(Date.now() - SESSION_MS) } })
      : null;
    const user = session ? await db.users.findOne({ _id: session.userId }) : null;
    if (!user) throw new HttpError(401, 'Please log in.');
    req.user = { id: user._id, email: user.email };
    next();
  };
}

module.exports = { authRouter, requireUser };
