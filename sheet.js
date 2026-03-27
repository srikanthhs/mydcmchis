// Vercel serverless proxy — fetches Google Apps Script server-side
// (no CORS, no CSP restrictions apply here)
// Deploy this file to your Vercel project as: api/sheet.js
// Then call /api/sheet from the dashboard instead of the Apps Script URL directly.

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzaFDztayFtA4dJsxnWR9FpgtyDkHSuVX_IuML2tNjbqPgIj7I2yV6dFaXz7jRy-uexpA/exec';

export default async function handler(req, res) {
  // CORS — allow the Vercel frontend to call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const upstream = await fetch(APPS_SCRIPT_URL, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Vercel-Proxy/1.0' }
    });

    const text = await upstream.text();

    // Apps Script can return either raw JSON array or an HTML wrapper
    // Try to extract the JSON array in either case
    let json = text.trim();
    if (json.startsWith('<')) {
      // HTML wrapper — extract the JSON array from postMessage call or raw content
      const m = json.match(/postMessage\((\[[\s\S]*?\])\s*,/);
      if (m) json = m[1];
      else {
        // Try pulling any JSON array from the body
        const m2 = json.match(/(\[[\s\S]*\])/);
        if (m2) json = m2[1];
      }
    }

    // Validate it's parseable
    JSON.parse(json); // throws if bad — caught below

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(json);

  } catch (err) {
    res.status(502).json({ error: 'Proxy fetch failed', detail: String(err) });
  }
}
