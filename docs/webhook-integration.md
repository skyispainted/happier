# Webhook 集成指南

本文档说明如何配置 Happier 的 Webhook 通知功能，将活动事件推送到您的服务器。

## 概述

Happier 支持通过 Webhook 将以下事件推送到您配置的端点：

| 事件类型 | 说明 |
|---------|------|
| `ready` | Session 进入就绪状态，等待用户输入 |
| `permission_request` | Agent 请求执行敏感操作，需要用户批准 |
| `user_action_request` | Agent 需要用户提供额外信息或确认 |

## 架构

```
┌─────────┐     ┌─────────┐     ┌─────────────┐
│  CLI    │────▶│ Server  │────▶│ Your Server │
└─────────┘     └─────────┘     └─────────────┘
                      │
                      ▼
              ┌─────────────┐
              │ 签名 + 转发  │
              └─────────────┘
```

1. CLI 触发事件，推送到 Happier Server
2. Happier Server 添加签名并转发到您的 Webhook 端点
3. 您的服务器验证签名并处理事件

## 配置 Webhook

### 通过 App 配置

1. 打开 Happier App
2. 进入 **设置** > **通知** > **Webhook 通知**
3. 点击 **添加 webhook**
4. 输入您的 Webhook URL（必须为 `http://` 或 `https://`）
5. （可选）配置签名密钥以验证请求真实性

### Webhook 配置字段

| 字段 | 说明 |
|------|------|
| `url` | Webhook 端点 URL |
| `enabled` | 是否启用此 webhook |
| `topics` | 订阅的事件类型 |
| `signingSecret` | 签名密钥（可选） |
| `readyIncludeMessageText` | ready 事件是否包含消息预览 |

## Payload 结构

### 完整 Payload 示例

```json
{
  "v": 1,
  "channelId": "webhook-primary",
  "createdAt": 1700000000000,
  "topic": "ready",
  "content": {
    "title": "Review branch",
    "body": "Codex is waiting for your command"
  },
  "session": {
    "sessionId": "session-abc123",
    "title": "Review branch"
  },
  "account": {
    "accountId": "user-xyz789",
    "username": "john_doe"
  },
  "navigation": {
    "sessionId": "session-abc123"
  }
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `v` | number | Payload 版本，当前为 `1` |
| `channelId` | string | Webhook channel ID |
| `createdAt` | number | 创建时间戳（毫秒） |
| `topic` | string | 事件类型 |
| `content` | object | 通知内容 |
| `content.title` | string | 通知标题 |
| `content.body` | string | 通知正文 |
| `session` | object | Session 信息 |
| `session.sessionId` | string | Session ID |
| `session.title` | string | Session 标题（可为 null） |
| `account` | object | 账户信息 |
| `account.accountId` | string | 用户 ID |
| `account.username` | string | 用户名（可为 null） |
| `request` | object | 请求详情（仅 permission_request/user_action_request） |
| `request.requestId` | string | 请求 ID |
| `request.kind` | string | 请求类型：`permission` 或 `user_action` |
| `request.toolName` | string | 工具名称 |
| `request.toolDetails` | string | 工具详情（可为 null） |
| `navigation` | object | 导航信息 |
| `navigation.sessionId` | string | 用于导航的 Session ID |
| `navigation.requestId` | string | 用于导航的 Request ID（仅权限请求） |

### 事件类型示例

#### Ready 事件

```json
{
  "v": 1,
  "channelId": "webhook-primary",
  "createdAt": 1700000000000,
  "topic": "ready",
  "content": {
    "title": "Review branch",
    "body": "Codex is waiting for your command"
  },
  "session": {
    "sessionId": "session-abc123",
    "title": "Review branch"
  },
  "account": {
    "accountId": "user-xyz789",
    "username": "john_doe"
  },
  "navigation": {
    "sessionId": "session-abc123"
  }
}
```

#### Permission Request 事件

```json
{
  "v": 1,
  "channelId": "webhook-primary",
  "createdAt": 1700000000000,
  "topic": "permission_request",
  "content": {
    "title": "Permission Request",
    "body": "Approval needed for: Bash\nCommand: git push"
  },
  "session": {
    "sessionId": "session-abc123",
    "title": "Deploy fix"
  },
  "account": {
    "accountId": "user-xyz789",
    "username": "john_doe"
  },
  "request": {
    "requestId": "req-456",
    "kind": "permission",
    "toolName": "Bash",
    "toolDetails": "Command: git push"
  },
  "navigation": {
    "sessionId": "session-abc123",
    "requestId": "req-456"
  }
}
```

## 签名验证

如果您配置了 `signingSecret`，Happier Server 会使用 HMAC-SHA256 对 payload 进行签名。

### 签名头

```
X-Happier-Signature-256: sha256=<hex-signature>
```

### 验证示例（Node.js）

```javascript
import { createHmac } from 'crypto';

