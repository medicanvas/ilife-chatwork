/**
 * Chatwork AI要約Bot — GASスクリプト
 *
 * Chatwork内で完結するAI要約システム。
 * 2つの動作モードを1つのスクリプトで実現:
 *
 * A. コマンド駆動: ルーム内で「@要約 週次」等と投稿 → Botが要約を返信
 * B. 週次自動投稿: 毎週日曜21:00に全ルームの週次サマリーを自動投稿
 *
 * 前提:
 *   - gas-chatwork-collector.js でメッセージがスプレッドシートに蓄積済み
 *   - Gemini API Key がスクリプトプロパティに設定済み
 *   - Chatwork API Token がスクリプトプロパティに設定済み
 *
 * セットアップ:
 *   1. 新規GASプロジェクトを作成（収集スクリプトとは別）
 *   2. スクリプトプロパティに以下を設定:
 *      - CHATWORK_API_TOKEN: Chatwork APIトークン
 *      - GEMINI_API_KEY: Gemini APIキー
 *      - COLLECTOR_SPREADSHEET_ID: 収集スプレッドシートのID
 *   3. setupWeeklyTrigger() を実行（毎週日曜21:00にweeklyAutoRunを実行）
 *   4. （コマンド駆動を使う場合）デプロイ → WebアプリURL取得 → ChatworkのWebhookに設定
 */

// ============================================================
// 定数
// ============================================================

const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// コマンドキーワード
const COMMAND_PREFIX = '@要約';
const COMMANDS = {
  '週次': 'weekly',
  'リスク検知': 'risk_detection',
  'リスク': 'risk_detection',
  '区分認定': 'category_assessment',
  '区分': 'category_assessment'
};

// ============================================================
// A. コマンド駆動（Webhook受信）
// ============================================================

/**
 * Chatwork Webhookの受信エンドポイント
 * メッセージに「@要約」が含まれていたら要約を生成して返信
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const webhookEvent = payload.webhook_event;

    if (!webhookEvent || webhookEvent.message_id === undefined) {
      return ContentService.createTextOutput('OK');
    }

    const roomId = String(webhookEvent.room_id);
    const body = webhookEvent.body || '';
    const accountId = webhookEvent.account_id;

    // 自分自身（Bot）の投稿は無視
    const myAccountId = getMyAccountId_();
    if (String(accountId) === String(myAccountId)) {
      return ContentService.createTextOutput('OK');
    }

    // @要約 コマンドを検出
    if (!body.includes(COMMAND_PREFIX)) {
      return ContentService.createTextOutput('OK');
    }

    // コマンドを解析
    const { summaryType, period } = parseCommand_(body);

    // 非同期で処理（タイムアウト防止）
    processCommand_(roomId, summaryType, period);

    return ContentService.createTextOutput('OK');
  } catch (err) {
    console.error('[doPost] Error:', err);
    return ContentService.createTextOutput('Error: ' + err.message);
  }
}

/**
 * コマンドを解析
 * 例: "@要約 週次" → { summaryType: 'weekly', period: '1week' }
 * 例: "@要約 区分認定 3ヶ月" → { summaryType: 'category_assessment', period: '3months' }
 */
function parseCommand_(body) {
  const afterPrefix = body.split(COMMAND_PREFIX)[1] || '';
  const parts = afterPrefix.trim().split(/\s+/);

  let summaryType = 'weekly'; // デフォルト
  let period = '1week';

  // 要約タイプの判定
  for (const [keyword, type] of Object.entries(COMMANDS)) {
    if (parts.some(p => p.includes(keyword))) {
      summaryType = type;
      break;
    }
  }

  // 期間の判定
  const periodText = parts.join('');
  if (periodText.includes('1年') || periodText.includes('12ヶ月')) period = '1year';
  else if (periodText.includes('3ヶ月') || periodText.includes('3か月')) period = '3months';
  else if (periodText.includes('1ヶ月') || periodText.includes('1か月')) period = '1month';
  else if (periodText.includes('1週') || periodText.includes('週次')) period = '1week';

  // 区分認定はデフォルト3ヶ月
  if (summaryType === 'category_assessment' && period === '1week') {
    period = '3months';
  }

  return { summaryType, period };
}

