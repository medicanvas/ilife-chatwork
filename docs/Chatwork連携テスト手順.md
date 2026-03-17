# Chatwork 連携テスト手順（LINE → Chatwork 転送）

LINE で受信したテキストを Chatwork の指定ルームに転送する機能のテスト手順です。

---

## 実装内容

### 1. LINE の「報告」などのテキスト → Chatwork（line-bot）

**対象ファイル**: `carelife_202603/line-bot/server.js`

- **環境変数**（.env は読みません。Cloud Run の「変数とシークレット」やシェルで設定）:
  - `CHATWORK_API_TOKEN` … Chatwork の API トークン
  - `CHATWORK_ROOM_ID` … 転送先ルームID（数値）

- **処理の流れ**:
  1. LINE の Webhook で `POST /webhook` を受信したとき、`req.body.events` の各イベントをループする既存処理のまま。
  2. イベントが「テキストメッセージ」（`type === 'message'` かつ `message.type === 'text'`）のとき、既存の「報告リンクを返す」判定に加えて、**Chatwork 転送用の関数** `postLineMessageToChatwork(userId, text, sourceType)` を呼び出している。
  3. `postLineMessageToChatwork` は、上記2つの環境変数が両方あるときだけ動く。ないときは何もしない。
  4. 転送内容は Chatwork のメッセージ記法で整形している:
     - `[info][title]LINE から（グループ）[/title]` または `LINE から（1対1）`
     - 本文: 送信者ID（LINE の userId）、メッセージ本文、送信時刻（ISO 形式）
  5. Chatwork API は `POST https://api.chatwork.com/v2/rooms/{room_id}/messages` を、ヘッダー `x-chatworktoken` にトークンを付けて呼び出している。Body は `application/x-www-form-urlencoded` で `body=...`。

**追加されているコードの位置**:
- ファイル先頭付近: `CHATWORK_API_TOKEN` / `CHATWORK_ROOM_ID` の読み取りと、`postLineMessageToChatwork` 関数の定義。
- `/webhook` 内のテキストメッセージ処理: `postLineMessageToChatwork(userId, text, sourceType)` の1行呼び出し。

### 2. 通院報告の要約文の送信先（バックエンド・フロント）

**送信先の判別**: フロントで開いたリンクのクエリで決まります。

- **LINE から開いた場合**（URL に `userId=...` がある）  
  → **LINE と Chatwork の両方**に送信。Chatwork は環境変数 `CHATWORK_ROOM_ID` のルームへ。
- **Chatwork から開いた場合**（URL に `chatwork_room_id=...` がある）  
  → **Chatwork のみ**に送信（そのルームへ）。LINE には送りません。

**リンク例**  
- LINE 用: `https://(フロントURL)?userId=Uxxxxxxxx`  
- Chatwork 用: `https://(フロントURL)?chatwork_room_id=425737026`  

**バックエンド**（`carelifeController.js`）: `sendReportToLine` が `userId` / `chatwork_room_id` を受け取り、どちらかまたは両方に報告文を送る。LINE 送信後や Chatwork 送信時には `postReportToChatwork(text, roomId)` を呼ぶ。

---

## 前提

- Chatwork の API トークン（個人プランは「サービス連携」→「APIトークン」で発行）
- 転送先のルームID（ルームを開いたときの URL の `rid` の数字部分。例: `#!rid425737026` → `425737026`）

---

## テスト①: 手動で1回 Chatwork に投稿する

Chatwork API が動作するか、トークン・ルームID が正しいかを確認します。

### 1. 環境変数を設定

**PowerShell（Windows）:**

```powershell
$env:CHATWORK_API_TOKEN="あなたのAPIトークン"
$env:CHATWORK_ROOM_ID="425737026"
```

**bash（Mac/Linux）:**

```bash
export CHATWORK_API_TOKEN="あなたのAPIトークン"
export CHATWORK_ROOM_ID="425737026"
```

### 2. スクリプトを実行

プロジェクトルート（`carelife_202603`）で:

```bash
node scripts/post-to-chatwork.js
```

オプションでメッセージ本文を指定できます:

```bash
node scripts/post-to-chatwork.js "こんにちは、テストです"
```

### 3. 確認

指定した Chatwork のルームにメッセージが1件投稿されていれば成功です。

---

## テスト②: LINE Webhook 受信 → Chatwork 投稿

LINE で Bot に送ったテキストが、同じルームに転送されることを確認します。

### 1. line-bot に環境変数を渡す

line-bot は .env ファイルを読みません。環境変数で渡してください。

- **Cloud Run**: 「変数とシークレット」に `CHATWORK_API_TOKEN` と `CHATWORK_ROOM_ID` を追加。
- **ローカル**: 起動前にシェルで `export CHATWORK_API_TOKEN=...` と `export CHATWORK_ROOM_ID=...` を設定するか、OS の環境変数として設定。

### 2. line-bot を起動

```bash
cd line-bot
npm start
```

