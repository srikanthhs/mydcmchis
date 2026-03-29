// api/imports.js
// Placeholder — full logic comes in Phase 3
const withCors = require('../lib/cors');

module.exports = withCors(async (req, res) => {
  res.status(200).json({ status: 'imports route working' });
});
