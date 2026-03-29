/**
 * Chatwork メッセージ収集 GAS スクリプト
 *
 * 概要:
 *   Chatwork API を定期実行し、メッセージをスプレッドシートに蓄積する。
 *   force=0（差分取得）をメインに、force=1（最新100件）で補完する二重取得方式。
 *
 * セットアップ手順:
 *   1. Google スプレッドシートを新規作成
 *   2. 拡張機能 → Apps Script を開く
 *   3. このファイルの内容をすべてコピー＆ペースト
 *   4. スクリプトプロパティに以下を設定:
 *      - CHATWORK_API_TOKEN: Chatwork の API トークン
 *      - ROOM_IDS: 取得対象のルームID（カンマ区切り。例: 425737026,123456789）
 *   5. 手動で setup() を1回実行（シート初期化）
 *   6. 手動で collectMessages() を1回実行して動作確認
 *   7. setupTrigger() を実行してトリガー登録（30分おき）
 *
 * シート構成:
 *   - 「メッセージ」シート: 全メッセージを蓄積
 *   - 「ログ」シート: 実行ログ
 *   - 「設定」シート: ルームID一覧（スクリプトプロパティの代わりにここから読むことも可能）
 */

// ============================================================
// 定数
// ============================================================
const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';
const SHEET_NAME_MESSAGES = 'メッセージ';
const SHEET_NAME_LOG = 'ログ';
const SHEET_NAME_SETTINGS = '設定';

// メッセージシートのヘッダー
const MSG_HEADERS = [
  'message_id',
  'room_id',
  'room_name',
  'account_id',
  'account_name',
  'body',
  'send_time',
  'send_time_str',
  'update_time',
  'collected_at'
];

// ============================================================
// メイン: メッセージ収集
// ============================================================

/**
 * メイン関数: 全対象ルームからメッセージを収集してスプレッドシートに追記
 * トリガーから定期実行される
 */
function collectMessages() {
  const token = getApiToken_();
  const roomIds = getRoomIds_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const msgSheet = ss.getSheetByName(SHEET_NAME_MESSAGES);

  if (!msgSheet) {
    throw new Error('「メッセージ」シートが見つかりません。先に setup() を実行してください。');
  }

  // 既存のメッセージIDをセットで保持（重複防止）
  const existingIds = getExistingMessageIds_(msgSheet);

  let totalNew = 0;

  for (const roomId of roomIds) {
    const roomIdStr = String(roomId).trim();
    if (!roomIdStr) continue;

    try {
      // ルーム名を取得
      const roomName = getRoomName_(token, roomIdStr);

      // 方式1: force=0（差分取得 — 前回以降の新着）
      const diffMessages = fetchMessages_(token, roomIdStr, false);

      // 方式2: force=1（最新100件 — 補完用）
      const latestMessages = fetchMessages_(token, roomIdStr, true);

      // 両方をマージして重複除去
      const allMessages = mergeMessages_(diffMessages, latestMessages);

      // 新規メッセージのみフィルタ
      const newMessages = allMessages.filter(m => !existingIds.has(String(m.message_id)));

      if (newMessages.length > 0) {
        // スプレッドシートに追記
        const rows = newMessages.map(m => formatRow_(m, roomIdStr, roomName));
        msgSheet.getRange(
          msgSheet.getLastRow() + 1,
          1,
          rows.length,
          MSG_HEADERS.length
        ).setValues(rows);

        // 既存IDセットに追加
        newMessages.forEach(m => existingIds.add(String(m.message_id)));
        totalNew += newMessages.length;
      }

      writeLog_(`ルーム ${roomIdStr} (${roomName}): ${newMessages.length}件の新規メッセージを追加`);

    } catch (e) {
      writeLog_(`[ERROR] ルーム ${roomIdStr}: ${e.message}`);
    }

    // レートリミット対策（ルーム間で1秒待機）
    Utilities.sleep(1000);
  }

  writeLog_(`--- 収集完了: 合計 ${totalNew} 件の新規メッセージ ---`);
}

// ============================================================
// Chatwork API 呼び出し
// ============================================================

/**
 * メッセージ取得
 * @param {string} token - API トークン
 * @param {string} roomId - ルームID
 * @param {boolean} force - true=最新100件, false=差分のみ
 * @returns {Array} メッセージ配列
 */
