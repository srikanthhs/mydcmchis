// lib/cors.js
const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization';

function withCors(handler) {
  return async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return handler(req, res);
  };
}

module.exports = withCors;
