const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 10000;
const ORIGIN_HOST = process.env.ORIGIN_HOST || 'gastos.faseba.com';
const SECRET = process.env.SECRET || '';
const COOKIE_NAME = 'fb_gate';

function hasValidCookie(cookieHeader) {
  if (!cookieHeader) return false;
  return cookieHeader.split(';').some(c => c.trim() === `${COOKIE_NAME}=${SECRET}`);
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const queryToken = reqUrl.searchParams.get('key');
  const hasQueryToken = Boolean(SECRET) && queryToken === SECRET;
  const hasCookie = hasValidCookie(req.headers.cookie);

  if (!hasCookie && !hasQueryToken) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  if (hasQueryToken) {
    reqUrl.searchParams.delete('key');
  }

  const path = reqUrl.pathname + (reqUrl.search || '');

  const forwardHeaders = { ...req.headers };
  forwardHeaders['host'] = ORIGIN_HOST;

  const proxyReq = https.request({
    hostname: ORIGIN_HOST,
    port: 443,
    path,
    method: req.method,
    headers: forwardHeaders
  }, proxyRes => {
    const headers = { ...proxyRes.headers };
    headers['x-robots-tag'] = 'noindex, nofollow';

    if (headers.location) {
      try {
        const locUrl = new URL(headers.location, `https://${ORIGIN_HOST}`);
        if (locUrl.hostname === ORIGIN_HOST) {
          headers.location = locUrl.pathname + locUrl.search;
        }
      } catch (e) {}
    }

    if (hasQueryToken) {
      const setCookie = `${COOKIE_NAME}=${SECRET}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`;
      if (headers['set-cookie']) {
        headers['set-cookie'] = Array.isArray(headers['set-cookie'])
          ? [...headers['set-cookie'], setCookie]
          : [headers['set-cookie'], setCookie];
      } else {
        headers['set-cookie'] = setCookie;
      }
    }

    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad gateway');
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`);
});
