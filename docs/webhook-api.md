# Happier Webhook 通知 API 文档

本文档描述 Happier Server 推送到 Webhook 端点的 API 规范。

## 概述

当配置了 `HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_URL` 环境变量后，Happier Server 会向该 URL 发送 HTTP POST 请求，通知外部服务 Agent 会话的活动事件。

## 配置

```bash
# 必填：Webhook 接收 URL
export HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_URL="https://your-service.com/api/happier/notifications"

# 可选：签名密钥（用于验证请求来源）
export HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET="your-secure-signing-secret"
```

## HTTP 请求

### 请求头

| Header | 值 | 说明 |
|--------|-----|------|
| `Content-Type` | `application/json` | 请求体为 JSON 格式 |
| `X-Happier-Signature-256` | `sha256=<hex>` | HMAC-SHA256 签名（如果配置了密钥） |

### 签名验证

签名计算方式：
```
signature = "sha256=" + HMAC-SHA256(requestBody, secret).hex()
```

验证示例（Node.js）：
```javascript
const crypto = require('crypto');

function verifySignature(req, secret) {
  const signature = req.headers['x-happier-signature-256'];
  if (!signature) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)  // 原始请求体
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

## 事件类型

| Topic | 触发时机 | 说明 |
|-------|---------|------|
| `ready` | Agent 响应完成 | 会话进入等待用户输入状态，用户可以继续对话 |
| `permission_request` | 权限请求 | Agent 需要用户批准工具调用（如执行 Bash 命令、写入文件） |
| `user_action_request` | 用户操作请求 | Agent 需要用户执行特定操作（如确认、选择） |

## Payload 结构

### 通用字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `v` | number | ✓ | Payload 版本号，当前为 `1` |
| `channelId` | string | ✓ | 渠道标识，固定为 `builtin:default_webhook` |
| `createdAt` | number | ✓ | 创建时间戳（毫秒，Unix epoch） |
| `topic` | string | ✓ | 事件类型：`ready` / `permission_request` / `user_action_request` |
| `content` | object | ✓ | 通知内容 |
| `content.title` | string | ✓ | 通知标题 |
| `content.body` | string | ✓ | 通知正文 |
| `session` | object | ✓ | 会话信息 |
| `session.sessionId` | string | ✓ | 会话 ID |
| `session.title` | string | - | 会话标题（用户设置） |
| `user` | object | - | 用户信息 |
| `user.userId` | string | ✓ | 用户 ID |
| `user.username` | string | - | 用户名 |
| `user.displayName` | string | - | 用户显示名称（firstName + lastName） |
| `request` | object | - | 请求信息（仅 permission_request / user_action_request） |
| `navigation` | object | ✓ | 导航信息 |

---

### 事件 1: ready

Agent 完成响应，等待用户输入。

#### Payload 示例

```json
{
  "v": 1,
  "channelId": "builtin:default_webhook",
  "createdAt": 1712345678901,
  "topic": "ready",
  "content": {
    "title": "Help me write a REST API",
    "body": "I've completed the initial implementation. Please review the changes and let me know if you need any modifications."
  },
  "session": {
    "sessionId": "sess_abc123def456",
    "title": "Help me write a REST API"
  },
  "user": {
    "userId": "user_xyz789",
    "username": "johndoe",
    "displayName": "John Doe"
  },
  "request": null,
  "navigation": {
    "sessionId": "sess_abc123def456"
  }
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `content.title` | string | 会话标题或默认提示 |
| `content.body` | string | Agent 最后一条消息预览，或默认提示文本 |

---

### 事件 2: permission_request

Agent 请求执行需要用户批准的操作。

#### Payload 示例

```json
{
  "v": 1,
  "channelId": "builtin:default_webhook",
  "createdAt": 1712345678901,
  "topic": "permission_request",
  "content": {
    "title": "Permission Request",
    "body": "Bash: Run command: npm install"
  },
  "session": {
    "sessionId": "sess_abc123def456",
    "title": "Build the project"
  },
  "user": {
    "userId": "user_xyz789",
    "username": "johndoe",
    "displayName": "John Doe"
  },
  "request": {
    "requestId": "req_perm_001",
    "kind": "permission",
    "toolName": "Bash",
    "toolDetails": "Run command: npm install"
  },
  "navigation": {
    "sessionId": "sess_abc123def456",
    "requestId": "req_perm_001"
  }
}
```

#### request 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `request.requestId` | string | 请求 ID，用于标识此次权限请求 |
| `request.kind` | string | 固定为 `permission` |
| `request.toolName` | string | 工具名称（如 `Bash`, `Write`, `Edit` 等） |
| `request.toolDetails` | string | 工具调用详情（如命令内容、文件路径等） |

---

### 事件 3: user_action_request

Agent 需要用户执行特定操作。

#### Payload 示例

```json
{
  "v": 1,
  "channelId": "builtin:default_webhook",
  "createdAt": 1712345678901,
  "topic": "user_action_request",
  "content": {
    "title": "User Action Required",
    "body": "confirm: Please confirm the deployment to production"
  },
  "session": {
    "sessionId": "sess_abc123def456",
    "title": "Deploy to production"
  },
  "user": {
    "userId": "user_xyz789",
    "username": "johndoe",
    "displayName": "John Doe"
  },
  "request": {
    "requestId": "req_action_001",
    "kind": "user_action",
    "toolName": "confirm",
    "toolDetails": "Please confirm the deployment to production"
  },
  "navigation": {
    "sessionId": "sess_abc123def456",
    "requestId": "req_action_001"
  }
}
```

#### request 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `request.requestId` | string | 请求 ID |
| `request.kind` | string | 固定为 `user_action` |
| `request.toolName` | string | 操作类型（如 `confirm`, `ask`, `select` 等） |
| `request.toolDetails` | string | 操作详情描述 |

---

## 响应要求

Webhook 端点应返回：

- **成功**: HTTP 200-299 状态码，响应体任意
- **失败**: 非 2xx 状态码，Server 会记录警告日志

建议响应格式：
```json
{
  "status": "ok"
}
```

## 最佳实践

### 1. 快速响应

Webhook 处理应尽可能快，建议：
- 立即返回 202 Accepted
- 异步处理通知内容

```javascript
app.post('/api/happier/notifications', async (req, res) => {
  // 快速响应
  res.status(202).json({ status: 'accepted' });

  // 异步处理
  processNotificationAsync(req.body).catch(console.error);
});
```

### 2. 幂等处理

相同事件可能被重复发送，建议使用 `createdAt` + `sessionId` + `requestId` 做去重。

### 3. 错误处理

- 验证签名失败返回 401
- 请求格式错误返回 400
- 内部错误返回 500

### 4. 日志记录

建议记录所有接收到的通知，便于排查问题。

## 接入示例

### Node.js + Express

```javascript
const express = require('express');
const crypto = require('crypto');

const app = express();
const WEBHOOK_SECRET = process.env.HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET;

// 解析原始 body 用于签名验证
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// 签名验证中间件
function verifySignature(req, res, next) {
  if (!WEBHOOK_SECRET) return next();

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
  } catch {
    return res.status(401).json({ error: 'Invalid signature format' });
  }

  next();
}

// Webhook 端点
app.post('/api/happier/notifications', verifySignature, async (req, res) => {
  const payload = req.body;

  console.log(`[${new Date().toISOString()}] Received:`, {
    topic: payload.topic,
    sessionId: payload.session?.sessionId,
    sessionTitle: payload.session?.title,
    username: payload.user?.username,
  });

  // 根据事件类型处理
  switch (payload.topic) {
    case 'ready':
      console.log(`Agent ready in session: ${payload.session.title}`);
      break;
    case 'permission_request':
      console.log(`Permission needed: ${payload.request.toolName} - ${payload.request.toolDetails}`);
      break;
    case 'user_action_request':
      console.log(`Action required: ${payload.request.toolDetails}`);
      break;
  }

  res.json({ status: 'ok' });
});

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000');
});
```

### Python + Flask

```python
import hmac
import hashlib
import os
from flask import Flask, request, jsonify

app = Flask(__name__)
WEBHOOK_SECRET = os.environ.get('HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET', '')

def verify_signature(request_body: bytes, signature: str) -> bool:
    if not WEBHOOK_SECRET:
        return True
    expected = 'sha256=' + hmac.new(
        WEBHOOK_SECRET.encode(),
        request_body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)

@app.route('/api/happier/notifications', methods=['POST'])
def handle_notification():
    signature = request.headers.get('X-Happier-Signature-256', '')

    if not verify_signature(request.data, signature):
        return jsonify({'error': 'Invalid signature'}), 401

    payload = request.json

    print(f"Received: topic={payload['topic']}, "
          f"session={payload['session']['sessionId']}, "
          f"user={payload.get('user', {}).get('username')}")

    # 处理不同事件类型
    if payload['topic'] == 'ready':
        print(f"Agent ready: {payload['content']['title']}")
    elif payload['topic'] == 'permission_request':
        req = payload['request']
        print(f"Permission: {req['toolName']} - {req['toolDetails']}")

    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(port=3000)
```

## 转发到消息平台

### Telegram

```javascript
async function sendToTelegram(payload) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const emoji = {
    ready: '✅',
    permission_request: '🔐',
    user_action_request: '👤',
  }[payload.topic] || '📢';

  let text = `${emoji} **${payload.content.title}**\n\n`;
  text += `${payload.content.body}\n\n`;
  text += `📍 Session: ${payload.session.title || payload.session.sessionId}\n`;

  if (payload.user?.username) {
    text += `👤 User: @${payload.user.username}\n`;
  }

  if (payload.request) {
    text += `🔧 Tool: ${payload.request.toolName}\n`;
  }

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  });
}
```

### 企业微信

```javascript
async function sendToWechat(payload) {
  const webhookUrl = process.env.WECHAT_WEBHOOK_URL;

  const text = `【${payload.content.title}】\n${payload.content.body}\n\n会话: ${payload.session.title || payload.session.sessionId}`;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'text',
      text: { content: text },
    }),
  });
}
```

### 钉钉

```javascript
async function sendToDingtalk(payload) {
  const webhookUrl = process.env.DINGTALK_WEBHOOK_URL;

  const text = `### ${payload.content.title}\n\n${payload.content.body}\n\n` +
    `- 会话: ${payload.session.title || payload.session.sessionId}\n` +
    `- 用户: ${payload.user?.displayName || payload.user?.username || '未知'}`;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: { title: payload.content.title, text },
    }),
  });
}
```

## 常见问题

### Q: 如何测试 Webhook？

```bash
curl -X POST https://your-webhook-url/api/happier/notifications \
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
      "sessionId": "test-session-id",
      "title": "Test Session"
    },
    "user": {
      "userId": "test-user-id",
      "username": "testuser",
      "displayName": "Test User"
    },
    "request": null,
    "navigation": {
      "sessionId": "test-session-id"
    }
  }'
```

### Q: 签名验证失败？

1. 确认使用原始请求体（JSON 字符串）计算签名
2. 确认签名格式为 `sha256=<hex>`
3. 检查密钥是否正确（Server 端 `HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET`）

### Q: 收不到通知？

1. 确认 Server 环境变量已正确设置
2. 检查 Server 日志：`journalctl -u happier-server -f`
3. 确认 CLI daemon 已连接到 Server
4. 验证 Webhook URL 是否可访问

### Q: 通知延迟？

通知是异步发送的，不会阻塞 Agent。如果延迟较高：
1. 检查网络连接
2. 检查 Webhook 服务响应时间
3. 考虑使用消息队列缓冲

## 相关链接

- [Happier GitHub](https://github.com/skyispainted/happier)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [企业微信机器人](https://developer.work.weixin.qq.com/document/path/91770)
- [钉钉机器人](https://open.dingtalk.com/document/robots/custom-robot-access)