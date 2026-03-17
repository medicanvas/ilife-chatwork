# Carelife — Cloud Run へ一括デプロイ（yorisoi-demo / asia-northeast1）
# 事前: gcloud auth login, gcloud config set project yorisoi-demo
# 環境変数: GEMINI_API_KEY を設定していること。LINE Bot 用に LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN を設定（または backend/.env に記載）

$ErrorActionPreference = "Stop"
$PROJECT_ID = "yorisoi-demo"
$REGION = "asia-northeast1"
$ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$GCLOUD_FORMAT_URL = [char]118+[char]97+[char]108+[char]117+[char]101+[char]40+[char]115+[char]116+[char]97+[char]116+[char]117+[char]115+[char]46+[char]117+[char]114+[char]108+[char]41

# backend/.env から LINE_* と GEMINI_API_KEY を読み込み（未設定時のみ）
$envPath = Join-Path $ROOT "backend\.env"
if (Test-Path $envPath) {
  Get-Content $envPath -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $key = $matches[1].Trim()
      $val = $matches[2].Trim()
      $val = ($val -replace '\s*#.*$', '').Trim().Trim('"').Trim("'")
      if ($key -match '^(LINE_CHANNEL_SECRET|LINE_CHANNEL_ACCESS_TOKEN|GEMINI_API_KEY|CHATWORK_API_TOKEN|CHATWORK_ROOM_ID)$' -and -not [Environment]::GetEnvironmentVariable($key, 'Process')) {
        Set-Item -Path "Env:$key" -Value $val
      }
    }
  }
}

Write-Host ("=== Carelife Cloud Run deploy (project: " + $PROJECT_ID + ") ===") -ForegroundColor Cyan
gcloud config set project $PROJECT_ID

# --- 1. バックエンド ---
Write-Host ""; Write-Host "--- 1. Backend ---" -ForegroundColor Yellow
$BACKEND_ENV = ('PROJECT_ID=' + $PROJECT_ID + ',GCS_BUCKET=yorisoi-demo-recordings,GEMINI_API_KEY=' + $env:GEMINI_API_KEY)
$backendDeployArgs = @(
  'run', 'deploy', 'carelife-backend',
  '--source', (Join-Path $ROOT "backend"),
  '--region', $REGION,
  '--platform', 'managed',
  '--allow-unauthenticated',
  '--service-account', ('carelife-backend-sa@' + $PROJECT_ID + '.iam.gserviceaccount.com'),
  '--set-env-vars', $BACKEND_ENV,
  '--memory', '1Gi',
  '--timeout', '300',
  '--min-instances', '0',
  '--max-instances', '5',
  '--quiet'
)
if ($env:LINE_CHANNEL_ACCESS_TOKEN) {
  Write-Host "Passing LINE_CHANNEL_ACCESS_TOKEN to backend." -ForegroundColor Gray
  $backendDeployArgs += '--set-env-vars'
  $backendDeployArgs += ('LINE_CHANNEL_ACCESS_TOKEN=' + $env:LINE_CHANNEL_ACCESS_TOKEN)
}
if ($env:CHATWORK_API_TOKEN -and $env:CHATWORK_ROOM_ID) {
  Write-Host "Passing CHATWORK_* to backend (通院報告の Chatwork 転送用)." -ForegroundColor Gray
  $backendDeployArgs += '--set-env-vars'
  $backendDeployArgs += ('CHATWORK_API_TOKEN=' + $env:CHATWORK_API_TOKEN + ',CHATWORK_ROOM_ID=' + $env:CHATWORK_ROOM_ID)
}
gcloud @backendDeployArgs

if (-not $?) { Write-Error 'Backend deploy failed.' }
$BACKEND_URL = (gcloud run services describe carelife-backend --region $REGION --format $GCLOUD_FORMAT_URL).Trim()
Write-Host ('Backend URL: {0}' -f $BACKEND_URL) -ForegroundColor Green

