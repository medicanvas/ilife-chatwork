/**
 * Carelife 通院報告 — LINE Bot (MVP)
 * 環境変数 LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN が設定されている場合のみ
 * メッセージに応答し、報告作成用のリンクを返します。
 * 未設定の場合は Webhook に 200 を返すだけ（LINE の検証用）。
 * CHATWORK_API_TOKEN / CHATWORK_ROOM_ID が設定されている場合、受信テキストを Chatwork に転送します。
 * （環境変数は Cloud Run の「変数とシークレット」等で設定してください。.env は読み込みません）
 */
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

// LINE からは body をそのまま検証するため raw
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));

// 報告作成用フロントエンドのURL（環境変数で上書き可能）
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Chatwork 転送（環境変数が設定されているときのみ。前後の空白は除去）
const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN ? String(process.env.CHATWORK_API_TOKEN).trim() : '';
const CHATWORK_ROOM_ID = process.env.CHATWORK_ROOM_ID ? String(process.env.CHATWORK_ROOM_ID).trim() : '';

/** 日本時間（JST）で YYYY-MM-DD HH:mm:ss 形式の文字列を返す（LINE/Chatwork 送信用） */
function formatTimeJst(date = new Date()) {
  return date.toLocaleString('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(', ', ' ');
}

/**
 * LINE で受信したテキストを Chatwork の指定ルームに投稿する
 * @param {string} userId - LINE のユーザーID
 * @param {string} text - メッセージ本文
 * @param {string} [sourceType] - group / user など（任意）
 */
function postLineMessageToChatwork(userId, text, sourceType) {
  if (!CHATWORK_API_TOKEN || !CHATWORK_ROOM_ID) {
    console.log('[Chatwork] 転送スキップ: CHATWORK_API_TOKEN または CHATWORK_ROOM_ID が未設定です。Cloud Run の「変数とシークレット」を確認してください。');
    return;
  }
  const time = formatTimeJst();
  const sourceLabel = sourceType === 'group' ? 'グループ' : sourceType === 'user' ? '1対1' : (sourceType || 'LINE');
  const body = `[info][title]LINE から（${sourceLabel}）[/title]送信者ID: ${userId || '(不明)'}\n本文:\n${text || '(空)'}\n時刻: ${time}[/info]`;
  const url = `https://api.chatwork.com/v2/rooms/${CHATWORK_ROOM_ID}/messages`;
  fetch(url, {
    method: 'POST',
    headers: {
      'x-chatworktoken': CHATWORK_API_TOKEN,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ body }).toString(),
  })
    .then((r) => {
      if (!r.ok) {
        return r.text().then((t) => {
          console.error('[Chatwork] API エラー', r.status, t);
          throw new Error(`${r.status}: ${t}`);
        });
      }
      return r.json();
    })
    .then((data) => console.log('[Chatwork] 転送しました message_id:', data.message_id))
    .catch((err) => console.error('[Chatwork] 転送エラー:', err.message));
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Carelife LINE Bot (MVP)' });
});

app.post('/webhook', (req, res) => {
  res.status(200).send('OK');

  const events = req.body?.events || [];
  console.log('[LINE] POST /webhook received, events:', events.length);

  const secret = process.env.LINE_CHANNEL_SECRET;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    console.log('[LINE] Credentials not set. Skip reply.');
    return;
  }

  for (const ev of events) {
    const replyToken = ev.replyToken;
    let triggerReport = false;
    // 1:1 / グループ / ルームいずれも source.userId で送信者を取得（必須：この値がないと「LINEに送信する」の宛先が決まらない）
    const userId = (ev.source && ev.source.userId) ? String(ev.source.userId).trim() : '';

    // テキストメッセージ:「報告」「通院」「はじめる」「スタート」で報告作成リンクを返す
    if (ev.type === 'message' && ev.message?.type === 'text') {
      const text = (ev.message.text || '').trim();
      if (/報告|通院|はじめる|スタート/.test(text)) triggerReport = true;
      // Chatwork 転送（CHATWORK_API_TOKEN / CHATWORK_ROOM_ID が設定されている場合）
      const sourceType = ev.source && ev.source.type;
      console.log('[LINE] テキスト受信 → Chatwork 転送を試行 type=', ev.type, 'sourceType=', sourceType);
      postLineMessageToChatwork(userId, text, sourceType);
    }

    // リッチメニューのポストバック: data が "report" または "action=report" のときも同じく報告リンクを返す
    if (ev.type === 'postback' && ev.postback?.data) {
      const data = (ev.postback.data || '').trim().toLowerCase();
      if (data === 'report' || data === 'action=report') triggerReport = true;
    }

    if (triggerReport) {
      const sep = FRONTEND_URL.indexOf('?') >= 0 ? '&' : '?';
      const reportUrl = userId
        ? FRONTEND_URL + sep + 'userId=' + encodeURIComponent(userId)
        : FRONTEND_URL;
      if (!userId) {
        console.warn('[LINE] report link: userId is empty. source=', JSON.stringify(ev.source));
      } else {
        console.log('[LINE] report link with userId (length=' + userId.length + ')');
      }
      const message = {
        type: 'text',
        text: `通院報告を作成します。\n下のリンクからはじめてください。\n\n${reportUrl}`
      };
      fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ replyToken, messages: [message] })
      }).then(r => r.ok ? null : r.text()).then(t => t && console.error('[LINE] Reply error:', t));
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LINE Bot server running on port ${PORT}`);
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    console.log('LINE_CHANNEL_ACCESS_TOKEN not set. Bot will not reply to messages.');
  }
  if (!CHATWORK_API_TOKEN || !CHATWORK_ROOM_ID) {
    console.log('[Chatwork] CHATWORK_API_TOKEN または CHATWORK_ROOM_ID が未設定のため、LINE→Chatwork 転送は行われません。');
  } else {
    console.log('[Chatwork] 転送有効: room_id=', CHATWORK_ROOM_ID);
  }
});
