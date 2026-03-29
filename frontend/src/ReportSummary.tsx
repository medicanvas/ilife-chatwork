import React, { useState, useRef } from 'react';

/** 1件の通院報告 */
interface ReportEntry {
  receivedDate: string;
  facility: string;
  diagnosisSummary: string;
  conditionNote: string;
  handoverNote: string;
  staffName: string;
}

/** 報告書まとめのドキュメント構造（リサーチフォーマット準拠） */
interface ReportSummaryDoc {
  title: string;
  userName: string;
  targetPeriod: string;
  createdAt: string;
  entries: ReportEntry[];
}

const MOCK_DOC: ReportSummaryDoc = {
  title: '通院報告まとめ',
  userName: 'テスト 太郎 様',
  targetPeriod: '直近100件（Chatwork ルームの投稿より）',
  createdAt: new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }),
  entries: [
    {
      receivedDate: '2026年3月19日',
      facility: 'テスト病院 内科（山田医師）',
      diagnosisSummary: '特記事項なし（Chatworkのテスト投稿のため）',
      conditionNote: '特に変わりなく、安定して過ごされております。',
      handoverNote: '本件はChatworkのシステムテストです。',
      staffName: '森',
    },
    {
      receivedDate: '2026年3月17日',
      facility: 'テスト病院 内科（担当医：山田医師）',
      diagnosisSummary:
        '咳と腹痛の訴えがあり、咳止め（メジコン）1錠と吐き気止めが1週間分処方されました。吐き気止めは作用が強いため、副作用などの症状が見られた場合は服薬を中止し、速やかに再受診するよう医師より指示がありました。症状が改善しない場合は1週間後に再診が必要です。',
      conditionNote: '特記事項なし',
      handoverNote:
        '処方薬は薬局にて受け取り済みです。次回1週間後の再診予約を午前10時にとりました。当日は午前9時30分に施設を出発する予定です。',
      staffName: '森',
    },
    {
      receivedDate: '2026年3月17日',
      facility: 'テスト病院 内科（担当医：山田医師）',
      diagnosisSummary:
        '夜間の不眠症状について相談しました。現在服用中のベルソムラ15mgで改善が見られないため、ユーロジン1mg（1錠）が追加処方されました。次回の予約は4月16日15時です。',
      conditionNote:
        '全体としては落ち着いておられましたが、診察中にうとうととされる場面がありました。日中に傾眠傾向が見られます。',
      handoverNote:
        '今回処方された薬はベルソムラと併用となります。夕方の服薬から就寝にかけての様子を観察してください。日中の眠気については引き続き注意深く見守りをお願いします。次回の受診は14時30分施設出発予定です。なお、本件はChatworkテストを兼ねた報告となります。',
      staffName: '森',
    },
  ],
};

function serializeDoc(doc: ReportSummaryDoc): string {
  const lines: string[] = [
    doc.title,
    '',
    '■利用者名',
    doc.userName,
    '',
    '■対象期間',
    doc.targetPeriod,
    '',
    '■作成日',
    doc.createdAt,
    '',
  ];
  doc.entries.forEach((e, i) => {
    lines.push('────────────────────────────────────────');
    lines.push(`【${i + 1}件目】 ${e.receivedDate}`);
    lines.push('────────────────────────────────────────');
    lines.push('■受診先');
    lines.push(e.facility);
    lines.push('');
    lines.push('■診察内容');
    lines.push(e.diagnosisSummary);
    lines.push('');
    lines.push('■ご本人の様子');
    lines.push(e.conditionNote);
    lines.push('');
    lines.push('■申し送り');
    lines.push(e.handoverNote);
    lines.push('');
    lines.push('■担当者');
    lines.push(e.staffName);
    lines.push('');
  });
  lines.push('────────────────────────────────────────');
  lines.push('（以上、通院報告まとめ）');
  return lines.join('\n');
}

