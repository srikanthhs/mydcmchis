 const withCors = require('../lib/cors');
module.exports = withCors(async (req, res) => {
  res.status(200).json({ status: 'sheet route working' });
});
