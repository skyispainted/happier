import http from 'node:http';
import crypto from 'node:crypto';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3333;
const SIGNING_SECRET = process.env.SIGNING_SECRET || '';

// WPS协作配置
const WPS_APP_ID = process.env.WPS_APP_ID || '';
const WPS_SECRET_KEY = process.env.WPS_SECRET_KEY || '';
const WPS_ENCRYPT_KEY = process.env.WPS_ENCRYPT_KEY || '';
const WPS_COMPANY_ID = process.env.WPS_COMPANY_ID || '';
const WPS_API_URL = process.env.WPS_API_URL || 'https://openapi.wps.cn';

let WPSClient = null;
let wpsClient = null;

// 懒加载ESM模块
async function loadWpsModule() {
  if (WPSClient) return WPSClient;
  const mod = await import('@skyispainted/wps-xiezuo-sdk');
  WPSClient = mod.WPSClient;
  return WPSClient;
}

// 初始化WPS客户端
async function initWpsClient() {
  if (wpsClient) return wpsClient;
  if (!WPS_APP_ID || !WPS_SECRET_KEY) {
    console.log('[wps] 未配置 WPS_APP_ID / WPS_SECRET_KEY，跳过WPS推送');
    return null;
  }
  try {
    const Client = await loadWpsModule();
    wpsClient = new Client(WPS_APP_ID, WPS_SECRET_KEY, WPS_API_URL);
    console.log('[wps] WPS客户端初始化成功');
    if (WPS_COMPANY_ID) console.log(`[wps] Company ID: ${WPS_COMPANY_ID}`);
    if (WPS_ENCRYPT_KEY) console.log('[wps] Encrypt Key: 已配置');
    return wpsClient;
  } catch (err) {
    console.error('[wps] 初始化失败:', err.message);
    return null;
  }
}

// 根据邮箱查询用户真实名称
async function lookupWpsUser(email) {
  const client = await initWpsClient();
  if (!client) return null;
  try {
    const resp = await client.getUsersByEmails({
      emails: [email],
      status: ['active'],
    });
    if (resp.items && resp.items.length > 0) return resp.items[0];
  } catch (err) {
    console.error(`[wps] 查询用户失败 ${email}:`, err.message);
  }
  return null;
}

// 构建Markdown消息
function buildMarkdownMessage(payload, wpsUser) {
  const { topic, content, session, metadata, request } = payload;
  const sessionId = session?.sessionId || '';

  const topicConfig = {
    ready: { emoji: '🟢', label: '准备就绪' },
    permission_request: { emoji: '🔒', label: '权限请求' },
    user_action_request: { emoji: '⚡', label: '操作请求' },
  };
  const { emoji, label } = topicConfig[topic] || { emoji: '📋', label: topic };
  const serverUrl = 'https://happier.dev.fs.seayoogames.cn';

  // 优先使用服务端构建的标题（已包含 emoji + hash + 标题）
  const title = content?.title || `${session?.title || '无标题'} — ${label}`;
  let md = `**${title}**\n\n`;

  // Ready 事件：使用服务端构建的内容
  if (topic === 'ready') {
    if (content?.body) {
      md += `${content.body}\n`;
    }
  }
  // 权限/操作事件：使用服务端构建的内容 + 工具详情
  else if (request) {
    if (content?.body) {
      md += `${content.body}\n`;
    }
    if (request.toolDetails) {
      md += `\n${request.toolDetails}\n`;
    }
  }
  // 兜底
  else {
    if (content?.body) {
      md += `${content.body}\n`;
    }
  }

  md += `\n> ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n`;
  md += `[查看详情](${serverUrl}/session/${sessionId})`;

  return md;
}

// 推送到WPS
async function pushToWps(payload) {
  const client = await initWpsClient();
  if (!client) return;

  const email = payload.metadata?.username;
  if (!email) {
    console.log('[wps] 缺少username，跳过WPS推送');
    return;
  }

  const user = await lookupWpsUser(email);
  if (!user) {
    console.log(`[wps] 未找到用户 ${email}，跳过WPS推送`);
    return;
  }

  const md = buildMarkdownMessage(payload, user);
  console.log(`[wps] 推送给 ${user.user_name} (${user.email})`);

  try {
    const resp = await client.sendTextMessage(md, user.id, 'p2p', [], 'markdown');
    if (resp.result === 0) {
      console.log(`[wps] 推送成功, message_id: ${resp.message_id}`);
    } else {
      console.error(`[wps] 推送失败:`, JSON.stringify(resp));
    }
  } catch (err) {
    console.error('[wps] 推送异常:', err.message);
  }
}

// 验证签名
function verifySignature(body, signature, secret) {
  if (!signature || !secret) return false;
  const match = signature.match(/^sha256=([a-fA-F0-9]+)$/);
  if (!match) return false;
  return crypto.createHmac('sha256', secret).update(body).digest('hex') === match[1];
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    const body = Buffer.concat(chunks).toString();
    const sig = req.headers['x-happier-signature-256'] || '';
    const valid = SIGNING_SECRET ? verifySignature(body, sig, SIGNING_SECRET) : null;

    let payload;
    try { payload = JSON.parse(body); } catch { payload = {}; }

    const meta = payload.metadata || {};
    const displayName = meta.displayName || meta.username || '未知';
    const accountId = meta.accountId || 'unknown';
    const sessionId = payload.session?.sessionId || payload.navigation?.sessionId || 'unknown';
    const topic = payload.topic || 'unknown';

    const separator = '='.repeat(60);
    console.log(`\n[${new Date().toISOString()}] ${separator}`);
    console.log(`  WEBHOOK RECEIVED`);
    console.log(`  User: ${displayName}`);
    console.log(`  Account ID: ${accountId}`);
    console.log(`  Session: ${sessionId}`);
    console.log(`  Topic: ${topic}`);
    console.log(`  Signature: ${SIGNING_SECRET ? (valid ? 'VALID' : 'INVALID') : 'not checked'}`);

    // 推送到WPS
    try { await pushToWps(payload); }
    catch (err) { console.error('[wps] pushToWps error:', err.message); }

    console.log(`  ${separator}`);
    console.log(`  Payload:`);
    console.log(`  ${separator}`);
    console.log(JSON.stringify(payload, null, 2).split('\n').map(l => '  ' + l).join('\n'));
    console.log(`  ${separator}\n`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true, displayName, timestamp: new Date().toISOString() }));
  });

  req.on('error', (err) => console.log(`Request error: ${err.message}`));
  res.on('error', (err) => console.log(`Response error: ${err.message}`));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook server listening on http://0.0.0.0:${PORT}`);
  console.log(`Signature verification: ${SIGNING_SECRET ? 'ENABLED' : 'DISABLED'}`);
  if (WPS_APP_ID) {
    console.log(`WPS推送: 已配置 (${WPS_API_URL})`);
    if (WPS_COMPANY_ID) console.log(`WPS Company ID: ${WPS_COMPANY_ID}`);
    if (WPS_ENCRYPT_KEY) console.log('WPS Encrypt Key: 已配置');
  } else {
    console.log('WPS推送: 未配置 (设置 WPS_APP_ID / WPS_SECRET_KEY 启用)');
  }
  console.log('Waiting for webhooks...\n');
});
