# Photo Albums with Tags

A full-stack photo album app. Upload many photos at once, the server makes thumbnails, organise photos into albums, tag them, search by tags, sort by the date taken (EXIF), and share an album with a public read-only link that you can turn off.

Stack: Node.js 20+, Express 5, MongoDB (images in GridFS), sharp (thumbnails), exifr (EXIF dates), archiver (ZIP), plain JavaScript modules on the frontend (no build step).

## Live demo

https://photo-albums-tags.onrender.com

- Demo login: `demo@example.com` / `demo12345`
- Public share link of the demo album: https://photo-albums-tags.onrender.com/s/demo-shared-album-token-0001
- Hosted on free tiers (Render free web service, MongoDB Atlas free 512 MB). The server sleeps when idle, so the first request after a pause can take about a minute. Uploads are capped at 350 MB in total to stay inside the free database.
- Anyone can register, so please keep uploads small and do not store private photos on the demo.

## Run it

Needs Node.js 20 or newer and a MongoDB database (a free MongoDB Atlas cluster works, or a local `mongod`).

```bash
npm run install:all       # installs the backend (the frontend has no build step)
cp .env.example .env      # then set MONGODB_URI (see below)
npm run seed              # demo user, 12 generated photos, 2 albums
npm start                 # http://localhost:3000
npm test                  # backend tests
```

Demo login (created by `npm run seed`): `demo@example.com` / `demo12345`.
The seed also creates a public album link: `http://localhost:3000/s/demo-shared-album-token-0001`.
Drop the database and seed again to reset.

Settings are listed in `.env.example`. The only secret is `MONGODB_URI` (it contains the database password). It lives in `.env`, which git ignores. The automated tests need no database: they start an in-memory MongoDB.

## Features

- Upload multiple photos at once (JPEG, PNG, WebP). The server checks the real file type, reads the EXIF date and makes a 320px thumbnail for each photo.
- Albums: create, rename, delete, add and remove photos, choose a cover (first photo is used if none is chosen).
- Tags on photos (lowercased, validated), search by one or more tags with "match all" or "match any".
- Sort by date taken. The date comes from EXIF `DateTimeOriginal` (or `CreateDate`) and falls back to the upload time. The UI shows which one was used.
- Public read-only share link per album, can be turned off. Turning it on again makes a new link.
- Stretch: full-screen viewer with keyboard navigation (left/right arrows, Escape) and download an album as a ZIP.
- Works on phones and laptops (responsive grid, large tap targets).

## How the two key requirements work

**Thumbnails are generated on the server.** `backend/src/photoStore.js` saves the original and a 320px JPEG thumbnail (`backend/src/images.js`, sharp) during upload. The gallery, album pages and the shared page only request `/thumb` URLs. Full-size images are requested only in the full-screen viewer.

**Turning off sharing blocks access immediately, checked on the server.** A shared album has a random token (`albums.shareToken`, 18 random bytes). Every public request (`backend/src/routes/public.js`) looks the token up in the database. Turning sharing off removes the token, so the next request returns 404 for the album page, thumbnails and full-size files. Image bytes are streamed through the server, never from a public storage URL, so there is nothing that bypasses the check. The server keeps no cache of the token and public responses send `Cache-Control: no-store`, so browsers should not reuse them. This stops all new access; it cannot take back a photo someone already downloaded or saved. A photo is only served through a link if it is in that album. The tests cover this.

## Data model

MongoDB, indexes created in `backend/src/db.js`. Image bytes are in GridFS (buckets `originals` and `thumbs`).

| Collection | Purpose |
| --- | --- |
| `users` | email (unique), bcrypt password hash |
| `sessions` | random session token per login (httpOnly cookie), expires after 7 days (TTL index) |
| `photos` | owner, original name, mime, size, width, height, `takenAt` (EXIF, nullable), `uploadedAt`, `sortDate` (= takenAt or uploadedAt), `tags[]` (multikey index), GridFS ids of original and thumbnail |
| `albums` | owner, name, `coverPhotoId`, `shareToken` (unique, absent = not shared), `photoIds[]` |