function fetchMessages_(token, roomId, force) {
  const url = `${CHATWORK_API_BASE}/rooms/${roomId}/messages?force=${force ? 1 : 0}`;

  const options = {
    method: 'get',
    headers: { 'X-ChatWorkToken': token },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();

  if (code === 204) {
    // 新着なし
    return [];
  }

  if (code !== 200) {
    throw new Error(`API エラー (${code}): ${response.getContentText()}`);
  }

  return JSON.parse(response.getContentText());
}

/**
 * ルーム名を取得
 */
function getRoomName_(token, roomId) {
  const url = `${CHATWORK_API_BASE}/rooms/${roomId}`;
  const options = {
    method: 'get',
    headers: { 'X-ChatWorkToken': token },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() === 200) {
    return JSON.parse(response.getContentText()).name;
  }
  return '(不明)';
}

// ============================================================
// データ整形・重複処理
// ============================================================

/**
 * 2つのメッセージ配列をマージして重複除去
 */
function mergeMessages_(arr1, arr2) {
  const map = new Map();
  for (const m of [...arr1, ...arr2]) {
    map.set(String(m.message_id), m);
  }
  return Array.from(map.values());
}

/**
 * 既存メッセージIDのセットを取得
 */
function getExistingMessageIds_(sheet) {
  const ids = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return ids; // ヘッダーのみ

  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  data.forEach(row => {
    if (row[0]) ids.add(String(row[0]));
  });
  return ids;
}

/**
 * メッセージをスプレッドシートの行に整形
 */
function formatRow_(msg, roomId, roomName) {
  const sendTime = new Date(msg.send_time * 1000);
  const updateTime = msg.update_time ? new Date(msg.update_time * 1000) : '';
  const now = new Date();

  return [
    String(msg.message_id),
    roomId,
    roomName,
    String(msg.account.account_id),
    msg.account.name,
    msg.body,
    sendTime,
    Utilities.formatDate(sendTime, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
    updateTime,
    Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')
  ];
}

// ============================================================
// セットアップ
// ============================================================

/**
 * 初回セットアップ: シートを作成してヘッダーを設定
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // メッセージシート
  let msgSheet = ss.getSheetByName(SHEET_NAME_MESSAGES);
  if (!msgSheet) {
    msgSheet = ss.insertSheet(SHEET_NAME_MESSAGES);
  }
  if (msgSheet.getLastRow() === 0 || msgSheet.getRange('A1').getValue() !== MSG_HEADERS[0]) {
    msgSheet.getRange(1, 1, 1, MSG_HEADERS.length).setValues([MSG_HEADERS]);
    msgSheet.getRange(1, 1, 1, MSG_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#4285f4')
      .setFontColor('#ffffff');
    // 列幅調整
    msgSheet.setColumnWidth(1, 120);  // message_id
    msgSheet.setColumnWidth(2, 100);  // room_id
    msgSheet.setColumnWidth(3, 150);  // room_name
    msgSheet.setColumnWidth(4, 100);  // account_id
    msgSheet.setColumnWidth(5, 120);  // account_name
    msgSheet.setColumnWidth(6, 400);  // body
    msgSheet.setColumnWidth(7, 150);  // send_time
    msgSheet.setColumnWidth(8, 150);  // send_time_str
    msgSheet.setColumnWidth(9, 150);  // update_time
    msgSheet.setColumnWidth(10, 150); // collected_at
    // フィルタ設定
    msgSheet.getRange(1, 1, 1, MSG_HEADERS.length).createFilter();
  }

  // ログシート
  let logSheet = ss.getSheetByName(SHEET_NAME_LOG);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_NAME_LOG);
    logSheet.getRange(1, 1, 1, 2).setValues([['日時', 'メッセージ']]);
    logSheet.getRange(1, 1, 1, 2)
      .setFontWeight('bold')
      .setBackground('#34a853')
      .setFontColor('#ffffff');
    logSheet.setColumnWidth(1, 180);
    logSheet.setColumnWidth(2, 600);
  }

  // 設定シート
  let settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_NAME_SETTINGS);
    settingsSheet.getRange(1, 1, 1, 3).setValues([['room_id', 'room_name', 'active']]);
    settingsSheet.getRange(1, 1, 1, 3)
      .setFontWeight('bold')
      .setBackground('#fbbc05')
      .setFontColor('#000000');
    // サンプル行
    settingsSheet.getRange(2, 1, 1, 3).setValues([['425737026', '（ルーム名を入力）', 'TRUE']]);
    settingsSheet.setColumnWidth(1, 150);
    settingsSheet.setColumnWidth(2, 250);
    settingsSheet.setColumnWidth(3, 80);
  }

  writeLog_('セットアップ完了');
  SpreadsheetApp.getUi().alert('セットアップが完了しました。\n\nスクリプトプロパティに以下を設定してください:\n- CHATWORK_API_TOKEN\n- ROOM_IDS（カンマ区切り）\n\nまたは「設定」シートにルームIDを記入してください。');
}

/**
 * トリガー登録（30分おき）
 */
function setupTrigger() {
  // 既存トリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'collectMessages') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // 30分おきのトリガーを作成
  ScriptApp.newTrigger('collectMessages')
    .timeBased()
    .everyMinutes(30)
    .create();

  writeLog_('トリガー設定完了: 30分おきに collectMessages を実行');
  SpreadsheetApp.getUi().alert('トリガーを設定しました（30分おき）');
}

/**
 * トリガー削除
 */
function removeTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'collectMessages') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  writeLog_(`トリガー削除: ${removed}件`);
  SpreadsheetApp.getUi().alert(`${removed}件のトリガーを削除しました`);
}

