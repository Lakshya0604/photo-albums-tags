const { ObjectId } = require('mongodb');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateCredentials(body, { strictPassword }) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Enter a valid email address.');
  if (strictPassword && (password.length < 8 || password.length > 128)) {
    throw new HttpError(400, 'Password must be 8 to 128 characters.');
  }
  if (!password) throw new HttpError(400, 'Password is required.');
  return { email, password };
}

function validateName(value, label = 'Name') {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new HttpError(400, `${label} is required.`);
  if (name.length > 80) throw new HttpError(400, `${label} must be 80 characters or fewer.`);
  return name;
}

// Tags are lowercase, 1-30 chars, letters/numbers/space/dash/underscore. Max 20 per photo.
function normalizeTags(input) {
  let list = input;
  if (typeof input === 'string') list = input.split(',');
  if (!Array.isArray(list)) throw new HttpError(400, 'Tags must be a list.');
  const out = new Set();
  for (const raw of list) {
    if (typeof raw !== 'string') throw new HttpError(400, 'Each tag must be text.');
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!tag) continue;
    if (tag.length > 30 || !/^[\p{L}\p{N} _-]+$/u.test(tag)) {
      throw new HttpError(400, `Invalid tag "${raw.slice(0, 30)}". Use letters, numbers, spaces, - or _ (max 30).`);
    }
    out.add(tag);
  }
  if (out.size > 20) throw new HttpError(400, 'A photo can have at most 20 tags.');
  return [...out];
}

// Ids are MongoDB ObjectIds sent as 24-character hex strings.
function parseId(value, label = 'id') {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) throw new HttpError(400, `Invalid ${label}.`);
  return new ObjectId(value);
}

function parseIdList(value, label = 'photoIds') {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    throw new HttpError(400, `${label} must be a list of 1 to 200 ids.`);
  }
  const seen = new Map();
  for (const v of value) { const id = parseId(v, label); seen.set(id.toHexString(), id); }
  return [...seen.values()];
}

module.exports = { HttpError, validateCredentials, validateName, normalizeTags, parseId, parseIdList };
