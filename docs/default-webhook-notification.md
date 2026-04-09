# 默认 Webhook 通知推送接入文档

本文档说明如何配置 Happier Server 的默认 Webhook 通知推送功能。

## 概述

Happier Server 支持通过环境变量配置默认的 Webhook 通知渠道。当 CLI daemon 的 Agent 会话产生通知事件时，Server 会自动向配置的 Webhook URL 发送 HTTP POST 请求。

### 适用场景

- 自建通知服务（如转发到 Telegram、企业微信、钉钉等）
- 日志收集和监控
- 自动化流程触发
- 多端通知同步

## 快速开始

### 1. 配置环境变量

在运行 Happier Server 的环境中设置以下环境变量：

```bash
# 必填：Webhook 接收 URL
export HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_URL="https://your-service.com/api/notifications"

# 可选：签名密钥（用于验证请求来源，推荐设置）
export HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET="your-secure-signing-secret"
```

### 2. 启动 Server

```bash
# Light 模式启动
./start-light.sh

# 或使用 systemd
sudo systemctl start happier-server
```

配置完成后，Server 会自动向指定的 URL 推送通知，无需其他操作。

## 工作原理

```
┌──────────────┐     Socket Event      ┌──────────────┐     HTTP POST     ┌──────────────┐
│  CLI daemon  │ ─────────────────────▶│   Server     │ ─────────────────▶│   Webhook    │
│              │  activity-notification│              │                   │   Service    │
└──────────────┘                       └──────────────┘                   └──────────────┘
```

1. CLI daemon 检测到 Agent 会话事件（ready、permission_request、user_action_request）
2. CLI 通过 Socket.IO 向 Server 发送 `activity-notification` 事件
3. Server 接收事件并转发到配置的 Webhook URL

## 通知类型

| Topic | 触发时机 | 说明 |
|-------|---------|------|
| `ready` | Agent 响应完成 | 会话进入等待用户输入状态 |
| `permission_request` | 权限请求 | Agent 需要用户批准工具调用（如执行 Bash 命令） |
| `user_action_request` | 用户操作请求 | 需要用户执行特定操作（如确认、选择等） |

## Webhook 请求格式

### HTTP 请求

```
POST /api/notifications HTTP/1.1
Host: your-service.com
Content-Type: application/json
X-Happier-Signature-256: sha256=...  (如果配置了签名密钥)
```

### Payload 结构

#### 基础字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `v` | number | 版本号，固定为 `1` |
| `channelId` | string | 渠道 ID，默认为 `builtin:default_webhook` |
| `createdAt` | number | 创建时间戳（毫秒） |
| `topic` | string | 通知类型 |
| `content` | object | 通知内容 |
| `session` | object | 会话信息 |
| `request` | object | 请求信息（仅权限/用户操作请求） |
| `navigation` | object | 导航信息 |

#### 1. Ready 通知示例

```json
{
  "v": 1,
  "channelId": "builtin:default_webhook",
  "createdAt": 1712345678901,
  "topic": "ready",
  "content": {
    "title": "Session Ready",
    "body": "Agent finished responding. Waiting for your input..."
  },
  "session": {
    "sessionId": "sess_abc123",
    "title": "Help me write a REST API"
  },
  "navigation": {
    "sessionId": "sess_abc123"
  }
}
```

#### 2. Permission Request 通知示例

```json
{
  "v": 1,
  "channelId": "builtin:default_webhook",
  "createdAt": 1712345678901,
  "topic": "permission_request",
  "content": {
    "title": "Permission Request",
    "body": "Claude wants to run: npm install"
  },
  "session": {
    "sessionId": "sess_abc123",
    "title": "Help me write a REST API"
  },
  "request": {
    "requestId": "req_xyz789",
    "kind": "permission",
    "toolName": "Bash",
    "toolDetails": "Run command: npm install"
  },
  "navigation": {
    "sessionId": "sess_abc123",
    "requestId": "req_xyz789"
  }
}
```

#### 3. User Action Request 通知示例

