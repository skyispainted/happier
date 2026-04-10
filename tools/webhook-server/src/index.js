const http = require('http');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3333;
const SIGNING_SECRET = process.env.SIGNING_SECRET || '';

const server = http.createServer((req, res) => {
  console.log(`\n[${new Date().toISOString()}] === INCOMING ===`);
  console.log(`Method: ${req.method}`);
  console.log(`URL: ${req.url}`);
  console.log(`Headers: ${JSON.stringify(req.headers)}`);

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    console.log(`Body length: ${body.length} bytes`);
    console.log(`Body: ${body.substring(0, 300)}`);

    const sig = req.headers['x-happier-signature-256'] || '';
    if (SIGNING_SECRET && sig) {
      const crypto = require('crypto');
      const expected = crypto.createHmac('sha256', SIGNING_SECRET).update(body).digest('hex');
      const match = sig === `sha256=${expected}`;
      console.log(`Signature valid: ${match}`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    const resp = JSON.stringify({ received: true, timestamp: new Date().toISOString() });
    console.log(`Sending response: ${resp}`);
    res.end(resp);
    console.log(`=== END ===\n`);
  });

  req.on('error', (err) => {
    console.log(`Request error: ${err.message}`);
  });

  res.on('error', (err) => {
    console.log(`Response error: ${err.message}`);
  });
});

server.on('error', (err) => {
  console.log(`Server error: ${err.message}`);
});

server.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] TCP connection from ${socket.remoteAddress}:${socket.remotePort}`);
  socket.on('close', () => {
    console.log(`[${new Date().toISOString()}] TCP connection closed`);
  });
  socket.on('error', (err) => {
    console.log(`[${new Date().toISOString()}] Socket error: ${err.message}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook server listening on http://0.0.0.0:${PORT}`);
  console.log('Waiting for requests...\n');
});