function verifySignature(payload, signature, secret) {
  const expectedSignature = createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return `sha256=${expectedSignature}` === signature;
}

// Express 示例
app.post('/webhook', express.json(), (req, res) => {
  const signature = req.headers['x-happier-signature-256'];
  const secret = process.env.HAPPIER_WEBHOOK_SECRET;

  if (!verifySignature(req.body, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 处理 webhook
  console.log('Received webhook:', req.body);
  res.json({ ok: true });
});
```

### 验证示例（Python）

```python
import hmac
import hashlib

def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()

    return f"sha256={expected}" == signature

# Flask 示例
@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('X-Happier-Signature-256')
    secret = os.environ.get('HAPPIER_WEBHOOK_SECRET')

    if not verify_signature(request.data, signature, secret):
        return jsonify({'error': 'Invalid signature'}), 401

    payload = request.json
    print(f"Received webhook: {payload}")
    return jsonify({'ok': True})
```

## 响应要求

您的 Webhook 端点应：

1. **返回 2xx 状态码**：表示成功接收
2. **在 30 秒内响应**：超时将视为失败
3. **幂等处理**：相同事件可能重复发送

### 建议响应

```json
{
  "ok": true
}
```

## 完整服务器示例

### Node.js (Express)

```javascript
import express from 'express';
import { createHmac } from 'crypto';

const app = express();
const WEBHOOK_SECRET = process.env.HAPPIER_WEBHOOK_SECRET;

app.use(express.json());

function verifySignature(req) {
  const signature = req.headers['x-happier-signature-256'];
  if (!signature || !WEBHOOK_SECRET) return false;

  const expected = createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  return `sha256=${expected}` === signature;
}

app.post('/webhook', (req, res) => {
  // 验证签名
  if (!verifySignature(req)) {
    console.warn('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = req.body;

  // 根据 topic 处理不同事件
  switch (payload.topic) {
    case 'ready':
      console.log(`Session ready: ${payload.session?.title}`);
      // 可以发送通知、更新状态等
      break;

    case 'permission_request':
      console.log(`Permission needed: ${payload.request?.toolName}`);
      // 可以触发审批流程
      break;

    case 'user_action_request':
      console.log(`User action needed: ${payload.request?.toolName}`);
      // 可以发送提醒
      break;
  }

  res.json({ ok: true });
});

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000');
});
```

### Python (Flask)

```python
import os
import hmac
import hashlib
from flask import Flask, request, jsonify

app = Flask(__name__)
WEBHOOK_SECRET = os.environ.get('HAPPIER_WEBHOOK_SECRET', '')

def verify_signature():
    signature = request.headers.get('X-Happier-Signature-256', '')
    if not signature or not WEBHOOK_SECRET:
        return False

    expected = hmac.new(
        WEBHOOK_SECRET.encode(),
        request.data,
        hashlib.sha256
    ).hexdigest()

    return f"sha256={expected}" == signature

@app.route('/webhook', methods=['POST'])
def handle_webhook():
    if not verify_signature():
        return jsonify({'error': 'Invalid signature'}), 401

    payload = request.json
    topic = payload.get('topic')

    if topic == 'ready':
        session = payload.get('session', {})
        print(f"Session ready: {session.get('title')}")

    elif topic == 'permission_request':
        req = payload.get('request', {})
        print(f"Permission needed: {req.get('toolName')}")

    elif topic == 'user_action_request':
        req = payload.get('request', {})
        print(f"User action needed: {req.get('toolName')}")

    return jsonify({'ok': True})

if __name__ == '__main__':
    app.run(port=3000)
```

## 故障排查

### 常见问题

**Q: 没有收到 Webhook**

1. 检查 URL 是否正确配置
2. 确认 Webhook channel 已启用
3. 检查相应 topic 是否在配置中启用
4. 确认您的服务器可从公网访问

**Q: 签名验证失败**

1. 确认 `signingSecret` 配置正确
2. 检查是否使用原始 request body 计算签名（非解析后的对象）
3. 确认使用 SHA256 算法

**Q: 收到重复事件**

这是正常行为。请确保您的处理逻辑是幂等的，可以通过 `channelId` + `createdAt` 去重。

### 调试技巧

1. 使用 [ngrok](https://ngrok.com) 创建测试端点
2. 使用 [Webhook.site](https://webhook.site) 查看原始请求
3. 检查 Server 日志中的 `webhook-dispatch` 模块输出

## 安全建议

1. **始终使用签名验证**：配置 `signingSecret` 并验证每个请求
2. **使用 HTTPS**：确保传输层安全
3. **IP 白名单**（可选）：限制只接受来自 Happier Server 的请求
4. **敏感信息**：不要在 `toolInput` 中存储敏感信息，Happier 会自动脱敏

## 限制

- 每个 account 最多配置 10 个 Webhook channels
- 请求超时时间：30 秒
- Payload 大小限制：~64KB
- 重试策略：当前不自动重试，请确保您的服务可靠响应