/**
 * テスト①: Chatwork に手動で1件メッセージを投稿するスクリプト
 *
 * 使い方:
 *   CHATWORK_API_TOKEN=xxx CHATWORK_ROOM_ID=425737026 node scripts/post-to-chatwork.js
 *   （または line-bot/.env に設定し、line-bot から: node -r dotenv/config ../scripts/post-to-chatwork.js）
 *
 * オプション: 第1引数でメッセージ本文を上書き可能
 *   node scripts/post-to-chatwork.js "テスト投稿です"
 */
const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;
const CHATWORK_ROOM_ID = process.env.CHATWORK_ROOM_ID;

if (!CHATWORK_API_TOKEN || !CHATWORK_ROOM_ID) {
  console.error('環境変数 CHATWORK_API_TOKEN と CHATWORK_ROOM_ID を設定してください。');
  process.exit(1);
}

const body = process.argv[2] || '[info][title]Carelife テスト[/title]手動投稿のテストです。\n' + new Date().toISOString() + '[/info]';

async function postToChatwork() {
  const url = `https://api.chatwork.com/v2/rooms/${CHATWORK_ROOM_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-chatworktoken': CHATWORK_API_TOKEN,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ body }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Chatwork API エラー:', res.status, text);
    process.exit(1);
  }

  const data = await res.json();
  console.log('投稿しました。message_id:', data.message_id);
}

postToChatwork().catch((err) => {
  console.error(err);
  process.exit(1);
});