// ============================================================
// ユーティリティ
// ============================================================

/**
 * APIトークンを取得（スクリプトプロパティから）
 */
function getApiToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('CHATWORK_API_TOKEN');
  if (!token) {
    throw new Error('CHATWORK_API_TOKEN がスクリプトプロパティに設定されていません');
  }
  return token;
}

/**
 * 対象ルームIDリストを取得
 * 優先順位: 設定シート → スクリプトプロパティ
 */
function getRoomIds_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName(SHEET_NAME_SETTINGS);

  // 設定シートから読む
  if (settingsSheet && settingsSheet.getLastRow() > 1) {
    const data = settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 3).getValues();
    const ids = data
      .filter(row => row[0] && String(row[2]).toUpperCase() === 'TRUE')
      .map(row => String(row[0]).trim());
    if (ids.length > 0) return ids;
  }

  // スクリプトプロパティから読む
  const roomIdsProp = PropertiesService.getScriptProperties().getProperty('ROOM_IDS');
  if (roomIdsProp) {
    return roomIdsProp.split(',').map(id => id.trim()).filter(id => id);
  }

  throw new Error('取得対象のルームIDが設定されていません。設定シートまたはスクリプトプロパティを確認してください。');
}

/**
 * ログシートに書き込み
 */
function writeLog_(message) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName(SHEET_NAME_LOG);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_NAME_LOG);
    logSheet.getRange(1, 1, 1, 2).setValues([['日時', 'メッセージ']]);
  }

  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  logSheet.appendRow([now, message]);
  Logger.log(`[${now}] ${message}`);
}

// ============================================================
// テスト・デバッグ用
// ============================================================

/**
 * 接続テスト: APIトークンの有効性とルーム情報を確認
 */
function testConnection() {
  const token = getApiToken_();
  const roomIds = getRoomIds_();

  let report = '=== 接続テスト結果 ===\n\n';

  // 自分の情報
  const meUrl = `${CHATWORK_API_BASE}/me`;
  const meRes = UrlFetchApp.fetch(meUrl, {
    headers: { 'X-ChatWorkToken': token },
    muteHttpExceptions: true
  });

  if (meRes.getResponseCode() === 200) {
    const me = JSON.parse(meRes.getContentText());
    report += `✅ APIトークン有効\n   アカウント: ${me.name} (ID: ${me.account_id})\n\n`;
  } else {
    report += `❌ APIトークン無効 (${meRes.getResponseCode()})\n\n`;
    SpreadsheetApp.getUi().alert(report);
    return;
  }

  // 各ルームの情報
  for (const roomId of roomIds) {
    const roomName = getRoomName_(token, roomId.trim());
    const messages = fetchMessages_(token, roomId.trim(), true);
    report += `✅ ルーム ${roomId}: ${roomName} — ${messages.length}件のメッセージ取得可能\n`;
  }

  report += '\n=== テスト完了 ===';
  writeLog_(report);
  SpreadsheetApp.getUi().alert(report);
}

/**
 * スプレッドシートを開いたときにカスタムメニューを追加
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🤖 Chatwork収集')
    .addItem('▶ 今すぐ収集', 'collectMessages')
    .addItem('🔗 接続テスト', 'testConnection')
    .addSeparator()
    .addItem('⚙ セットアップ', 'setup')
    .addItem('⏰ トリガー登録（30分おき）', 'setupTrigger')
    .addItem('🛑 トリガー削除', 'removeTrigger')
    .addToUi();
}
