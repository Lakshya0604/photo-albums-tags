# Photo Albums with Tags

A full-stack photo album app. Upload many photos at once, the server makes thumbnails, organise photos into albums, tag them, search by tags, sort by the date taken (EXIF), and share an album with a public read-only link that you can turn off.

Stack: Node.js 20+, Express 5, SQLite (better-sqlite3), sharp (thumbnails), exifr (EXIF dates), archiver (ZIP), plain JavaScript modules on the frontend (no build step).

## Run it

```bash
npm install
cp .env.example .env      # all settings have defaults, the file is optional
npm run seed              # demo user, 12 generated photos, 2 albums
npm start                 # http://localhost:3000
npm test                  # 11 backend tests
```

Demo login (created by `npm run seed`): `demo@example.com` / `demo12345`.
The seed also creates a public album link: `http://localhost:3000/s/demo-shared-album-token-0001`.
Delete the `data/` folder and seed again to reset.

Settings are listed in `.env.example` (port, data folder, upload limits, secure cookie flag). No secrets are needed.

## Features

- Upload multiple photos at once (JPEG, PNG, WebP). The server checks the real file type, reads the EXIF date and makes a 320px thumbnail for each photo.
- Albums: create, rename, delete, add and remove photos, choose a cover (first photo is used if none is chosen).
- Tags on photos (lowercased, validated), search by one or more tags with "match all" or "match any".
- Sort by date taken. The date comes from EXIF `DateTimeOriginal` (or `CreateDate`) and falls back to the upload time. The UI shows which one was used.
- Public read-only share link per album, can be turned off. Turning it on again makes a new link.
- Stretch: full-screen viewer with keyboard navigation (left/right arrows, Escape) and download an album as a ZIP.
- Works on phones and laptops (responsive grid, large tap targets).

## How the two key requirements work

**Thumbnails are generated on the server.** `src/photoStore.js` saves the original and a 320px JPEG thumbnail (`src/images.js`, sharp) during upload. The gallery, album pages and the shared page only request `/thumb` URLs. Full-size images are requested only in the full-screen viewer.

**Turning off sharing blocks access immediately, checked on the server.** A shared album has a random token (`albums.share_token`, 18 random bytes). Every public request (`src/routes/public.js`) looks the token up in the database. Turning sharing off sets the token to `NULL`, so the next request returns 404 for the album page, thumbnails and full-size files. The server keeps no cache of the token and public responses send `Cache-Control: no-store`, so browsers should not reuse them. This stops all new access; it cannot take back a photo someone already downloaded or saved. A photo is only served through a link if it is in that album. The tests cover this.

## Data model

SQLite, created in `src/db.js`.

| Table | Purpose |
| --- | --- |
| `users` | email, bcrypt password hash |
| `sessions` | random session token per login (httpOnly cookie) |
| `photos` | owner, stored file names, mime, size, width, height, `taken_at` (EXIF, nullable), `uploaded_at`, `sort_date` (= taken_at or uploaded_at) |
| `photo_tags` | (photo, tag) pairs, indexed by tag |
| `albums` | owner, name, `cover_photo_id`, `share_token` (null = not shared) |
| `album_photos` | many-to-many between albums and photos |

`sort_date` is stored so the sort is a plain indexed `ORDER BY`.

## Design decisions

- Own backend with SQLite files on disk: no external services, so it runs after `npm install`.
- Sessions in the database with an httpOnly, SameSite=Lax cookie. Passwords hashed with bcrypt.
- Every route validates input on the server (`src/validate.js`): email, password length, names (max 80), tags (max 20, 30 chars, allowed characters), ids, upload count and size. Errors are JSON `{ "error": "..." }` and the UI shows them.
- File type is detected from the bytes with sharp, not from the client mime type or file name. Stored files get random names.
- The frontend builds the DOM with `textContent`, never `innerHTML`, so photo names and tags cannot inject HTML.
- Every photo and album query is scoped to the logged-in user.

## Tests

`npm test` runs 11 tests (`test/`) against the real app with a temporary database and real image files generated with sharp:
thumbnail generation, multi-upload and invalid file rejection, EXIF sorting with fallback, tag search (all/any) and tag validation, per-user isolation, album management and cover rules, share link on/off (including thumbnails and full files), public link isolation, ZIP download, signup/login/logout and error responses.

## What is finished, what is not

Finished: every core feature and both stretch features above.

Not done, and what I would do with more time:
- Uploads go through memory (`multer.memoryStorage`, 10 MB limit per file). Streaming to disk would handle bigger files.
- Rate limiting on login and CSRF tokens (SameSite=Lax cookies are the only protection now).
- Password reset and email verification.
- Thumbnails of different sizes (for retina screens) and pagination or infinite scroll for very large libraries.
- Browser end-to-end tests. The UI was checked by hand and with a headless browser run, not with committed tests.
- Storing files in object storage instead of the local disk.

## AI tools used

AI coding assistance was used for scaffolding the project, writing the first version of the backend, frontend and tests, writing this README, and debugging library API differences (archiver 8, Express 5, sharp EXIF writing). The code is explained in the video walkthrough. The demo photos are generated placeholder images, not real photos.

## Project layout

```
src/app.js          app wiring, error handler
src/auth.js         register/login/logout, session middleware
src/routes/         photos.js, albums.js, public.js
src/photoStore.js   saving photos, thumbnails, tag search query
src/images.js       sharp and EXIF helpers
src/validate.js     input validation
scripts/seed.js     demo data
public/             frontend (index.html, shared.html, js/*.js, style.css)
test/               backend tests
```
