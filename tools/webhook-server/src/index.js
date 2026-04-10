const express = require('express');
const crypto = require('crypto');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3333;
const SIGNING_SECRET = process.env.SIGNING_SECRET || '';

function verifySignature(payload, signature, secret) {
  if (!signature || !secret) return false;
  const match = signature.match(/^sha256=([a-fA-F0-9]+)$/);
  if (!match) return false;
  const expected = match[1];
  const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return computed === expected;
}

const app = express();
app.use('/webhook', express.raw({ type: 'application/json', limit: '10mb' }));

app.post('/webhook', (req, res) => {
  const raw = req.body.toString('utf-8');
  const sig = req.headers['x-happier-signature-256'] || '';
  const valid = SIGNING_SECRET ? verifySignature(raw, sig, SIGNING_SECRET) : null;

  console.log('\n' + '='.repeat(60));
  console.log(`[${new Date().toISOString()}] WEBHOOK RECEIVED`);
  console.log('='.repeat(60));
  console.log(`Signature: ${sig || 'none'}`);
  if (SIGNING_SECRET) console.log(`Signature Valid: ${valid ? 'YES' : 'NO'}`);
  console.log('-'.repeat(60));
  try { console.log(JSON.stringify(JSON.parse(raw), null, 2)); }
  catch { console.log(raw); }
  console.log('='.repeat(60) + '\n');

  res.json({ received: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook server listening on http://0.0.0.0:${PORT}`);
  if (SIGNING_SECRET) console.log('Signature verification: ENABLED');
  else console.log('Signature verification: DISABLED');
  console.log('Waiting for webhooks...\n');
});
