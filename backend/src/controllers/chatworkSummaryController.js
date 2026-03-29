/**
 * チャットワーク記録 要約コントローラー
 *
 * スプレッドシート（またはテストデータ）からメッセージを取得し、
 * Gemini で要約を生成する。
 */

const testData = require('../data/testMessages');

// --- Gemini 要約生成 ---

/**
 * 通院報告書を生成する
 */
exports.generateSummary = async (req, res) => {
  try {
    const {
      room_id,
      period = '1month',
      start_date,
      end_date,
      summary_type = 'visit_report',
      patient_name,
      additional_context
    } = req.body;

    if (!room_id) {
      return res.status(400).json({ error: 'room_id は必須です' });
    }

    // メッセージ取得（MVP: テストデータから。本番: Sheets API）
    let messages = getMessages(room_id, period, start_date, end_date);

    if (messages.length === 0) {
      return res.status(404).json({
        error: '指定期間のメッセージが見つかりません。GAS蓄積が開始されているか確認してください。'
      });
    }

    // ノイズ除去（MVP: 簡易フィルタ。本番: LLMベース分類）
    const filteredMessages = filterNoise(messages);

    // メッセージをテキストに整形
    const messagesText = formatMessagesForPrompt(filteredMessages);

    // 要約タイプに応じたプロンプトを選択
    const prompt = buildPrompt(summary_type, {
      messages: messagesText,
      patient_name: patient_name || getPatientName(room_id),
      start_date: start_date || getDefaultStartDate(period),
      end_date: end_date || formatDate(new Date()),
      today: formatDate(new Date()),
      additional_context
    });

    // Gemini で要約生成
    const summaryText = await callGemini(prompt);

    res.json({
      ok: true,
      summary: summaryText,
      message_count: filteredMessages.length,
      noise_removed: messages.length - filteredMessages.length,
      period: {
        start: start_date || getDefaultStartDate(period),
        end: end_date || formatDate(new Date())
      }
    });

  } catch (e) {
    console.error('[ChatworkSummary] Error:', e);
    res.status(500).json({ error: e.message || '要約の生成に失敗しました' });
  }
};

/**
 * 蓄積済みルーム一覧を取得
 */
