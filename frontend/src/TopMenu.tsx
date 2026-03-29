import React from 'react';

interface Props {
  onSelectMode: (mode: 'voice' | 'chatwork') => void;
}

export default function TopMenu({ onSelectMode }: Props) {
  return (
    <div className="screen" style={{ gap: 20 }}>
      <h1 style={{ fontSize: 22, marginBottom: 0 }}>ケアライフ</h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 8 }}>通院報告支援ツール</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
        <button
          className="btn btn-mode"
          onClick={() => onSelectMode('voice')}
          style={{
            padding: '20px 16px',
            borderRadius: 12,
            border: '2px solid #2563eb',
            background: '#eff6ff',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          <div style={{ fontSize: 20, marginBottom: 4 }}>&#127908; 音声録音から作成</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            診察に同行して音声を録音し、AIが通院報告書を作成します
          </div>
        </button>

        <button
          className="btn btn-mode"
          onClick={() => onSelectMode('chatwork')}
          style={{
            padding: '20px 16px',
            borderRadius: 12,
            border: '2px solid #059669',
            background: '#ecfdf5',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          <div style={{ fontSize: 20, marginBottom: 4 }}>&#128172; チャットワーク記録から作成</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            チャットワークの支援記録をAIが分析し、報告書・サマリー・リスク検知を行います
          </div>
        </button>
      </div>

      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 16 }}>
        Carelife v1.0 &mdash; medicanvas
      </p>
    </div>
  );
}
