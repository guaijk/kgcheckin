/**
 * 多渠道通知模块
 * 支持以下通知渠道（通过环境变量 / GitHub Secrets 配置）：
 *
 *  1. 企业微信机器人   WECOM_BOT_KEY          (webhook key)
 *  2. 钉钉机器人       DINGTALK_BOT_KEY       (+ 可选 DINGTALK_SECRET)
 *  3. 飞书机器人       FEISHU_BOT_KEY         (webhook key)
 *  4. 云湖机器人       YUNHU_BOT_KEY          (webhook key)
 *  5. Server酱         SERVERCHAN_SENDKEY     (sendkey)
 *  6. PushPlus         PUSHPLUS_TOKEN         (+ 可选 PUSHPLUS_TOPIC)
 *  7. Telegram Bot     TG_BOT_TOKEN + TG_CHAT_ID
 *  8. Bark (iOS)       BARK_KEY               (+ 可选 BARK_GROUP)
 *  9. Discord Webhook  DISCORD_WEBHOOK        (完整 URL)
 * 10. 邮箱 SMTP        MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_TO
 *
 * 所有渠道均使用 Node.js 内置模块，无外部依赖。
 */

import crypto from 'node:crypto'
import tls from 'node:tls'
import { printGreen, printRed, printYellow } from './colorOut.js'

/* ------------------------------------------------------------------ */
/*  各渠道发送实现                                                      */
/* ------------------------------------------------------------------ */

// 1. 企业微信机器人
async function sendWeCom(title, content, key) {
  const url = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${key}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'text',
      text: { content: `${title}\n\n${content}` },
    }),
  })
  return resp.ok
}

// 2. 钉钉机器人
async function sendDingTalk(title, content, key, secret) {
  let url = `https://oapi.dingtalk.com/robot/send?access_token=${key}`
  if (secret) {
    const timestamp = Date.now()
    const stringToSign = `${timestamp}\n${secret}`
    const sign = crypto
      .createHmac('sha256', secret)
      .update(stringToSign)
      .digest('base64')
    url += `&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: { title, text: `### ${title}\n\n${content}` },
    }),
  })
  return resp.ok
}

// 3. 飞书机器人
async function sendFeishu(title, content, key) {
  const url = `https://open.feishu.cn/open-apis/bot/v2/hook/${key}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'text',
      content: { text: `${title}\n\n${content}` },
    }),
  })
  return resp.ok
}

// 4. 云湖机器人
async function sendYunhu(title, content, key) {
  const url = `https://www.yhchat.com/bot/send?key=${key}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg: { text: `${title}\n\n${content}` },
    }),
  })
  return resp.ok
}

// 5. Server酱
async function sendServerChan(title, content, sendkey) {
  const url = `https://sctapi.ftqq.com/${sendkey}.send`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ title, desp: content }),
  })
  return resp.ok
}

// 6. PushPlus
async function sendPushPlus(title, content, token, topic) {
  const url = 'http://www.pushplus.plus/send'
  const body = { token, title, content, template: 'txt' }
  if (topic) body.topic = topic
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return resp.ok
}

// 7. Telegram Bot
async function sendTelegram(title, content, botToken, chatId) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `*${title}*\n\n${content}`,
      parse_mode: 'Markdown',
    }),
  })
  return resp.ok
}

// 8. Bark (iOS 推送)
async function sendBark(title, content, key, group) {
  const base = key.startsWith('http') ? key : `https://api.day.app/${key}`
  const url = `${base}/${encodeURIComponent(title)}/${encodeURIComponent(content)}`
  const params = new URLSearchParams()
  if (group) params.set('group', group)
  const finalUrl = params.toString() ? `${url}?${params}` : url
  const resp = await fetch(finalUrl)
  return resp.ok
}

// 9. Discord Webhook
async function sendDiscord(title, content, webhookUrl) {
  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `**${title}**\n\n${content}`.slice(0, 2000),
    }),
  })
  return resp.ok
}