```json
{
  "v": 1,
  "channelId": "builtin:default_webhook",
  "createdAt": 1712345678901,
  "topic": "user_action_request",
  "content": {
    "title": "User Action Required",
    "body": "Please confirm the deployment"
  },
  "session": {
    "sessionId": "sess_abc123",
    "title": "Deploy to production"
  },
  "request": {
    "requestId": "req_xyz789",
    "kind": "user_action",
    "toolName": "confirm",
    "toolDetails": "Confirm deployment to production environment"
  },
  "navigation": {
    "sessionId": "sess_abc123",
    "requestId": "req_xyz789"
  }
}
```

## 签名验证

如果配置了 `HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET`，每个请求都会携带签名头。

### 签名算法

```
signature = "sha256=" + HMAC-SHA256(requestBody, secret).hex()
```

### Node.js 验证示例

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(req, secret) {
  const signature = req.headers['x-happier-signature-256'];
  if (!signature) {
    return false;
  }

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  // 使用时间安全比较防止时序攻击
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Express 中间件示例
function webhookAuthMiddleware(req, res, next) {
  const secret = process.env.HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET;

  if (!verifyWebhookSignature(req, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}
```

### Python 验证示例

```python
import hmac
import hashlib

def verify_webhook_signature(request_body: bytes, signature: str, secret: str) -> bool:
    """验证 Webhook 签名"""
    expected = 'sha256=' + hmac.new(
        secret.encode(),
        request_body,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature, expected)

# Flask 示例
@app.route('/api/notifications', methods=['POST'])
def handle_notification():
    signature = request.headers.get('X-Happier-Signature-256')
    secret = os.environ.get('HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET')

    if not verify_webhook_signature(request.data, signature, secret):
        return jsonify({'error': 'Invalid signature'}), 401

    # 处理通知
    payload = request.json
    # ...
    return jsonify({'status': 'ok'})
```

## 服务端接入示例

### Node.js + Express 完整示例

```javascript
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const WEBHOOK_SECRET = process.env.HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET;

// 解析 JSON body
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// 签名验证中间件
function verifySignature(req, res, next) {
  if (!WEBHOOK_SECRET) {
    return next(); // 未配置密钥时跳过验证
  }

  const signature = req.headers['x-happier-signature-256'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing signature' });
  }

  const expected = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest('hex');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (e) {
    return res.status(401).json({ error: 'Invalid signature format' });
  }

  next();
}

// Webhook 接收端点
app.post('/api/notifications', verifySignature, async (req, res) => {
  const payload = req.body;

  console.log(`[${new Date().toISOString()}] Received notification:`);
  console.log(`  Topic: ${payload.topic}`);
  console.log(`  Session: ${payload.session?.title || payload.session?.sessionId}`);
  console.log(`  Content: ${payload.content?.title}`);

  try {
    // 根据通知类型处理
    switch (payload.topic) {
      case 'ready':
        await handleReadyNotification(payload);
        break;
      case 'permission_request':
        await handlePermissionRequest(payload);
        break;
      case 'user_action_request':
        await handleUserActionRequest(payload);
        break;
      default:
        console.log(`Unknown topic: ${payload.topic}`);
    }

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing notification:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// 处理 Ready 通知
async function handleReadyNotification(payload) {
  // 示例：发送到 Telegram
  const message = `✅ ${payload.content.title}\n\n${payload.content.body}\n\nSession: ${payload.session?.title || 'Untitled'}`;
  await sendToTelegram(message);
}

// 处理权限请求
async function handlePermissionRequest(payload) {
  const { request, session } = payload;
  const message = `🔐 Permission Required\n\n` +
    `Tool: ${request.toolName}\n` +
    `Details: ${request.toolDetails || 'N/A'}\n\n` +
    `Session: ${session?.title || 'Untitled'}`;
  await sendToTelegram(message);
}

// 处理用户操作请求
async function handleUserActionRequest(payload) {
  const { request, session } = payload;
  const message = `👤 Action Required\n\n` +
    `${payload.content.body}\n\n` +
    `Session: ${session?.title || 'Untitled'}`;
  await sendToTelegram(message);
}

// 发送到 Telegram（示例）
async function sendToTelegram(message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.log('Telegram not configured, skipping notification');
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API error: ${response.status}`);
  }
}

app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});
```

### Docker 部署示例

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.js ./

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  webhook-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET=your-secure-secret
      - TELEGRAM_BOT_TOKEN=your-bot-token
      - TELEGRAM_CHAT_ID=your-chat-id
    restart: unless-stopped
```

## 部署配置示例

### Systemd Service（推荐）

```ini
# /etc/systemd/system/happier-webhook.service
[Unit]
Description=Happier Webhook Notification Server
After=network.target

[Service]
Type=simple
User=happier
WorkingDirectory=/opt/happier-webhook
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET=your-secure-secret
Environment=TELEGRAM_BOT_TOKEN=your-bot-token
Environment=TELEGRAM_CHAT_ID=your-chat-id

[Install]
WantedBy=multi-user.target
```

### 更新 Happier Server 配置

在 Happier Server 的启动脚本或 systemd service 中添加环境变量：

```bash
# start-light.sh 或 systemd service 配置
export HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_URL="http://127.0.0.1:3001/api/notifications"
export HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET="your-secure-secret"
```

或在 systemd service 文件中：

```ini
# happier-server.service
[Service]
# ... 其他配置 ...
Environment=HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_URL=http://127.0.0.1:3001/api/notifications
Environment=HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET=your-secure-secret
```

### Nginx 反向代理

```nginx
# /etc/nginx/sites-available/happier-webhook
server {
    listen 80;
    server_name webhook.example.com;

    location /api/notifications {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 常见问题

### Q: 没有收到通知？

检查步骤：

1. **确认 Server 环境变量已设置**
   ```bash
   # 检查 systemd service 配置
   systemctl show happier-server --property=Environment
   
   # 或检查启动脚本
   cat /home/ubuntu/happier/start-light.sh | grep HAPPIER_DEFAULT_NOTIFICATION
   ```

2. **检查 Webhook 服务是否可达**
   ```bash
   curl -X POST http://127.0.0.1:3001/api/notifications \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

3. **查看 Server 日志**
   ```bash
   journalctl -u happier-server -f | grep -i webhook
   ```

### Q: 签名验证失败？

1. 确认 Server 和 Webhook 服务使用相同的密钥
2. 确认签名算法为 `HMAC-SHA256`
3. 确认签名格式为 `sha256=hex_string`
4. 使用原始请求 body 计算签名（JSON 序列化顺序可能影响结果）

### Q: 通知延迟？

通知是异步发送的，不会阻塞 Agent。建议：

1. Webhook 服务快速响应（202 Accepted）
2. 异步处理通知内容
3. 避免在 Webhook 处理中进行耗时操作

### Q: 如何测试？

```bash
# 发送测试请求到 Webhook 服务
curl -X POST http://127.0.0.1:3001/api/notifications \
  -H "Content-Type: application/json" \
  -H "X-Happier-Signature-256: sha256=test" \
  -d '{
    "v": 1,
    "channelId": "builtin:default_webhook",
    "createdAt": 1712345678901,
    "topic": "ready",
    "content": {
      "title": "Test Notification",
      "body": "This is a test"
    },
    "session": {
      "sessionId": "test-session",
      "title": "Test Session"
    },
    "navigation": {
      "sessionId": "test-session"
    }
  }'
```

## 进阶配置

### 自定义通知过滤

如果需要过滤特定类型的通知，可以在 Webhook 服务端处理：

```javascript
// 只处理权限请求
app.post('/api/notifications', verifySignature, (req, res) => {
  const { topic } = req.body;

  // 只响应权限请求和用户操作请求
  if (topic === 'ready') {
    return res.json({ status: 'skipped' });
  }

  // 处理其他通知...
});
```

### 多渠道转发

```javascript
async function handleNotification(payload) {
  // 并行发送到多个渠道
  await Promise.all([
    sendToTelegram(payload),
    sendToSlack(payload),
    sendToWechat(payload),
    logToDatabase(payload),
  ]);
}
```

### 与现有系统集成

Happier Webhook 可以轻松集成到现有系统：

- **监控系统**：发送到 Prometheus/Grafana Alertmanager
- **工单系统**：创建 Jira/Linear issue
- **CI/CD**：触发 Jenkins/GitHub Actions
- **消息队列**：发送到 RabbitMQ/Kafka

## 相关链接

- [Happier CLI 文档](https://github.com/skyispainted/happier)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [企业微信机器人](https://developer.work.weixin.qq.com/document/path/91770)
- [钉钉机器人](https://open.dingtalk.com/document/robots/custom-robot-access)