`sortDate` is stored so the sort is a plain indexed sort. Tags live on the photo, so "match all" is `$all` and "match any" is `$in`.

## Design decisions

- Separate `backend/` (REST API, database, file handling, tests) and `frontend/` (static HTML, CSS and ES modules that call the API). The backend also serves the frontend files, so one command runs everything.
- Own backend with MongoDB for data and GridFS for image bytes. Free hosts such as Render have a temporary disk, so files on disk would vanish on restart. Keeping everything in the database makes the deployed demo durable. A total storage cap (`MAX_TOTAL_STORAGE_MB`, default 350) keeps the app under the 512 MB free Atlas limit.
- Sessions in the database with an httpOnly, SameSite=Lax cookie that expires after 7 days. Passwords hashed with bcrypt.
- Every route validates input on the server (`backend/src/validate.js`): email, password length, names (max 80), tags (max 20, 30 chars, allowed characters), ids, upload count and size. Errors are JSON `{ "error": "..." }` and the UI shows them. Unexpected errors return a generic 500 and are logged on the server only.
- File type is detected from the bytes with sharp, not from the client mime type or file name. Stored files get random names. Images over 50 megapixels are rejected. Files are removed again if saving to the database fails.
- Security checks that fit this scope: non-GET requests with a foreign `Origin` header are rejected (on top of SameSite cookies), login and register are rate limited per IP (in memory), uploads are limited by file size, file count and number of form parts, and every photo and album query is scoped to the logged-in user.
- The frontend builds the DOM with `textContent`, never `innerHTML`, so photo names and tags cannot inject HTML.
- Settings come from environment variables (`.env`, ignored by git). `.env.example` lists them all. No secret is needed to run the app.

## Tests

`npm test` runs 14 tests (`backend/test/`) against the real app with an in-memory MongoDB and real image files generated with sharp:
thumbnail generation, multi-upload and invalid file rejection, EXIF sorting with fallback, tag search (all/any) and tag validation, per-user isolation, deleting a photo (albums, covers and stored files), the storage cap, album management and cover rules, share link on/off (including thumbnails and full files), public link isolation, ZIP download, signup/login/logout, cross-site request blocking, login rate limiting and error responses.

## What is finished, what is not

Finished: every core feature and both stretch features above.

Known limits and what I would do with more time:
- Uploads are buffered in memory (max 10 files of 10 MB per request). Streaming to disk would handle bigger files.
- The rate limiter is in memory and per process. A shared store (Redis) would be needed with several servers.
- Sessions use SameSite cookies plus an Origin check, but no CSRF tokens.
- No password reset, email verification or per-user storage quota.
- Image bytes are in MongoDB (GridFS). That suits a small demo; object storage with signed, server-checked access would be the next step for scale.
- The free Atlas cluster is open to all IPs (a free web host has no fixed IP). Access is limited by a database user that can only touch this app's database, and a long random password.
- Thumbnails come in one size. Several sizes and pagination would help large libraries.
- Tests: 14 automated backend tests. The UI was checked by hand in a headless browser (login, mobile layout, tag search, viewer keys, share page) but there is no automated browser test suite yet.

## AI tools used

I used AI tools to help with implementation, testing, documentation and debugging, including library API differences (archiver 8, Express 5, sharp EXIF writing). The code is explained in the video walkthrough. The demo photos are generated placeholder images, not real photos.

## Project layout

```
backend/
  src/app.js          app wiring, middleware order, error handler
  src/config.js       environment settings
  src/db.js           MongoDB connection, indexes, GridFS buckets
  src/auth.js         register/login/logout, session middleware
  src/security.js     same-origin check, rate limiter
  src/routes/         photos.js, albums.js, public.js
  src/photoStore.js   saving photos, thumbnails, tag search query
  src/images.js       sharp and EXIF helpers
  src/validate.js     input validation and HttpError
  scripts/seed.js     demo data
  test/               automated tests
frontend/
  index.html, shared.html, style.css
  js/                 api.js, ui.js, auth.js, photos.js, albums.js, viewer.js, shared.js, app.js
```