/**
 * コマンドを処理して結果をChatworkに投稿
 */
function processCommand_(roomId, summaryType, period) {
  try {
    // 「処理中」メッセージを投稿
    const processingMsgId = postToChatwork_(
      roomId,
      '[info]AI要約を生成中です...しばらくお待ちください[/info]'
    );

    // メッセージ取得 → 要約生成
    const result = generateSummary_(roomId, summaryType, period);

    // 結果をChatwork記法に整形して投稿
    const titleMap = {
      weekly: '週次サマリー（AI生成）',
      risk_detection: 'リスク検知レポート（AI生成）',
      category_assessment: '区分認定用エビデンス（AI生成）'
    };
    const title = titleMap[summaryType] || 'AI要約';
    const chatworkMsg = `[info][title]${title}[/title]${result}[/info]`;

    postToChatwork_(roomId, chatworkMsg);

  } catch (err) {
    console.error('[processCommand] Error:', err);
    postToChatwork_(roomId, `[info][title]エラー[/title]要約の生成に失敗しました: ${err.message}[/info]`);
  }
}

// ============================================================
// B. 週次自動投稿
// ============================================================

/**
 * 毎週自動実行: 全ルームの週次サマリーを生成してChatworkに投稿
 */
function weeklyAutoRun() {
  const rooms = getTargetRooms_();

  for (const room of rooms) {
    try {
      const result = generateSummary_(room.roomId, 'weekly', '1week');
      const roomName = room.roomName || room.roomId;
      const chatworkMsg = `[info][title]週次サマリー（AI自動生成）${roomName}[/title]${result}[/info]`;
      postToChatwork_(room.roomId, chatworkMsg);

      writeLog_(`週次サマリー投稿完了: ${roomName}`);
      Utilities.sleep(2000); // レートリミット対策
    } catch (err) {
      writeLog_(`[ERROR] ${room.roomId}: ${err.message}`);
    }
  }

  writeLog_('--- 週次自動投稿 完了 ---');
}

// ============================================================
// 要約生成（コア処理）
// ============================================================

/**
 * スプレッドシートからメッセージ取得 → ノイズ除去 → Gemini要約
 */
function generateSummary_(roomId, summaryType, period) {
  // 1. スプレッドシートからメッセージ取得
  const messages = getMessagesFromSheet_(roomId, period);

  if (messages.length === 0) {
    return '指定期間のメッセージが見つかりません。\nGAS収集スクリプトが動作しているか確認してください。';
  }

  // 2. ノイズ除去
  const filtered = filterNoise_(messages);

  // 3. プロンプト用テキストに整形（出典タグ付き）
  const messagesText = filtered.map(m => {
    return `[REF:${m.messageId}] [${m.dateStr}] ${m.accountName}:\n${m.body}`;
  }).join('\n\n---\n\n');

  // 4. Gemini APIで要約生成
  const prompt = buildPrompt_(summaryType, messagesText, roomId, period);
  const summary = callGemini_(prompt);

  return summary;
}

/**
 * スプレッドシートからメッセージを取得
 */