# --- 2. フロントエンド（バックエンド URL をビルド時に埋め込み）---
Write-Host ""; Write-Host "--- 2. Frontend ---" -ForegroundColor Yellow
Push-Location (Join-Path $ROOT "frontend")
$subs = "_VITE_API_BASE_URL=" + $BACKEND_URL
gcloud builds submit . --config=cloudbuild.yaml --substitutions=$subs
if (-not $?) { Pop-Location; Write-Error 'Frontend build failed.' }
Pop-Location

$FRONTEND_IMAGE = $REGION + '-docker.pkg.dev/' + $PROJECT_ID + '/carelife-repo/carelife-frontend:latest'
gcloud run deploy carelife-frontend `
  --image $FRONTEND_IMAGE `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --memory 256Mi `
  --min-instances 0 `
  --max-instances 5 `
  --quiet

if (-not $?) { Write-Error 'Frontend deploy failed.' }
$FRONTEND_URL = (gcloud run services describe carelife-frontend --region $REGION --format $GCLOUD_FORMAT_URL).Trim()
Write-Host ('Frontend URL: {0}' -f $FRONTEND_URL) -ForegroundColor Green

# --- 3. LINE Bot（FRONTEND_URL / LINE トークン / Chatwork 転送用）---
Write-Host ""; Write-Host "--- 3. LINE Bot ---" -ForegroundColor Yellow
# line-bot/.env から CHATWORK_* と LINE_* を読み込み（未設定時のみ。backend/.env の LINE_* を上書きしない）
$lineBotEnvPath = Join-Path $ROOT "line-bot\.env"
if (Test-Path $lineBotEnvPath) {
  Get-Content $lineBotEnvPath -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $key = $matches[1].Trim()
      $val = $matches[2].Trim()
      $val = ($val -replace '\s*#.*$', '').Trim().Trim('"').Trim("'")
      if ($key -match '^(CHATWORK_API_TOKEN|CHATWORK_ROOM_ID|LINE_CHANNEL_SECRET|LINE_CHANNEL_ACCESS_TOKEN)$' -and -not [Environment]::GetEnvironmentVariable($key, 'Process')) {
        Set-Item -Path "Env:$key" -Value $val
      }
    }
  }
}
$LINE_SECRET = $env:LINE_CHANNEL_SECRET
$LINE_TOKEN = $env:LINE_CHANNEL_ACCESS_TOKEN
$lineBotEnv = "FRONTEND_URL=$FRONTEND_URL"
if ($LINE_SECRET -and $LINE_TOKEN) {
  $lineBotEnv = "$lineBotEnv,LINE_CHANNEL_SECRET=$LINE_SECRET,LINE_CHANNEL_ACCESS_TOKEN=$LINE_TOKEN"
} else {
  Write-Host "LINE tokens not set. Deploying line-bot with FRONTEND_URL only." -ForegroundColor Yellow
}
if ($env:CHATWORK_API_TOKEN -and $env:CHATWORK_ROOM_ID) {
  $lineBotEnv = "$lineBotEnv,CHATWORK_API_TOKEN=$($env:CHATWORK_API_TOKEN),CHATWORK_ROOM_ID=$($env:CHATWORK_ROOM_ID)"
  Write-Host "Chatwork env vars will be set on line-bot." -ForegroundColor Gray
}
$lineBotSource = Join-Path $ROOT "line-bot"
gcloud run deploy carelife-linebot --source $lineBotSource --region $REGION --platform managed --allow-unauthenticated --set-env-vars $lineBotEnv --memory 256Mi --min-instances 0 --max-instances 5 --quiet

if (-not $?) { Write-Error "LINE Bot deploy failed." }
$LINEBOT_URL = (gcloud run services describe carelife-linebot --region $REGION --format $GCLOUD_FORMAT_URL).Trim()
Write-Host $LINEBOT_URL -ForegroundColor Green

Write-Host ""
Write-Host "=== Deploy done ===" -ForegroundColor Green
Write-Host "Backend:  $BACKEND_URL"
Write-Host "Frontend: $FRONTEND_URL"
Write-Host "LINE Bot: $LINEBOT_URL"
Write-Host ""
Write-Host $LINEBOT_URL -ForegroundColor Cyan
Write-Host "Set LINE Developers Webhook URL to: (above URL) + /webhook" -ForegroundColor Gray
