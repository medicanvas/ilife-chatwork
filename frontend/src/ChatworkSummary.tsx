import React, { useState, useEffect, useRef } from 'react';
import {
  getChatworkRoomInfo,
  getChatworkRooms,
  generateChatworkSummary,
  detectChatworkRisks,
  sendSummaryToChatwork,
  type ChatworkRoom,
  type RiskAlert
} from './api';

type SummaryType = 'weekly' | 'category_assessment' | 'risk_detection';

const SUMMARY_TYPES: { value: SummaryType; label: string; description: string }[] = [
  { value: 'weekly', label: '週次サマリー', description: '記録を時系列で要約（出典付き）' },
  { value: 'risk_detection', label: 'リスク検知', description: '危険兆候を検出（出典付き）' },
  { value: 'category_assessment', label: '区分認定用', description: '認定調査のエビデンス資料（出典付き）' }
];

const PERIODS = [
  { value: '1week', label: '直近1週間' },
  { value: '1month', label: '直近1ヶ月' },
  { value: '3months', label: '直近3ヶ月' },
  { value: '1year', label: '直近1年' },
  { value: 'custom', label: 'カスタム（日付指定）' }
];

interface Props {
  chatworkRoomId?: string;
}

export default function ChatworkSummary({ chatworkRoomId }: Props) {
  // URLパラメータからroom_idを取得（propsが空ならURLからフォールバック）
  const roomId = chatworkRoomId || new URLSearchParams(window.location.search).get('chatwork_room_id') || '';

  const [roomInfo, setRoomInfo] = useState<ChatworkRoom | null>(null);
  const [roomLoading, setRoomLoading] = useState(true);
  const [roomError, setRoomError] = useState('');

  // ルーム未指定時のフォールバック: ルーム一覧から選択
  const [rooms, setRooms] = useState<ChatworkRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState('');
  const hasRoomId = !!roomId;

  const [summaryType, setSummaryType] = useState<SummaryType>('weekly');
  const [period, setPeriod] = useState('1month');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [messageCount, setMessageCount] = useState(0);
  const [noiseRemoved, setNoiseRemoved] = useState(0);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveRoomId = hasRoomId ? roomId : selectedRoom;

  // room_id が指定されている場合: ルーム情報を取得
  useEffect(() => {
    if (!hasRoomId) {
      // ルーム未指定 → ルーム一覧をフォールバック表示
      setRoomLoading(true);
      getChatworkRooms()
        .then(r => {
          setRooms(r);
          if (r.length > 0) setSelectedRoom(r[0].room_id);
          setRoomLoading(false);
        })
        .catch(e => { setRoomError(e.message); setRoomLoading(false); });
      return;
    }

    setRoomLoading(true);
    getChatworkRoomInfo(roomId)
      .then(info => { setRoomInfo(info); setRoomLoading(false); })
      .catch(e => { setRoomError(e.message); setRoomLoading(false); });
  }, [roomId, hasRoomId]);

  // テキストエリア自動リサイズ
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || !summaryText) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(300, Math.min(ta.scrollHeight, 800))}px`;
  }, [summaryText]);

  const handleGenerate = async () => {
    if (!effectiveRoomId) return;
    setLoading(true);
    setError('');
    setSummaryText('');
    setAlerts([]);
    setCopied(false);
    setSendResult('');

    try {
      if (summaryType === 'risk_detection') {
        const result = await detectChatworkRisks(effectiveRoomId);
        setAlerts(result);
      } else {
        const patientName = roomInfo?.patient_name
          || rooms.find(r => r.room_id === effectiveRoomId)?.patient_name;
        const effectivePeriod = period === 'custom'
          ? `custom:${customDateFrom}~${customDateTo}`
          : period;
        const result = await generateChatworkSummary({
          room_id: effectiveRoomId,
          period: effectivePeriod,
          summary_type: summaryType,
          patient_name: patientName,
          additional_context: additionalContext.trim() || undefined
        });
        setSummaryText(result.summary);
        setMessageCount(result.message_count);
        setNoiseRemoved(result.noise_removed);
      }
    } catch (e: any) {
      setError(e.message || '要約の生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = textareaRef.current;
      if (ta) { ta.select(); document.execCommand('copy'); }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendToChatwork = async () => {
    if (!effectiveRoomId || !summaryText) return;
    setSending(true);
    setSendResult('');
    try {
      const result = await sendSummaryToChatwork(effectiveRoomId, summaryText, summaryType);
      setSendResult(result.message || 'Chatworkに送信しました');
    } catch (e: any) {
      setSendResult('送信エラー: ' + (e.message || '不明なエラー'));
    } finally {
      setSending(false);
    }
  };

  // ルーム情報読み込み中
  if (roomLoading) {
    return (
      <div className="screen" style={{ gap: 16 }}>
        <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#64748b' }}>ルーム情報を取得中...</p>
      </div>
    );
  }

  // room_idが無効な場合
  if (hasRoomId && roomError) {
    return (
      <div className="screen" style={{ gap: 16 }}>
        <h1 style={{ fontSize: 20 }}>ルーム情報を取得できませんでした</h1>
        <p style={{ color: '#dc2626' }}>{roomError}</p>
        <p style={{ color: '#64748b', fontSize: 13 }}>
          チャットワークのリンクが正しいか確認してください。
          <br />room_id: {roomId}
        </p>
      </div>
    );
  }

  const displayName = roomInfo?.patient_name
    || rooms.find(r => r.room_id === effectiveRoomId)?.patient_name
    || '';
  const displayRoomName = roomInfo?.room_name
    || rooms.find(r => r.room_id === effectiveRoomId)?.room_name
    || '';

  return (
    <div className="screen chatwork-summary-page" style={{ justifyContent: 'flex-start', paddingTop: 24, maxWidth: 520, margin: '0 auto', alignItems: 'center' }}>

      {/* ヘッダー: ルーム情報 */}
      {hasRoomId && roomInfo ? (
        <div style={{ width: '100%', padding: '16px 20px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#166534', textAlign: 'center' }}>{roomInfo.patient_name}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, textAlign: 'center' }}>{roomInfo.room_name}</div>
          {roomInfo.patient_type && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, textAlign: 'center' }}>{roomInfo.patient_type}</div>
          )}
        </div>
      ) : !hasRoomId ? (
        /* ルーム未指定: プルダウンで選択 */
        <div style={{ width: '100%', marginBottom: 20, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, marginBottom: 12, fontWeight: 700 }}>チャットワーク記録 AI要約</h1>
          <div style={{ width: '100%', textAlign: 'left' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, color: '#334155', fontSize: 14 }}>利用者（ルーム）</label>
            <select
              value={selectedRoom}
              onChange={e => setSelectedRoom(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 15, background: '#fff' }}
            >
              {rooms.length === 0 && <option value="">データがありません</option>}
              {rooms.map(r => (
                <option key={r.room_id} value={r.room_id}>
                  {r.patient_name}（{r.patient_type}）
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {hasRoomId && (
        <h1 style={{ fontSize: 22, marginBottom: 4, fontWeight: 700, textAlign: 'center' }}>AI要約ツール</h1>
      )}
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20, textAlign: 'center' }}>
        支援記録から報告書・サマリー・リスク検知を自動生成します
      </p>

      {/* 要約タイプ選択 */}
      <div style={{ width: '100%', marginBottom: 16 }}>
        <label style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 8, display: 'block' }}>要約タイプ</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SUMMARY_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setSummaryType(t.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 10,
                border: summaryType === t.value ? '2px solid #2563eb' : '1px solid #e2e8f0',
                background: summaryType === t.value ? '#eff6ff' : '#fff',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: summaryType === t.value ? '6px solid #2563eb' : '2px solid #cbd5e1',
                background: '#fff'
              }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: summaryType === t.value ? '#2563eb' : '#1e293b' }}>{t.label}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{t.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 期間選択 */}
      {summaryType !== 'risk_detection' && (
        <div style={{ width: '100%', marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, color: '#334155', fontSize: 14 }}>対象期間</label>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 15, background: '#fff' }}
          >
            {PERIODS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          {period === 'custom' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <input
                type="date"
                value={customDateFrom}
                onChange={e => setCustomDateFrom(e.target.value)}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
              />
              <span style={{ color: '#64748b', fontSize: 14, flexShrink: 0 }}>〜</span>
              <input
                type="date"
                value={customDateTo}
                onChange={e => setCustomDateTo(e.target.value)}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
              />
            </div>
          )}
        </div>
      )}

      {/* 追加の指示 */}
      {summaryType !== 'risk_detection' && (
        <div style={{ width: '100%', marginBottom: 20 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, color: '#334155', fontSize: 14 }}>追加の指示（任意）</label>
          <input
            type="text"
            placeholder="例: 睡眠状況に注目してほしい"
            value={additionalContext}
            onChange={e => setAdditionalContext(e.target.value)}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 15 }}
          />
        </div>
      )}

      {/* 生成ボタン */}
      <button
        className="btn btn-primary"
        onClick={handleGenerate}
        disabled={loading || !effectiveRoomId || (period === 'custom' && (!customDateFrom || !customDateTo))}
        style={{ width: '100%', maxWidth: 400, marginBottom: 20 }}
      >
        {loading ? 'AI が分析しています...' : summaryType === 'risk_detection' ? 'リスクを検知する' : '要約を生成する'}
      </button>

      {/* エラー */}
      {error && (
        <div style={{ width: '100%', padding: 12, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#64748b', fontSize: 13 }}>
            {displayName ? `${displayName}の記録を分析中...` : 'メッセージを分析中...'}
          </p>
        </div>
      )}

      {/* リスク検知結果 */}
      {alerts.length > 0 && (
        <div style={{ width: '100%', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>検知結果（{alerts.length}件）</h2>
          {alerts.map((a, i) => (
            <div
              key={i}
              style={{
                padding: 12, borderRadius: 8, marginBottom: 8, border: '1px solid',
                borderColor: a.level?.includes('赤') || a.level?.includes('緊急') ? '#fecaca' : a.level?.includes('黄') || a.level?.includes('注意') ? '#fde68a' : '#bbf7d0',
                background: a.level?.includes('赤') || a.level?.includes('緊急') ? '#fef2f2' : a.level?.includes('黄') || a.level?.includes('注意') ? '#fffbeb' : '#f0fdf4'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{a.level} {a.category && `- ${a.category}`}</div>
              <div style={{ fontSize: 14, marginBottom: 4 }}>{a.summary}</div>
              {a.detail && <div style={{ fontSize: 12, color: '#64748b' }}>{a.detail}</div>}
              {(a as any).source_staff && (
                <div style={{ fontSize: 12, color: '#334155', marginTop: 6, paddingLeft: 12, borderLeft: '2px solid #cbd5e1' }}>
                  <div>記録: {(a as any).source_staff}（{(a as any).source_datetime}）</div>
                  {(a as any).source_quote && <div style={{ color: '#64748b', fontStyle: 'italic' }}>「{(a as any).source_quote}」</div>}
                </div>
              )}
              {a.recommended_action && <div style={{ fontSize: 12, color: '#2563eb', marginTop: 4 }}>推奨: {a.recommended_action}</div>}
            </div>
          ))}
        </div>
      )}

      {/* 要約結果 */}
      {summaryText && (
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>
              {SUMMARY_TYPES.find(t => t.value === summaryType)?.label || '要約'}
            </h2>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {messageCount}件分析 / {noiseRemoved}件ノイズ除去
            </span>
          </div>

          <textarea
            ref={textareaRef}
            value={summaryText}
            onChange={e => setSummaryText(e.target.value)}
            style={{
              width: '100%', minHeight: 300, padding: 16, borderRadius: 8,
              border: '1px solid #cbd5e1', fontSize: 14, lineHeight: 1.7,
              fontFamily: 'inherit', resize: 'none', overflow: 'hidden', background: '#fafafa'
            }}
            aria-label="AI要約結果（編集可能）"
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleCopy} style={{ flex: 1 }}>
              {copied ? 'コピーしました' : 'コピー'}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSendToChatwork}
              disabled={sending}
              style={{ flex: 1, background: '#059669' }}
            >
              {sending ? '送信中...' : 'Chatworkに送信'}
            </button>
          </div>

          {sendResult && (
            <p style={{ fontSize: 13, color: sendResult.startsWith('送信エラー') ? '#dc2626' : '#059669', marginTop: 8, textAlign: 'center' }}>
              {sendResult}
            </p>
          )}

          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>
            この報告はAIが生成した下書きです。内容をご確認の上ご使用ください。
          </p>
        </div>
      )}
    </div>
  );
}
