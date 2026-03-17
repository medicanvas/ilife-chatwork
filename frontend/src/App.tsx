import React, { useState, useEffect, useRef } from 'react';
import {
  getSupplementQuestions,
  createEncounter,
  signUpload,
  finalizeRecording,
  sendReport
} from './api';

const DRAFT_KEY = 'carelife_draft';

/** ステップ表示用: 画面 → ステップ番号（1始まり）とラベル */
const STEP_INFO: { screen: Screen; step: number; label: string }[] = [
  { screen: 'SC-01', step: 1, label: '患者・担当者' },
  { screen: 'SC-02', step: 2, label: '受診先' },
  { screen: 'SC-04', step: 3, label: '録音準備' },
  { screen: 'SC-05', step: 4, label: '録音' },
  { screen: 'SC-05a', step: 4, label: '録音' },
  { screen: 'SC-08', step: 5, label: '補足入力' },
  { screen: 'SC-09', step: 6, label: '補足確認' },
  { screen: 'SC-10', step: 7, label: '報告作成中' },
  { screen: 'SC-11', step: 8, label: '報告確認・送信' },
  { screen: 'SC-12', step: 9, label: '完了' }
];
const TOTAL_STEPS = 9;
function getStepInfo(s: Screen): { step: number; label: string } | null {
  const info = STEP_INFO.find(x => x.screen === s);
  return info ? { step: info.step, label: info.label } : null;
}

type Screen =
  | 'SC-01' | 'SC-02' | 'SC-04' | 'SC-05' | 'SC-05a' | 'SC-06' | 'SC-07' | 'SC-08' | 'SC-09'
  | 'SC-10' | 'SC-11' | 'SC-12' | 'SC-ERR';

interface Question {
  id: string;
  text: string;
  required?: boolean;
}

interface Draft {
  screen: Screen;
  patientLastName: string;
  patientFirstName: string;
  staffName: string;
  hospitalName: string;
  department: string;
  doctorName: string;
  recordingId: string | null;
  encounterId: string | null;
  patientId: string | null;
  supplementAnswers: Record<string, string>;
  reportText: string;
  transcript: string;
  savedAt: string;
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d.screen || !d.savedAt) return null;
    return d;
  } catch {
    return null;
  }
}