export default function ReportSummary() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('chatwork_room_id');
  const [doc] = useState<ReportSummaryDoc>(MOCK_DOC);
  const [viewMode, setViewMode] = useState<'document' | 'edit'>('document');
  const [editText, setEditText] = useState(() => serializeDoc(MOCK_DOC));
  const [customText, setCustomText] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const displayText = customText ?? serializeDoc(doc);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadTxt = () => {
    const content = viewMode === 'edit' ? editText : displayText;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `通院報告まとめ_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEditStart = () => {
    setEditText(displayText);
    setViewMode('edit');
  };

  const handleEditDone = () => {
    setCustomText(editText);
    setViewMode('document');
  };

  return (
    <div className="report-summary-page">
      <header className="report-summary-header no-print">
        <h1>通院報告まとめ</h1>
        {roomId && (
          <p className="report-summary-room-hint">
            ルームID: {roomId}（対象: 直近100件・モック表示）
          </p>
        )}
        {!roomId && (
          <p className="report-summary-room-hint">
            リンクに <code>?chatwork_room_id=〇〇</code> を付けると、指定ルームの報告をまとめます。現在はモックデータを表示しています。
          </p>
        )}
      </header>

      <div className="report-summary-actions no-print">
        {viewMode === 'document' ? (
          <button type="button" className="btn btn-secondary" onClick={handleEditStart}>
            内容を編集
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={handleEditDone}>
            表示に戻る
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={handlePrint}>
          印刷
        </button>
        <button type="button" className="btn btn-primary" onClick={handleDownloadTxt}>
          テキストで保存（.txt）
        </button>
      </div>

      <div ref={printRef} className="report-summary-body">
        {viewMode === 'edit' ? (
          <>
            <textarea
              className="report-summary-textarea no-print-el"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              aria-label="報告書の内容（編集可）"
              spellCheck={false}
            />
            <div className="report-summary-print-only" aria-hidden="true">
              <pre className="report-summary-pre">{editText}</pre>
            </div>
          </>
        ) : customText !== null ? (
          <div className="report-summary-doc report-summary-doc--custom">
            <pre className="report-summary-pre">{displayText}</pre>
          </div>
        ) : (
          <article className="report-summary-doc">
            <div className="report-summary-doc-meta">
              <h2 className="report-summary-doc-title">{doc.title}</h2>
              <dl className="report-summary-doc-list">
                <div className="report-summary-doc-row">
                  <dt>利用者名</dt>
                  <dd>{doc.userName}</dd>
                </div>
                <div className="report-summary-doc-row">
                  <dt>対象期間</dt>
                  <dd>{doc.targetPeriod}</dd>
                </div>
                <div className="report-summary-doc-row">
                  <dt>作成日</dt>
                  <dd>{doc.createdAt}</dd>
                </div>
              </dl>
            </div>

            <div className="report-summary-entries">
              {doc.entries.map((entry, i) => (
                <section key={i} className="report-summary-entry">
                  <div className="report-summary-entry-head">
                    <span className="report-summary-entry-num">【{i + 1}件目】</span>
                    <time className="report-summary-entry-date">{entry.receivedDate}</time>
                  </div>
                  <dl className="report-summary-entry-fields">
                    <div className="report-summary-field">
                      <dt>受診先</dt>
                      <dd>{entry.facility}</dd>
                    </div>
                    <div className="report-summary-field">
                      <dt>診察内容</dt>
                      <dd>{entry.diagnosisSummary}</dd>
                    </div>
                    <div className="report-summary-field">
                      <dt>ご本人の様子</dt>
                      <dd>{entry.conditionNote}</dd>
                    </div>
                    <div className="report-summary-field">
                      <dt>申し送り</dt>
                      <dd>{entry.handoverNote}</dd>
                    </div>
                    <div className="report-summary-field">
                      <dt>担当者</dt>
                      <dd>{entry.staffName}</dd>
                    </div>
                  </dl>
                </section>
              ))}
            </div>

            <footer className="report-summary-doc-footer">
              （以上、通院報告まとめ）
            </footer>
          </article>
        )}
      </div>

      <div className="report-summary-footer no-print">
        <p>内容は編集できます。印刷・保存前にご確認ください。</p>
      </div>

      <style>{`
        .report-summary-print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .no-print-el { display: none !important; }
          .report-summary-print-only { display: block !important; }
          .report-summary-print-only .report-summary-pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
          .report-summary-page { padding: 0; max-width: none; background: #fff; }
          .report-summary-body { border: none; box-shadow: none; padding: 0; }
          .report-summary-doc { padding: 0; }
          .report-summary-entry { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