（ローカルで試すときは、LINE の Webhook URL を ngrok 等で line-bot の `/webhook` に向けておいてください。本番は Cloud Run の URL が設定済みならそのままで大丈夫です。）

### 3. LINE でメッセージを送る

Bot が入っているトークまたはグループで、適当なテキスト（例: 「テスト」）を送信します。

### 4. 確認

- Chatwork の指定ルームに、「LINE から（グループ）」または「LINE から（1対1）」のようなタイトルで、送信者ID・本文・時刻が転送されていれば成功です。

---

## 通院報告の要約文を Chatwork に転送する（LINEに送信した内容）

録音 → 文字起こし → Gemini 要約 → **「LINEに送信する」で LINE に送った報告文**を、同じタイミングで Chatwork にも転送するには、**バックエンド（carelife-backend）** に Chatwork の環境変数を設定します。

1. **Cloud Run** → サービス **carelife-backend** → **編集** → **変数とシークレット**
2. 次を追加（または line-bot と同じ値で設定）:
   - `CHATWORK_API_TOKEN`
   - `CHATWORK_ROOM_ID`
3. **デプロイ** で保存。
4. フロントで報告を作成し、「LINEに送信する」を押すと、LINE に送られる要約文が Chatwork の指定ルームにも「通院報告（LINE に送信した内容）」として投稿されます。

※ 一括デプロイ（`scripts/deploy-cloudrun.ps1`）を使う場合、`backend/.env` に `CHATWORK_API_TOKEN` と `CHATWORK_ROOM_ID` を書いておくと、バックエンドにも自動で渡されます。

---

## 転送されないときの確認（Cloud Run）

LINE には返信するが **Chatwork に転送されない** 場合は、次を確認してください。

### 1. 環境変数が Cloud Run に設定されているか

1. **Google Cloud コンソール** → **Cloud Run** → サービス **carelife-linebot** を開く。
2. **「編集」**（または「リビジョンを管理」→ 最新リビジョン → 編集）→ **「変数とシークレット」** タブを開く。
3. 以下が **両方** 設定されているか確認する。
   - `CHATWORK_API_TOKEN` … Chatwork の API トークン（値に余分なスペースや改行がないこと）
   - `CHATWORK_ROOM_ID` … 転送先ルームID（数値のみ。例: `425737026`）
4. なければ **「変数を追加」** で追加し、**「デプロイ」** で保存する。既存の変数（`FRONTEND_URL` や LINE 用）はそのままでよい。

### 2. ログで原因を確認する

**重要**: 画面に出ている **GET 200** や **GET 404** は「HTTP リクエストのログ」です。`[Chatwork]` や `[LINE]` のログは **アプリケーション（コンテナ）の標準出力** なので、別のログとして記録されています。

1. Cloud Run → **carelife-linebot** → **「ログ」** タブを開く。
2. **「ログをフィルタ」** または検索欄に **`Chatwork`** または **`webhook`** と入力し、アプリから出力したログだけに絞る。
3. または、画面上で **「すべてのログ」** / **「コンテナログ」** など、リクエスト以外のログも表示するようにする。
4. LINE でメッセージを送ったあと、次のようなログが出ているか確認する。
   - **`[Chatwork] 転送スキップ: CHATWORK_API_TOKEN または CHATWORK_ROOM_ID が未設定です`**  
     → 上記のとおり、環境変数を追加してください。
   - **`[Chatwork] 転送エラー: 401: ...`**  
     → API トークンが誤っているか期限切れ。Chatwork で再発行し、Cloud Run の変数を更新してください。
   - **`[Chatwork] 転送しました message_id: ...`**  
     → 転送は成功しているので、Chatwork 側のルーム・権限を確認してください。
3. 起動時ログに **`[Chatwork] CHATWORK_API_TOKEN または CHATWORK_ROOM_ID が未設定`** と出ている場合も、環境変数が渡っていません。

**ログの探し方（GCP コンソール）**: ログ画面の検索欄に `Chatwork` や `POST /webhook` や `テキスト受信` と入れると、アプリから出力したログだけが表示されます。表示されている **GET 200** はブラウザがルート URL にアクセスした記録で、LINE の Webhook（POST /webhook）や Chatwork 転送のログとは別です。

### 3. 環境変数だけ追加して反映する

コードを変えずに、Cloud Run の画面で `CHATWORK_API_TOKEN` と `CHATWORK_ROOM_ID` を追加したあと、「デプロイ」すると、新しいリビジョンが作成され、次回のリクエストから転送が有効になります。

---

## 注意事項

- **API トークン**はコードやリポジトリに含めず、環境変数や Cloud Run のシークレットでだけ扱ってください。
- Chatwork API の制限: 同一ルームへの投稿は **10秒あたり10回** まで。LINE で短時間に大量投稿がある場合は転送が 429 になることがあります。
- テスト後、Chatwork の API トークンは「サービス連携」→「APIトークン」で再発行し、古いトークンを無効化することを推奨します。
