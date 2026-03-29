const db = require('../lib/firebase-admin');
const withCors = require('../lib/cors');

module.exports = withCors(async (req, res) => {
  if (req.method === 'GET') {
    const snap = await db.collection('imports')
      .orderBy('timestamp', 'desc').limit(50).get();
    return res.status(200).json(
      snap.docs.map(d => ({ id: d.id, ...d.data() }))
    );
  }
  if (req.method === 'POST') {
    const ref = await db.collection('imports').add({
      ...req.body,
      timestamp: new Date().toISOString(),
    });
    return res.status(200).json({ id: ref.id });
  }
  res.status(405).end();
});