function getMessagesFromSheet_(roomId, period) {
  const ssId = PropertiesService.getScriptProperties().getProperty('COLLECTOR_SPREADSHEET_ID');
  if (!ssId) throw new Error('COLLECTOR_SPREADSHEET_ID が設定されていません');

  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName('メッセージ');
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();

  // 期間計算
  const now = new Date();
  let startDate = new Date();
  switch (period) {
    case '1week': startDate.setDate(now.getDate() - 7); break;
    case '1month': startDate.setMonth(now.getMonth() - 1); break;
    case '3months': startDate.setMonth(now.getMonth() - 3); break;
    case '1year': startDate.setFullYear(now.getFullYear() - 1); break;
    default: startDate.setDate(now.getDate() - 7);
  }

  // フィルタ: room_id一致 + 期間内
  return data
    .filter(row => {
      const msgRoomId = String(row[1]); // room_id (B列)
      const sendTime = row[6]; // send_time (G列)
      if (msgRoomId !== String(roomId)) return false;
      if (!sendTime) return false;
      const msgDate = sendTime instanceof Date ? sendTime : new Date(sendTime);
      return msgDate >= startDate && msgDate <= now;
    })
    .map(row => ({
      messageId: String(row[0]),   // message_id (A列)
      roomId: String(row[1]),      // room_id (B列)
      roomName: row[2],            // room_name (C列)
      accountId: String(row[3]),   // account_id (D列)
      accountName: row[4],         // account_name (E列)
      body: row[5],                // body (F列)
      sendTime: row[6],            // send_time (G列)
      dateStr: row[7],             // send_time_str (H列)
    }));
}

/**
 * 簡易ノイズ除去
 */
function filterNoise_(messages) {
  const noisePatterns = [
    /シフト表/, /洗剤/, /買ってきます/,
    /お疲れ様です[！!]?$/, /了解です/,
    /ありがとうございます[！!]?$/, /連絡お願い/
  ];

  return messages.filter(m => {
    const body = m.body || '';
    if (body.length < 10) return false;
    return !noisePatterns.some(p => p.test(body));
  });
}

// ============================================================
// プロンプト生成
// ============================================================

function buildPrompt_(summaryType, messagesText, roomId, period) {
  const periodLabel = { '1week': '直近1週間', '1month': '直近1ヶ月', '3months': '直近3ヶ月', '1year': '直近1年' }[period] || period;

  const citationRule = `【出典ルール（最重要）】
各事実の記載の後に、必ず以下の形式で出典を付けてください:
  └ 記録: 記録者名（日時）
  └ 「元メッセージから該当部分を引用（50文字以内に要約）」

出典が付いていない事実は記載しないでください。
時系列順に記載し、日付の流れがわかるようにしてください。
記録内の [REF:xxx] タグは出典の追跡用IDです。出力には含めないでください。`;

  if (summaryType === 'weekly') {
    return `あなたは障害者グループホームの管理者を支援するAIです。

以下のチャットワーク支援記録から、${periodLabel}の週次サマリーを作成してください。

【出力ルール】
・マークダウン記号は使わないでください。見出しは「■」で区切ってください。
・総合評価は「安定」「注意」「要介入」の3段階で。

${citationRule}

【出力フォーマット】
【総合評価】安定 / 注意 / 要介入

■ 身体面
■ 精神面・行動面
■ 生活面
■ 来週への申し送り

【チャットワーク支援記録】
${messagesText}`;
  }

  if (summaryType === 'risk_detection') {
    return `あなたは障害者グループホームの安全管理AIです。

以下のチャットワーク投稿を分析し、管理者に報告すべき「異常・リスク」を検出してください。

赤（緊急）: 発熱38度以上、てんかん発作、嘔吐、自傷行為、他害行為、誤嚥、酸素低下、チアノーゼ、意識消失
黄（注意）: 便秘3日以上、食事摂取量の大幅減少、睡眠の著しい乱れ、こだわりの急変、副作用、不穏の持続
緑（記録）: ADLの変化、対人関係の変化、新行動パターン

${citationRule}

【出力フォーマット】
各リスクを以下の形式で記載:
赤【カテゴリ名】事実の要約
  └ 記録: 記録者名（日時）
  └ 「引用テキスト」
  → 推奨対応

【チャットワーク投稿】
${messagesText}`;
  }

  if (summaryType === 'category_assessment') {
    return `あなたは障害福祉の区分認定調査を支援するAIです。

以下のチャットワーク支援記録（${periodLabel}）から、障害支援区分の認定調査に必要な情報を、5領域に沿って整理してください。

「支援が必要である根拠」を具体的なエピソードで示してください。
数値化できるもの（発作回数、自傷回数、覚醒回数、介助時間など）は数値で示してください。

${citationRule}

【5領域】
■ 1. 移動や動作等
■ 2. 身の回りの世話・日常生活
■ 3. 意思疎通等
■ 4. 行動障害（最重要）
■ 5. 特別な医療

■ 総合所見（3〜5文）

【チャットワーク支援記録】
${messagesText}`;
  }

  // デフォルト: 週次
  return buildPrompt_('weekly', messagesText, roomId, period);
}

