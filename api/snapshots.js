const db = require('../lib/firebase-admin');
const withCors = require('../lib/cors');

module.exports = withCors(async (req, res) => {
  if (req.method === 'GET') {
    const doc = await db.collection('snapshots').doc('latest').get();
    return res.status(200).json(doc.exists ? doc.data() : null);
  }
  if (req.method === 'POST') {
    const payload = { ...req.body, savedAt: new Date().toISOString() };
    await db.collection('snapshots').doc('latest').set(payload);
    return res.status(200).json({ ok: true });
  }
  res.status(405).end();
});