// 10. 邮箱 SMTP（使用 node:tls 实现最小 SMTP 客户端）
function sendMailSMTP(title, content, cfg) {
  return new Promise((resolve, reject) => {
    const { host, port, user, pass, to } = cfg
    const from = user
    const subject = `=?UTF-8?B?${Buffer.from(title).toString('base64')}?=`
    const date = new Date().toUTCString()
    const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@kgcheckin>`

    const mailBody = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${date}`,
      `Message-ID: ${messageId}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      content,
    ].join('\r\n')

    const lines = [
      `EHLO kgcheckin`,
      `AUTH LOGIN`,
      Buffer.from(user).toString('base64'),
      Buffer.from(pass).toString('base64'),
      `MAIL FROM:<${from}>`,
      `RCPT TO:<${to}>`,
      'DATA',
      mailBody.replace(/\r?\n/g, '\r\n') + '\r\n.',
      'QUIT',
    ]

    let step = 0
    let buffer = ''
    const socket = tls.connect(
      { host, port: Number(port) || 465, rejectUnauthorized: true },
      () => {}
    )

    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
      buffer += chunk
      while (true) {
        const idx = buffer.indexOf('\r\n')
        if (idx === -1) break
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const code = parseInt(line.slice(0, 3), 10)

        if (code >= 400) {
          socket.destroy()
          reject(new Error(`SMTP 错误: ${line}`))
          return
        }

        // 等待多行响应结束（最后一行以 "code " 开头，中间行以 "code-" 开头）
        if (line[3] === '-') continue

        if (step < lines.length) {
          socket.write(lines[step] + '\r\n')
          step++
        }
      }
    })

    // 超时保护
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('SMTP 超时'))
    }, 15000)

    socket.on('end', () => { clearTimeout(timer); resolve(true) })
    socket.on('close', () => { clearTimeout(timer); resolve(true) })
    socket.on('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

/* ------------------------------------------------------------------ */
/*  统一发送入口                                                        */
/* ------------------------------------------------------------------ */

/**
 * 发送通知到所有已配置的渠道
 * @param {string} title - 通知标题
 * @param {string} content - 通知正文（纯文本）
 */
async function sendNotify(title, content) {
  const channels = []

  // 收集所有已配置的渠道
  if (process.env.WECOM_BOT_KEY) {
    channels.push({ name: '企业微信', fn: () => sendWeCom(title, content, process.env.WECOM_BOT_KEY) })
  }
  if (process.env.DINGTALK_BOT_KEY) {
    channels.push({ name: '钉钉', fn: () => sendDingTalk(title, content, process.env.DINGTALK_BOT_KEY, process.env.DINGTALK_SECRET) })
  }
  if (process.env.FEISHU_BOT_KEY) {
    channels.push({ name: '飞书', fn: () => sendFeishu(title, content, process.env.FEISHU_BOT_KEY) })
  }
  if (process.env.YUNHU_BOT_KEY) {
    channels.push({ name: '云湖', fn: () => sendYunhu(title, content, process.env.YUNHU_BOT_KEY) })
  }
  if (process.env.SERVERCHAN_SENDKEY) {
    channels.push({ name: 'Server酱', fn: () => sendServerChan(title, content, process.env.SERVERCHAN_SENDKEY) })
  }
  if (process.env.PUSHPLUS_TOKEN) {
    channels.push({ name: 'PushPlus', fn: () => sendPushPlus(title, content, process.env.PUSHPLUS_TOKEN, process.env.PUSHPLUS_TOPIC) })
  }
  if (process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID) {
    channels.push({ name: 'Telegram', fn: () => sendTelegram(title, content, process.env.TG_BOT_TOKEN, process.env.TG_CHAT_ID) })
  }
  if (process.env.BARK_KEY) {
    channels.push({ name: 'Bark', fn: () => sendBark(title, content, process.env.BARK_KEY, process.env.BARK_GROUP) })
  }
  if (process.env.DISCORD_WEBHOOK) {
    channels.push({ name: 'Discord', fn: () => sendDiscord(title, content, process.env.DISCORD_WEBHOOK) })
  }
  if (process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS && process.env.MAIL_TO) {
    channels.push({
      name: '邮箱',
      fn: () => sendMailSMTP(title, content, {
        host: process.env.MAIL_HOST,
        port: process.env.MAIL_PORT || 465,
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
        to: process.env.MAIL_TO,
      }),
    })
  }

  if (channels.length === 0) {
    return
  }

  printYellow(`正在发送通知到 ${channels.length} 个渠道...`)
  const results = await Promise.allSettled(channels.map(async (ch) => {
    const ok = await ch.fn()
    return { name: ch.name, ok }
  }))

  let success = 0
  let fail = 0
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.ok) {
      printGreen(`  ✓ ${r.value.name} 发送成功`)
      success++
    } else {
      const name = r.status === 'fulfilled' ? r.value.name : '未知'
      const reason = r.status === 'rejected' ? r.reason?.message : 'HTTP错误'
      printRed(`  ✗ ${name} 发送失败: ${reason}`)
      fail++
    }
  }
  printYellow(`通知发送完成: ${success} 成功, ${fail} 失败`)
}

export { sendNotify }
