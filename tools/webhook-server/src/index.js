const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3333;
const SIGNING_SECRET = process.env.SIGNING_SECRET || '';

// Simple user-based routing: map usernames to different webhook targets
const USER_ROUTES = {
  // Example: 'username1': 'http://other-server:port/webhook',
};

function verifySignature(payload, signature, secret) {
  if (!signature || !secret) return false;
  const match = signature.match(/^sha256=([a-fA-F0-9]+)$/);
  if (!match) return false;
  const expected = match[1];
  const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return computed === expected;
}

function extractUserInfo(body) {
  try {
    const data = JSON.parse(body);
    // Try account.username first (preferred)
    const username = data.account?.username || data.metadata?.username || 'anonymous';
    const accountId = data.account?.accountId || data.metadata?.accountId || 'unknown';
    const topic = data.topic || 'unknown';
    const sessionId = data.session?.sessionId || 'unknown';
    return { username, accountId, topic, sessionId };
  } catch {
    return { username: 'unknown', accountId: 'unknown', topic: 'unknown', sessionId: 'unknown' };
  }
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    const sig = req.headers['x-happier-signature-256'] || '';
    const valid = SIGNING_SECRET ? verifySignature(body, sig, SIGNING_SECRET) : null;
    const user = extractUserInfo(body);

    const timestamp = new Date().toISOString();
    const separator = '='.repeat(60);

    console.log(`\n[${timestamp}] ${separator}`);
    console.log(`  WEBHOOK RECEIVED`);
    console.log(`  User: ${user.username}`);
    console.log(`  Account ID: ${user.accountId}`);
    console.log(`  Session: ${user.sessionId}`);
    console.log(`  Topic: ${user.topic}`);
    console.log(`  Signature: ${SIGNING_SECRET ? (valid ? 'VALID' : 'INVALID') : 'not checked'}`);
    console.log(`  ${separator}`);
    console.log(`  Payload:`);
    console.log(`  ${separator}`);
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2).split('\n').map(l => '  ' + l).join('\n'));
    } catch {
      console.log('  ' + body.split('\n').map(l => '  ' + l).join('\n'));
    }
    console.log(`  ${separator}\n`);

    // Check for user-specific route
    const route = USER_ROUTES[user.username];
    if (route) {
      console.log(`  [routing] ${user.username} -> ${route}`);
      // Forward to user-specific endpoint (optional)
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true, username: user.username, timestamp }));
  });

  req.on('error', (err) => console.log(`Request error: ${err.message}`));
  res.on('error', (err) => console.log(`Response error: ${err.message}`));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook server listening on http://0.0.0.0:${PORT}`);
  console.log(`Signature verification: ${SIGNING_SECRET ? 'ENABLED' : 'DISABLED'}`);
  console.log('Waiting for webhooks...\n');
});
