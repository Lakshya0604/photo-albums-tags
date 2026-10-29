const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  thumb_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  taken_at TEXT,
  uploaded_at TEXT NOT NULL,
  sort_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_user_sort ON photos(user_id, sort_date);
CREATE TABLE IF NOT EXISTS photo_tags (
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (photo_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON photo_tags(tag);
CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cover_photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL,
  share_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS album_photos (
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (album_id, photo_id)
);
`;

function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = dataDir === ':memory:' ? ':memory:' : path.join(dataDir, 'app.db');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
module.exports = { openDb };