exports.listRooms = async (req, res) => {
  try {
    // MVP: テストデータから
    const rooms = testData.getAllTestRooms();
    res.json({ ok: true, rooms });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

/**
 * メッセージ一覧を取得（期間指定・ルーム指定）
 */
exports.listMessages = async (req, res) => {
  try {
    const { room_id, start_date, end_date, limit = 100 } = req.query;
    if (!room_id) {
      return res.status(400).json({ error: 'room_id は必須です' });
    }

    let messages = getMessages(room_id, null, start_date, end_date);
    messages = messages.slice(0, parseInt(limit));

    res.json({
      ok: true,
      messages,
      total: messages.length
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

/**
 * リスク・異常検知（単一メッセージまたはバッチ）
 */
exports.detectRisks = async (req, res) => {
  try {
    const { room_id, messages: inputMessages } = req.body;

    let messagesToCheck = inputMessages;
    if (!messagesToCheck && room_id) {
      messagesToCheck = getMessages(room_id, '1day');
    }

    if (!messagesToCheck || messagesToCheck.length === 0) {
      return res.json({ ok: true, alerts: [] });
    }

    const messagesText = formatMessagesForPrompt(
      Array.isArray(messagesToCheck) ? messagesToCheck : [messagesToCheck]
    );

    const prompt = buildRiskDetectionPrompt(messagesText);
    const resultText = await callGemini(prompt);

    // JSON部分を抽出
    let alerts = [];
    try {
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        alerts = parsed.alerts || [];
      }
    } catch (parseErr) {
      // JSONパース失敗時はテキストをそのまま返す
      alerts = [{ level: '🟡注意', summary: resultText }];
    }

    res.json({ ok: true, alerts });
  } catch (e) {
    console.error('[RiskDetection] Error:', e);
    res.status(500).json({ error: e.message });
  }
};

/**
 * ルーム情報を取得（Chatwork API またはテストデータ）
 */
exports.getRoomInfo = async (req, res) => {
  try {
    const { room_id } = req.query;
    if (!room_id) {
      return res.status(400).json({ error: 'room_id は必須です' });
    }

    // まずテストデータを確認
    const testRoom = testData.getAllTestRooms().find(r => r.room_id === room_id);
    if (testRoom) {
      return res.json({ ok: true, ...testRoom });
    }

    // テストデータになければ Chatwork API で取得
    const token = process.env.CHATWORK_API_TOKEN;
    if (!token) {
      return res.status(503).json({ error: 'CHATWORK_API_TOKEN が設定されていません' });
    }

    const response = await fetch(`https://api.chatwork.com/v2/rooms/${room_id}`, {
      headers: { 'X-ChatWorkToken': token }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: `Chatwork API エラー (${response.status}): ${errText}`
      });
    }

    const data = await response.json();
    const patientName = extractPatientName(data.name);

    res.json({
      ok: true,
      room_id: room_id,
      room_name: data.name,
      patient_name: patientName,
      patient_type: ''
    });
  } catch (e) {
    console.error('[getRoomInfo] Error:', e);
    res.status(500).json({ error: e.message });
  }
};

/**
 * 要約結果をChatworkルームに送信
 */
exports.sendSummary = async (req, res) => {
  try {
    const { room_id, summary_text, summary_type } = req.body;

    if (!room_id || !summary_text) {
      return res.status(400).json({ error: 'room_id と summary_text は必須です' });
    }

    const token = process.env.CHATWORK_API_TOKEN;
    if (!token) {
      return res.status(503).json({ error: 'CHATWORK_API_TOKEN が設定されていません' });
    }

    const titleMap = {
      visit_report: '通院報告書（AI生成）',
      weekly: '週次サマリー（AI生成）',
      category_assessment: '区分認定用エビデンス（AI生成）',
      risk_detection: 'リスク検知レポート（AI生成）'
    };
    const title = titleMap[summary_type] || 'AI要約';

    const body = `[info][title]${title}[/title]${summary_text}[/info]`;

    const response = await fetch(`https://api.chatwork.com/v2/rooms/${room_id}/messages`, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': token,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ body }).toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: `Chatwork 送信エラー (${response.status}): ${errText}`
      });
    }

    const result = await response.json();
    console.log('[Chatwork] 要約を送信しました message_id:', result.message_id);
    res.json({ ok: true, message: 'Chatworkに送信しました', message_id: result.message_id });
  } catch (e) {
    console.error('[sendSummary] Error:', e);
    res.status(500).json({ error: e.message });
  }
};

/**
 * ルーム名から利用者名を抽出
 * 例: "【日中・夜間】Aさん（田中）" → "田中さん"
 * 例: "田中さん 日中記録" → "田中さん"
 */
function extractPatientName(roomName) {
  if (!roomName) return '利用者';
  // パターン1: 「（名前）」形式
  const match1 = roomName.match(/（(.+?)）/);
  if (match1) return match1[1] + 'さん';
  // パターン2: 「〇〇さん」形式
  const match2 = roomName.match(/(.+?)さん/);
  if (match2) return match2[1] + 'さん';
  return roomName;
}

// ============================================================
// 内部ヘルパー
// ============================================================

/**
 * メッセージ取得（テストデータまたはSheets API）
 */
function getMessages(roomId, period, startDate, endDate) {
  // MVP: テストデータ
  let messages = testData.getTestMessagesByRoom(roomId);

  // 期間フィルタ
  if (startDate || endDate) {
    const start = startDate ? new Date(startDate).getTime() / 1000 : 0;
    const end = endDate ? new Date(endDate + 'T23:59:59+09:00').getTime() / 1000 : Infinity;
    messages = messages.filter(m => m.send_time >= start && m.send_time <= end);
  }

  return messages;
}

/**
 * 簡易ノイズ除去
 * 業務連絡・雑談をフィルタリング
 */
function filterNoise(messages) {
  const noisePatterns = [
    /シフト表/,
    /洗剤/,
    /買ってきます/,
    /お疲れ様です[！!]?$/,
    /了解です/,
    /ありがとうございます[！!]?$/,
    /連絡お願い/
  ];

  return messages.filter(m => {
    const body = m.body || '';
    // 短すぎるメッセージはノイズの可能性が高い
    if (body.length < 10) return false;
    // ノイズパターンに一致するものを除外
    return !noisePatterns.some(p => p.test(body));
  });
}

/**
 * メッセージをプロンプト用テキストに整形（出典追跡用にREFタグ付き）
 */
function formatMessagesForPrompt(messages) {
  return messages.map(m => {
    const date = new Date(m.send_time * 1000);
    const dateStr = formatDateJP(date);
    const name = m.account?.name || '不明';
    return `[REF:${m.message_id}] [${dateStr}] ${name}:\n${m.body}`;
  }).join('\n\n---\n\n');
}

/** 日本語日時フォーマット（M/DD HH:mm） */
function formatDateJP(date) {
  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

/**
 * Geminiの出力をChatwork [info] 記法に整形
 */
function formatForChatwork(summaryText, title) {
  return `[info][title]${title}[/title]${summaryText}[/info]`;
}

/**
 * ルームIDから利用者名を取得
 */
function getPatientName(roomId) {
  const rooms = testData.getAllTestRooms();
  const room = rooms.find(r => r.room_id === roomId);
  return room ? room.patient_name : '利用者';
}

/**
 * 期間指定からデフォルトの開始日を計算
 */
function getDefaultStartDate(period) {
  const now = new Date();
  switch (period) {
    case '1week': now.setDate(now.getDate() - 7); break;
    case '1month': now.setMonth(now.getMonth() - 1); break;
    case '3months': now.setMonth(now.getMonth() - 3); break;
    case '1year': now.setFullYear(now.getFullYear() - 1); break;
    default: now.setMonth(now.getMonth() - 1);
  }
  return formatDate(now);
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// ============================================================
// プロンプト生成
// ============================================================

function buildPrompt(summaryType, params) {
  switch (summaryType) {
    case 'visit_report':
      return buildVisitReportPrompt(params);
    case 'category_assessment':
      return buildCategoryAssessmentPrompt(params);
    case 'weekly':
      return buildWeeklySummaryPrompt(params);
    case 'risk_detection':
      return buildRiskDetectionPrompt(params.messages);
    default:
      return buildVisitReportPrompt(params);
  }
}

function buildVisitReportPrompt(params) {
  return `あなたは障害者グループホームの通院報告書を作成するAIアシスタントです。

以下の「チャットワーク支援記録」を読み、指定された利用者の通院報告書を作成してください。

【出力ルール】
・マークダウン記号（#、**など）は使わないでください。見出しは「■」や「【】」で区切ってください。
・医師が診察時に参照するための報告書です。簡潔かつ正確に。
・スタッフの感想・推測は除外し、客観的事実のみを記載してください。
・記録に含まれる業務連絡・雑談は無視してください。
${params.additional_context ? `・追加の注意事項: ${params.additional_context}` : ''}

【フォーマット】
■ 通院報告
利用者名：${params.patient_name}様
対象期間：${params.start_date}〜${params.end_date}
作成日：${params.today}

■ 全体の様子
（期間全体を通じた状態の概要を2〜3文で）

■ 睡眠・生活リズム
（睡眠の質、起床パターン、生活リズムの変化）

■ 食事・栄養
（食事摂取量、嚥下の状態、こだわりの変化）

■ 服薬・副作用
（服薬状況、副作用の有無、薬変更後の経過）

■ 精神面・行動面
（情緒の安定度、こだわりの変化、パニックの頻度・程度）

■ 身体面
（バイタルの変動、発作の有無、排泄状況、痛みの訴え）

■ 特記事項
（突発的な出来事、自傷・他害、緊急対応の有無）

■ 前回受診からの変化
（改善点・悪化点を明確に）

【チャットワーク支援記録】
${params.messages}`;
}

function buildCategoryAssessmentPrompt(params) {
  return `あなたは障害福祉の区分認定調査を支援するAIです。

以下のチャットワーク支援記録から、障害支援区分の認定調査に必要な情報を、認定調査80項目の5領域に沿って整理してください。

【重要な方針】
・区分を適切に維持・認定してもらうために、「支援が必要である根拠」を具体的なエピソードで示してください。
・「元気です」「問題なし」といった記載があっても、実際には支援が必要な場面がないか、記録全体から判断してください。
・数値化できるもの（発作回数、自傷回数、覚醒回数、介助時間など）は数値で示してください。

【出典ルール（最重要）】
各事実・エピソードの記載の後に、必ず以下の形式で出典を付けてください:
  └ 記録: 記録者名（日時）
  └ 「元メッセージから該当部分を引用（50文字以内に要約）」

出典が付いていない事実は記載しないでください。
記録内の [REF:xxx] タグは出典の追跡用IDです。出力には含めないでください。

利用者名：${params.patient_name}様
対象期間：${params.start_date}〜${params.end_date}

【チャットワーク支援記録】
${params.messages}`;
}

function buildWeeklySummaryPrompt(params) {
  return `あなたは障害者グループホームの管理者を支援するAIです。

以下のチャットワーク支援記録から、利用者${params.patient_name}さんの週次サマリーを作成してください。

【出力ルール】
・マークダウン記号は使わないでください。見出しは「■」で区切ってください。
・総合評価は「安定」「注意」「要介入」の3段階で。

【出典ルール（最重要）】
各事実の記載の後に、必ず以下の形式で出典を付けてください:
  └ 記録: 記録者名（日時）
  └ 「元メッセージから該当部分を引用（50文字以内に要約）」

出典が付いていない事実は記載しないでください。
時系列順に記載し、日付の流れがわかるようにしてください。
記録内の [REF:xxx] タグは出典の追跡用IDです。出力には含めないでください。
${params.additional_context ? `追加の注意事項: ${params.additional_context}` : ''}

【出力フォーマット】
【総合評価】安定 / 注意 / 要介入

■ 身体面
・事実の記載
  └ 記録: 記録者名（日時）
  └ 「引用テキスト」

■ 精神面・行動面
（同上の形式）

■ 生活面
（同上の形式）

■ 来週への申し送り
・申し送り事項

【チャットワーク支援記録（${params.start_date}〜${params.end_date}）】
${params.messages}`;
}

function buildRiskDetectionPrompt(messagesText) {
  return `あなたは障害者グループホームの安全管理AIです。

以下のチャットワーク投稿を分析し、管理者に即座に報告すべき「異常・リスク」があるかを判定してください。

【検出すべき異常カテゴリ】

赤（緊急）: 発熱38度以上、てんかん発作、嘔吐、自傷行為、他害行為、誤嚥・窒息、酸素飽和度低下、チアノーゼ、意識消失
黄（注意）: 便秘3日以上、食事摂取量の大幅減少、睡眠の著しい乱れ、こだわりの急変、服薬変更後の副作用、バイタル変動、不穏の持続
緑（記録）: ADLの変化、対人関係の変化、新行動パターン、本人の発言

【出典ルール（最重要）】
各アラートに、根拠となった元メッセージの「記録者名」「日時」「引用テキスト」を必ず含めてください。

【出力】
JSON形式で返してください。
{
  "alerts": [
    {
      "level": "赤" | "黄" | "緑",
      "category": "カテゴリ名",
      "summary": "1行要約",
      "detail": "具体的内容",
      "source_staff": "記録者名",
      "source_datetime": "日時（例: 3/28 16:45）",
      "source_quote": "元メッセージからの引用（50文字以内）",
      "recommended_action": "推奨対応"
    }
  ]
}

記録内の [REF:xxx] タグは出典の追跡用IDです。出力には含めないでください。

【チャットワーク投稿】
${messagesText}`;
}

// ============================================================
// Gemini API 呼び出し
// ============================================================

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が設定されていません');
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent(prompt);
  const text = result.response?.text?.() || '';

  if (!text.trim()) {
    throw new Error('Gemini から空の応答が返されました');
  }

  // マークダウン記号の除去
  return text.replace(/^#{1,6}\s*/gm, '').trim();
}
