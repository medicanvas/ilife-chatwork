import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ReportSummary from './ReportSummary';
import ChatworkSummary from './ChatworkSummary';
import TopMenu from './TopMenu';
import './index.css';

type AppMode = 'top' | 'voice' | 'chatwork';

function Root() {
  const pathname = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  // /report-summary → 旧報告書まとめ画面（既存互換）
  if (pathname === '/report-summary') {
    return <ReportSummary />;
  }

  // /chatwork-summary?chatwork_room_id=xxx → チャットワーク要約画面
  if (pathname === '/chatwork-summary') {
    const roomId = params.get('chatwork_room_id') || '';
    return <ChatworkSummary chatworkRoomId={roomId} />;
  }

  // ?userId=xxx or ?chatwork_room_id=xxx（ルートパス）→ 既存の音声フロー
  const hasDirectParams = params.has('userId') || params.has('chatwork_room_id');

  const [mode, setMode] = useState<AppMode>(hasDirectParams ? 'voice' : 'top');

  if (mode === 'top') {
    return <TopMenu onSelectMode={(selected) => setMode(selected)} />;
  }

  if (mode === 'chatwork') {
    return <ChatworkSummary chatworkRoomId="" />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
