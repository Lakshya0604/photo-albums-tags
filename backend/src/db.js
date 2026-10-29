const { MongoClient, GridFSBucket } = require('mongodb');

// Collections:
//   users    { _id, email (unique), passwordHash, createdAt }
//   sessions { _id: token, userId, createdAt }  (TTL index removes expired sessions)
//   photos   { _id, userId, originalName, mime, size, width, height, takenAt, uploadedAt,
//              sortDate, tags[], originalId, thumbId }
//   albums   { _id, userId, name, coverPhotoId, shareToken (unique, sparse), photoIds[], createdAt }
// Image bytes live in GridFS: bucket "originals" and bucket "thumbs".
async function openDb(uri, dbName) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db(dbName);
  const cols = {
    users: db.collection('users'),
    sessions: db.collection('sessions'),
    photos: db.collection('photos'),
    albums: db.collection('albums'),
  };
  await cols.users.createIndex({ email: 1 }, { unique: true });
  await cols.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
  await cols.photos.createIndex({ userId: 1, sortDate: -1 });
  await cols.photos.createIndex({ userId: 1, tags: 1 });
  await cols.albums.createIndex({ userId: 1 });
  await cols.albums.createIndex({ shareToken: 1 }, { unique: true, sparse: true });
  return {
    client,
    db,
    ...cols,
    originals: new GridFSBucket(db, { bucketName: 'originals' }),
    thumbs: new GridFSBucket(db, { bucketName: 'thumbs' }),
    close: () => client.close(),
  };
}
module.exports = { openDb };