// ============================================================
// Chatwork API
// ============================================================

function postToChatwork_(roomId, body) {
  const token = getChatworkToken_();
  const url = `${CHATWORK_API_BASE}/rooms/${roomId}/messages`;

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: { 'X-ChatWorkToken': token },
    payload: { body: body },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`Chatwork投稿エラー (${response.getResponseCode()}): ${response.getContentText()}`);
  }

  const result = JSON.parse(response.getContentText());
  return result.message_id;
}

function getMyAccountId_() {
  const token = getChatworkToken_();
  const response = UrlFetchApp.fetch(`${CHATWORK_API_BASE}/me`, {
    headers: { 'X-ChatWorkToken': token },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() === 200) {
    return JSON.parse(response.getContentText()).account_id;
  }
  return null;
}

// ============================================================
// Gemini API
// ============================================================

function callGemini_(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');

  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
    }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`Gemini APIエラー (${response.getResponseCode()}): ${response.getContentText()}`);
  }

  const result = JSON.parse(response.getContentText());
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (!text.trim()) throw new Error('Geminiから空の応答');

  // マークダウン記号の除去
  return text.replace(/^#{1,6}\s*/gm, '').trim();
}

// ============================================================
// ユーティリティ
// ============================================================

function getChatworkToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('CHATWORK_API_TOKEN');
  if (!token) throw new Error('CHATWORK_API_TOKEN が設定されていません');
  return token;
}

/**
 * 設定シートから対象ルーム一覧を取得
 */
function getTargetRooms_() {
  const ssId = PropertiesService.getScriptProperties().getProperty('COLLECTOR_SPREADSHEET_ID');
  if (!ssId) throw new Error('COLLECTOR_SPREADSHEET_ID が設定されていません');

  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName('設定');
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  return data
    .filter(row => row[0] && String(row[2]).toUpperCase() === 'TRUE')
    .map(row => ({ roomId: String(row[0]).trim(), roomName: row[1] || '' }));
}

function writeLog_(message) {
  console.log(`[AI Bot] ${message}`);
}

// ============================================================
// セットアップ
// ============================================================

/**
 * 毎週日曜21:00に weeklyAutoRun を実行するトリガーを設定
 */
function setupWeeklyTrigger() {
  // 既存トリガーを削除
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'weeklyAutoRun') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('weeklyAutoRun')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(21)
    .create();

  writeLog_('週次トリガー設定完了: 毎週日曜21:00');
}

/**
 * テスト実行: 指定ルームの週次サマリーを生成してChatworkに投稿
 */
function testWeeklySummary() {
  const rooms = getTargetRooms_();
  if (rooms.length === 0) {
    writeLog_('テスト対象のルームがありません。設定シートを確認してください。');
    return;
  }

  const room = rooms[0];
  writeLog_(`テスト実行: ${room.roomName || room.roomId}`);

  const result = generateSummary_(room.roomId, 'weekly', '1week');
  const chatworkMsg = `[info][title]【テスト】週次サマリー ${room.roomName}[/title]${result}[/info]`;
  postToChatwork_(room.roomId, chatworkMsg);

  writeLog_('テスト投稿完了');
}
