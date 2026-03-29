const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081';

export async function getFacilities() {
  const res = await fetch(`${API_BASE}/api/facilities`);
  if (!res.ok) throw new Error('施設一覧の取得に失敗しました');
  const data = await res.json();
  return data.facilities || [];
}

export async function getPatients(facilityId?: string) {
  const url = facilityId
    ? `${API_BASE}/api/patients?facilityId=${encodeURIComponent(facilityId)}`
    : `${API_BASE}/api/patients`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('患者一覧の取得に失敗しました');
  const data = await res.json();
  return data.patients || [];
}

export async function getSupplementQuestions() {
  const res = await fetch(`${API_BASE}/api/carelife/supplement-questions`);
  if (!res.ok) throw new Error('質問一覧の取得に失敗しました');
  const data = await res.json();
  return data.questions || [];
}

export async function createEncounter(body: {
  patientLastName?: string;
  patientFirstName?: string;
  facilityId?: string;
  recordedByName?: string;
  hospitalName?: string;
  department?: string;
  doctorName?: string;
}) {
  const res = await fetch(`${API_BASE}/api/encounters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  const errMsg = (data as { error?: string }).error || '記録の開始に失敗しました';
  if (!res.ok) {
    if (/patientId.*required/i.test(errMsg)) {
      throw new Error('接続先のAPIが通院報告用ではありません。carelife のバックエンド（このフォルダ内の backend）を起動し、MOCK_MODE=1 で実行してください。');
    }
    throw new Error(errMsg);
  }
  return data;
}

export async function signUpload(body: {
  recordingId?: string;
  seq?: number;
  contentType?: string;
  patientId?: string;
  facilityId?: string;
  recordedByName?: string;
  encounterId?: string;
}) {
  const res = await fetch(`${API_BASE}/api/recordings/sign-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('アップロード準備に失敗しました');
  return res.json();
}

export async function finalizeRecording(
  recordingId: string,
  body: {
    supplementAnswers?: Record<string, string>;
    encounterId?: string;
    patientId?: string;
    patientName?: string;
    patientLastName?: string;
    patientFirstName?: string;
    recordedByName?: string;
    hospitalName?: string;
    department?: string;
    doctorName?: string;
  },
  audioBlob?: Blob | null
) {
  if (audioBlob && audioBlob.size > 0) {
    const form = new FormData();
    form.append('audio', audioBlob, 'recording.webm');
    form.append('supplementAnswers', JSON.stringify(body.supplementAnswers || {}));
    if (body.encounterId) form.append('encounterId', body.encounterId);
    if (body.patientId) form.append('patientId', body.patientId);
    if (body.patientName) form.append('patientName', body.patientName);
    if (body.patientLastName) form.append('patientLastName', body.patientLastName);
    if (body.patientFirstName) form.append('patientFirstName', body.patientFirstName);
    if (body.recordedByName) form.append('recordedByName', body.recordedByName);
    if (body.hospitalName) form.append('hospitalName', body.hospitalName);
    if (body.department) form.append('department', body.department);
    if (body.doctorName) form.append('doctorName', body.doctorName);
    const res = await fetch(`${API_BASE}/api/recordings/${recordingId}/finalize`, {
      method: 'POST',
      body: form
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || '報告の生成に失敗しました');
    return data as { ok: boolean; reportText?: string; transcript?: string; encounterId?: string };
  }
  const res = await fetch(`${API_BASE}/api/recordings/${recordingId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || '報告の生成に失敗しました');
  return data as { ok: boolean; reportText?: string; transcript?: string; encounterId?: string };
}

// ============================================================
// チャットワーク記録 → AI要約 API
// ============================================================

export interface ChatworkRoom {
  room_id: string;
  room_name: string;
  patient_name: string;
  patient_type: string;
}

export interface ChatworkSummaryResult {
  ok: boolean;
  summary: string;
  message_count: number;
  noise_removed: number;
  period: { start: string; end: string };
}

export interface RiskAlert {
  level: string;
  category?: string;
  summary: string;
  detail?: string;
  recommended_action?: string;
}

/** 蓄積済みルーム一覧を取得 */
export async function getChatworkRooms(): Promise<ChatworkRoom[]> {
  const res = await fetch(`${API_BASE}/api/chatwork/rooms`);
  if (!res.ok) throw new Error('ルーム一覧の取得に失敗しました');
  const data = await res.json();
  return data.rooms || [];
}

/** room_id からルーム情報を取得（Chatwork API経由） */
export async function getChatworkRoomInfo(roomId: string): Promise<ChatworkRoom> {
  const res = await fetch(`${API_BASE}/api/chatwork/room-info?room_id=${encodeURIComponent(roomId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'ルーム情報の取得に失敗しました');
  return data as ChatworkRoom;
}

/** 要約結果をChatworkルームに送信 */
export async function sendSummaryToChatwork(roomId: string, summaryText: string, summaryType: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/api/chatwork/send-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId, summary_text: summaryText, summary_type: summaryType })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Chatworkへの送信に失敗しました');
  return data as { ok: boolean; message?: string };
}

/** チャットワーク記録からAI要約を生成 */
export async function generateChatworkSummary(params: {
  room_id: string;
  period?: string;
  start_date?: string;
  end_date?: string;
  summary_type?: string;
  patient_name?: string;
  additional_context?: string;
}): Promise<ChatworkSummaryResult> {
  const res = await fetch(`${API_BASE}/api/chatwork/summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || '要約の生成に失敗しました');
  return data as ChatworkSummaryResult;
}

/** リスク・異常検知 */
export async function detectChatworkRisks(roomId: string): Promise<RiskAlert[]> {
  const res = await fetch(`${API_BASE}/api/chatwork/detect-risks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'リスク検知に失敗しました');
  return (data as { alerts: RiskAlert[] }).alerts || [];
}

/** 報告文を送信する。userId があれば LINE へ、chatwork_room_id があれば Chatwork へ。両方あれば両方へ。 */
export async function sendReport(
  reportText: string,
  options: { userId?: string | null; chatwork_room_id?: string | null }
) {
  const { userId, chatwork_room_id } = options;
  const url = `${API_BASE}/api/carelife/send-to-line`;
  const body: { reportText: string; userId?: string; chatwork_room_id?: string } = { reportText };
  if (userId?.trim()) body.userId = userId.trim();
  if (chatwork_room_id?.trim()) body.chatwork_room_id = chatwork_room_id.trim();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || '送信に失敗しました');
  }
  return data as { ok: boolean; message?: string };
}