function saveDraft(d: Partial<Draft> & { screen: Screen }) {
  try {
    const payload: Draft = {
      screen: d.screen,
      patientLastName: d.patientLastName ?? '',
      patientFirstName: d.patientFirstName ?? '',
      staffName: d.staffName ?? '',
      hospitalName: d.hospitalName ?? '',
      department: d.department ?? '',
      doctorName: d.doctorName ?? '',
      recordingId: d.recordingId ?? null,
      encounterId: d.encounterId ?? null,
      patientId: d.patientId ?? null,
      supplementAnswers: d.supplementAnswers ?? {},
      reportText: d.reportText ?? '',
      transcript: 'transcript' in d ? (d as Draft).transcript : '',
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (_) {}
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('SC-01');
  const [patientLastName, setPatientLastName] = useState('');
  const [patientFirstName, setPatientFirstName] = useState('');
  const [staffName, setStaffName] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [department, setDepartment] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [supplementAnswers, setSupplementAnswers] = useState<Record<string, string>>({});
  const [reportText, setReportText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [supplementPage, setSupplementPage] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [chatworkRoomId, setChatworkRoomId] = useState<string | null>(null);
  const [lastSendMessage, setLastSendMessage] = useState<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const reportTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const QUESTIONS_PER_PAGE = 2;

  useEffect(() => {
    getSupplementQuestions().then(setQuestions).catch(() => setQuestions([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('userId');
    const cwRoom = params.get('chatwork_room_id');
    if (uid) setLineUserId(uid);
    if (cwRoom) setChatworkRoomId(cwRoom);
  }, []);

  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.screen !== 'SC-01') {
      setShowResumePrompt(true);
    }
  }, []);

  useEffect(() => {
    if (recordingStartTime === null) return;
    const t = setInterval(() => setRecordingElapsed(Math.floor((Date.now() - recordingStartTime) / 1000)), 1000);
    return () => clearInterval(t);
  }, [recordingStartTime]);

  // 報告テキストエリアを文章量に応じて高さ自動調整
  useEffect(() => {
    const ta = reportTextareaRef.current;
    if (!ta || screen !== 'SC-11') return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(280, Math.min(ta.scrollHeight, 800))}px`;
  }, [reportText, screen]);

  const goTo = (s: Screen, clearError = true) => {
    if (clearError) setErrorMessage('');
    setScreen(s);
  };

  const patientName = [patientLastName, patientFirstName].filter(Boolean).join(' ') || '';

  const handleStart = () => {
    if (!patientLastName.trim() || !patientFirstName.trim()) return;
    goTo('SC-02');
  };

  const handleConfirmHospital = () => goTo('SC-04');

  const handleRecordStart = async () => {
    setLoading(true);
    setRecordedBlob(null);
    recordedChunksRef.current = [];
    try {
      const enc = await createEncounter({
        patientLastName: patientLastName.trim(),
        patientFirstName: patientFirstName.trim(),
        recordedByName: staffName.trim() || '担当者',
        hospitalName: hospitalName.trim() || undefined,
        department: department.trim() || undefined,
        doctorName: doctorName.trim() || undefined
      });
      setEncounterId(enc.encounterId);
      setPatientId(enc.patientId || null);
      const sign = await signUpload({
        patientId: enc.patientId,
        recordedByName: staffName.trim() || '担当者',
        encounterId: enc.encounterId
      });
      setRecordingId(sign.recordingId);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mime.split(';')[0] });
        setRecordedBlob(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      mr.start(1000);
      setRecordingStartTime(Date.now());
      goTo('SC-05');
      saveDraft({ screen: 'SC-05', patientLastName, patientFirstName, staffName, hospitalName, department, doctorName, recordingId: sign.recordingId, encounterId: enc.encounterId, patientId: enc.patientId, supplementAnswers });
    } catch (e: any) {
      const msg = e?.message || 'エラー';
      const isConnectionError = /failed to fetch|shutdown|network|接続|refused/i.test(msg);
      setErrorMessage(isConnectionError ? 'サーバーに接続できません。バックエンドが起動しているか確認してください。' : msg);
      goTo('SC-ERR', false);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordStopClick = () => goTo('SC-05a');
  const handleRecordEndConfirm = (yes: boolean) => {
    if (yes) {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== 'inactive') {
        mr.stop();
      }
      setRecordingStartTime(null);
      setSupplementPage(0);
      goTo('SC-08');
      saveDraft({ screen: 'SC-08', patientLastName, patientFirstName, staffName, hospitalName, department, doctorName, recordingId, encounterId, patientId, supplementAnswers });
    } else {
      goTo('SC-05');
    }
  };

  const handleSupplementBack = () => {
    goTo('SC-05a');
    saveDraft({ screen: 'SC-05a', patientLastName, patientFirstName, staffName, hospitalName, department, doctorName, recordingId, encounterId, patientId, supplementAnswers });
  };
  const handleSupplementPageNext = () => {
    const totalPages = Math.ceil(questions.length / QUESTIONS_PER_PAGE) || 1;
    if (supplementPage < totalPages - 1) {
      setSupplementPage(p => p + 1);
    } else {
      goTo('SC-09');
      saveDraft({ screen: 'SC-09', patientLastName, patientFirstName, staffName, hospitalName, department, doctorName, recordingId, encounterId, patientId, supplementAnswers });
    }
  };

  const handleReportCreate = async () => {
    goTo('SC-10');
    setLoading(true);
    try {
      const res = await finalizeRecording(
        recordingId!,
        {
          supplementAnswers,
          encounterId: encounterId!,
          patientId: patientId || undefined,
          patientName: patientName || undefined,
          patientLastName: patientLastName.trim() || undefined,
          patientFirstName: patientFirstName.trim() || undefined,
          recordedByName: staffName.trim() || '担当者',
          hospitalName: hospitalName.trim() || undefined,
          department: department.trim() || undefined,
          doctorName: doctorName.trim() || undefined
        },
        recordedBlob || undefined
      );
      setTranscript(res.transcript || '');
      setReportText(res.reportText || '');
      goTo('SC-11');
      saveDraft({
        screen: 'SC-11',
        patientLastName,
        patientFirstName,
        staffName,
        hospitalName,
        department,
        doctorName,
        recordingId,
        encounterId,
        patientId,
        supplementAnswers,
        reportText: res.reportText || '',
        transcript: res.transcript || ''
      });
    } catch (e: any) {
      const msg = e?.message || '報告の生成に失敗しました';
      const isConnectionError = /failed to fetch|shutdown|network|接続|refused/i.test(msg);
      setErrorMessage(isConnectionError ? 'サーバーに接続できません。バックエンドが起動しているか確認してください。' : msg);
      goTo('SC-ERR', false);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!lineUserId?.trim() && !chatworkRoomId?.trim()) {
      setErrorMessage('送信先が特定できません。LINEの「報告」から返ってきたリンク、または Chatwork のリンクから開いてください。');
      goTo('SC-ERR', false);
      return;
    }
    setLoading(true);
    try {
      const res = await sendReport(reportText, {
        userId: lineUserId?.trim() || undefined,
        chatwork_room_id: chatworkRoomId?.trim() || undefined
      });
      setLastSendMessage(res.message || '送信しました。');
      clearDraft();
      goTo('SC-12');
    } catch (e: any) {
      setErrorMessage(e?.message || '送信に失敗しました');
      goTo('SC-ERR', false);
    } finally {
      setLoading(false);
    }
  };

  const handleEnd = () => {
    window.close();
  };

  const handleResume = () => {
    const draft = loadDraft();
    if (!draft) return;
    setPatientLastName(draft.patientLastName);
    setPatientFirstName(draft.patientFirstName);
    setStaffName(draft.staffName);
    setHospitalName(draft.hospitalName ?? '');
    setDepartment(draft.department ?? '');
    setDoctorName(draft.doctorName ?? '');
    setRecordingId(draft.recordingId);
    setEncounterId(draft.encounterId);
    setPatientId(draft.patientId);
    setSupplementAnswers(draft.supplementAnswers);
    setReportText(draft.reportText);
    setTranscript((draft as Draft).transcript ?? '');
    setSupplementPage(0);
    setScreen(draft.screen === 'SC-07' || draft.screen === 'SC-06' ? 'SC-08' : draft.screen);
    setShowResumePrompt(false);
  };

  const handleStartFresh = () => {
    clearDraft();
    setShowResumePrompt(false);
    setScreen('SC-01');
    setPatientLastName('');
    setPatientFirstName('');
    setStaffName('');
    setHospitalName('');
    setDepartment('');
    setDoctorName('');
    setRecordingId(null);
    setEncounterId(null);
    setPatientId(null);
    setSupplementAnswers({});
    setReportText('');
    setTranscript('');
    setRecordedBlob(null);
  };

  const updateAnswer = (id: string, value: string) => {
    setSupplementAnswers(a => ({ ...a, [id]: value }));
  };

  const stepInfo = getStepInfo(screen);
  const StepIndicator = () =>
    stepInfo ? (
      <div className="step-indicator" role="status" aria-label={`ステップ ${stepInfo.step} の ${stepInfo.label}`}>
        <span className="step-indicator-text">ステップ {stepInfo.step} / {TOTAL_STEPS}</span>
        <span className="step-indicator-label">{stepInfo.label}</span>
      </div>
    ) : null;

  // 再開確認
  if (showResumePrompt) {
    return (
      <div className="screen">
        <h1>前回の入力があります</h1>
        <p>続きから再開しますか？</p>
        <button className="btn btn-primary" onClick={handleResume}>再開する</button>
        <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={handleStartFresh}>最初から始める</button>
      </div>
    );
  }

  // SC-01 起動・入力（姓・名・担当者）
  if (screen === 'SC-01') {
    return (
      <div className="screen">
        <StepIndicator />
        <h1>通院報告を作成します</h1>
        <p>患者さんの姓・名と担当者名を入力してください</p>
        <div className="input-wrap">
          <label>患者さんの姓</label>
          <input
            type="text"
            placeholder="例：山田"
            value={patientLastName}
            onChange={e => setPatientLastName(e.target.value)}
          />
        </div>
        <div className="input-wrap">
          <label>患者さんの名</label>
          <input
            type="text"
            placeholder="例：太郎"
            value={patientFirstName}
            onChange={e => setPatientFirstName(e.target.value)}
          />
        </div>
        <div className="input-wrap">
          <label>担当者名</label>
          <input
            type="text"
            placeholder="例：佐藤 花子"
            value={staffName}
            onChange={e => setStaffName(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={handleStart}
          disabled={!patientLastName.trim() || !patientFirstName.trim() || loading}
        >
          次へ
        </button>
      </div>
    );
  }

  // SC-02 受診先・診療科・医師名
  if (screen === 'SC-02') {
    return (
      <div className="screen">
        <StepIndicator />
        <h1>受診先の情報</h1>
        <p>病院名・診療科・医師の名前を入力してください（報告書に反映されます）</p>
        <div className="input-wrap">
          <label>病院名</label>
          <input
            type="text"
            placeholder="例：〇〇病院"
            value={hospitalName}
            onChange={e => setHospitalName(e.target.value)}
          />
        </div>
        <div className="input-wrap">
          <label>診療科</label>
          <input
            type="text"
            placeholder="例：精神科、内科"
            value={department}
            onChange={e => setDepartment(e.target.value)}
          />
        </div>
        <div className="input-wrap">
          <label>医師の名前</label>
          <input
            type="text"
            placeholder="例：山田 医師"
            value={doctorName}
            onChange={e => setDoctorName(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={handleConfirmHospital}>
          録音の準備へ
        </button>
      </div>
    );
  }

  // SC-04 録音開始
  if (screen === 'SC-04') {
    return (
      <div className="screen">
        <StepIndicator />
        <h1>録音の準備</h1>
        <p>準備ができたら録音を始めてください。診察の内容やご様子をそのまま話してください。</p>
        <button className="btn btn-primary" onClick={handleRecordStart} disabled={loading}>
          {loading ? '準備中...' : '録音を始める'}
        </button>
      </div>
    );
  }

  // SC-05 録音中
  if (screen === 'SC-05') {
    return (
      <div className="screen">
        <StepIndicator />
        <h1>録音中</h1>
        <p style={{ fontSize: 32, fontWeight: 'bold', color: '#2563eb' }}>{recordingElapsed} 秒</p>
        <p>診察内容や様子を話してください</p>
        <button className="btn btn-danger" onClick={handleRecordStopClick}>
          録音を終える
        </button>
      </div>
    );
  }

  // SC-05a 録音終了確認
  if (screen === 'SC-05a') {
    return (
      <div className="screen">
        <StepIndicator />
        <h1>録音を終了しますか？</h1>
        <p>よろしければ「はい、終了する」を押してください。</p>
        <button className="btn btn-primary" onClick={() => handleRecordEndConfirm(true)}>はい、終了する</button>
        <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => handleRecordEndConfirm(false)}>いいえ、続ける</button>
      </div>
    );
  }

  // SC-08 補足入力（ページ分割・スクロールなしで収まるように）
  if (screen === 'SC-08') {
    const totalPages = Math.ceil(questions.length / QUESTIONS_PER_PAGE) || 1;
    const start = supplementPage * QUESTIONS_PER_PAGE;
    const pageQuestions = questions.slice(start, start + QUESTIONS_PER_PAGE);
    const isLastPage = supplementPage >= totalPages - 1;

    return (
      <div className="screen screen-compact">
        <StepIndicator />
        <h1 className="screen-compact-title">補足（あれば入力）</h1>
        <p className="screen-compact-desc">該当するものだけ入力してください。なくても大丈夫です。</p>
        <div className="supplement-page">
          {pageQuestions.map(q => (
            <div key={q.id} className="input-wrap">
              <label>{q.text}</label>
              <input
                type="text"
                placeholder="なしの場合は空欄でOK"
                value={supplementAnswers[q.id] ?? ''}
                onChange={e => updateAnswer(q.id, e.target.value)}
              />
            </div>
          ))}
        </div>
        <p className="supplement-pagination">{supplementPage + 1} / {totalPages}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
          <button className="btn btn-primary" onClick={handleSupplementPageNext}>
            {isLastPage ? '確認へ' : '次へ'}
          </button>
          <button className="btn btn-secondary" onClick={handleSupplementBack}>
            戻る
          </button>
        </div>
      </div>
    );
  }

  // SC-09 補足確認
  if (screen === 'SC-09') {
    return (
      <div className="screen">
        <StepIndicator />
        <h1>補足内容の確認</h1>
        <div style={{ width: '100%', maxWidth: 360, textAlign: 'left', marginBottom: 24 }}>
          {questions.map(q => (
            <div key={q.id} style={{ marginBottom: 12 }}>
              <strong>{q.text}</strong>
              <div style={{ color: '#64748b' }}>{supplementAnswers[q.id] || '（未入力）'}</div>
            </div>
          ))}
        </div>
        <button className="btn btn-primary" onClick={handleReportCreate} disabled={loading}>
          {loading ? '報告を作成しています...' : '報告を作成する'}
        </button>
      </div>
    );
  }

  // SC-10 処理中
  if (screen === 'SC-10') {
    return (
      <div className="screen">
        <StepIndicator />
        <h1>報告を作成しています</h1>
        <p>そのままでお待ちください</p>
        <div style={{ width: 48, height: 48, border: '4px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  // SC-11 報告確認・編集（文字起こし＋要約）→ 送信する
  if (screen === 'SC-11') {
    return (
      <div className="screen screen-report-confirm" style={{ justifyContent: 'flex-start', paddingTop: 24 }}>
        <StepIndicator />
        <h1>報告の確認・修正</h1>
        <p className="screen-report-confirm-desc">内容を確認し、修正が必要なら編集してください。問題なければ「送信する」を押してください。</p>
        {transcript && (
          <div className="report-section" style={{ width: '100%', maxWidth: 560, marginBottom: 16, textAlign: 'left' }}>
            <h2 className="report-section-title">文字起こし</h2>
            <div className="report-box report-box-scroll" style={{ padding: 12, minHeight: 80, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', background: '#f8fafc' }}>
              {transcript}
            </div>
          </div>
        )}
        <div className="report-section" style={{ width: '100%', maxWidth: 560, textAlign: 'left' }}>
          <h2 className="report-section-title">通院報告（要約）</h2>
          <textarea
            ref={reportTextareaRef}
            className="report-box report-textarea-auto"
            style={{ minHeight: 280, resize: 'none', fontFamily: 'inherit', width: '100%', overflow: 'hidden' }}
            value={reportText}
            onChange={e => setReportText(e.target.value)}
            aria-label="通院報告の要約文"
          />
        </div>
        <button
          className="btn btn-primary btn-send"
          style={{ marginTop: 20 }}
          onClick={handleSend}
          disabled={loading}
        >
          {loading ? '送信中…' : '送信する'}
        </button>
      </div>
    );
  }

  // SC-12 送信完了
  if (screen === 'SC-12') {
    return (
      <div className="screen">
        <StepIndicator />
        <h1>送信しました</h1>
        <p className="send-complete-message">{lastSendMessage}</p>
        <p className="screen-close-hint">「終了」を押すと画面が閉じます。閉じられない場合は、ブラウザの×ボタンで閉じてください。</p>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleEnd}>
          終了
        </button>
        <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={handleStartFresh}>
          もう一度作成する
        </button>
      </div>
    );
  }

  // SC-ERR エラー
  if (screen === 'SC-ERR') {
    return (
      <div className="screen">
        <h1>エラー</h1>
        <p className="error-msg">{errorMessage || '問題が発生しました'}</p>
        <p>もう一度お試しください。前の画面にもどってやり直してください。</p>
        <button className="btn btn-primary" onClick={handleStartFresh}>最初からやり直す</button>
      </div>
    );
  }

  return (
    <div className="screen">
      <button className="btn btn-primary" onClick={handleStartFresh}>最初へ</button>
    </div>
  );
}
