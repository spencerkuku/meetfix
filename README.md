# MeetFix

單一學校使用的教室/會議室借用與設施報修追蹤系統。詳細的領域詞彙請見 [`CONTEXT.md`](./CONTEXT.md)，架構決策的來龍去脈請見 [`docs/adr/`](./docs/adr/)。

## 架構

- `backend/` — NestJS REST API，透過 Prisma 存取 PostgreSQL。
- 前端（repo 根目錄）— 既有的 React/Vite 單頁應用程式（SPA）。
- 部署 — 單一 `docker-compose` 堆疊：`api`（NestJS）、`postgres`、`backup`（排程 `pg_dump`）、`caddy`（反向代理，自動 HTTPS）。

## 啟動完整堆疊（Docker）

1. 複製環境變數範本並填入實際密碼：
   ```bash
   cp .env.example .env
   ```
2. 啟動所有服務：
   ```bash
   docker compose up -d --build
   ```
   這會建置 API 映像檔，並在容器啟動時自動執行尚未套用的 Prisma migration，同時啟動 Postgres 與 Caddy。
3. 確認服務是否正常：
   ```bash
   curl -sk https://localhost/health
   ```
   回傳 `{"status":"ok"}` 代表 Caddy → API → Postgres 之間都能正常連通。

### 環境變數

在 repo 根目錄的 `.env` 中設定（可參考 `.env.example`）：

| 變數 | 用途 |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | 資料庫帳密，`postgres` 與 `api` 共用 |
| `SITE_ADDRESS` | Caddy 服務並自動核發 HTTPS 憑證的網域。本機開發時保留 `localhost`（純 HTTP／本機憑證）；正式環境請填學校實際網域（例如 `meetfix.your-school.edu.tw`），Caddy 會自動取得並更新 Let's Encrypt 憑證——只要確保該網域的 DNS 指向此主機，且對外開放 80/443 連接埠即可。 |
| `VITE_API_URL` | 前端開發伺服器尋找 API 的位置。`docker compose` 本身不會用到（該情境下由 Caddy 負責路由）——只有在本機執行 Vite 開發伺服器時才需要。 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 來自 Google Cloud Console（APIs & Services → Credentials），用於 Google Workspace 登入。 |
| `GOOGLE_CALLBACK_URL` | 必須與 Google Cloud Console 上註冊的 redirect URI 完全一致，例如 `https://meetfix.your-school.edu.tw/auth/google/callback`。 |
| `SCHOOL_GOOGLE_DOMAIN` | 允許登入的 Google Workspace 網域——其餘一律拒絕。 |
| `FRONTEND_URL` | 前端的公開網址；Google 登入驗證後會導回此處。 |
| `JWT_SECRET` | 用來簽署 session JWT——以 `openssl rand -hex 32` 產生。 |
| `ENCRYPTION_KEY` | 32 位元組的 hex 金鑰，用於加密儲存中的 Google refresh token——以 `openssl rand -hex 32` 產生。 |
| `BACKUP_RETENTION_DAYS` | `backup` 服務刪除舊備份前，保留的資料庫備份天數。選填，預設為 `14`。 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | 用於寄送交易型通知信件（借用審核、報修狀態更新等，詳見下方）的 SMTP 伺服器設定。全部選填——`SMTP_HOST` 留空即可完全停用寄信功能。 |

上傳的檔案（教室與報修單照片）存放在掛載至 API 容器 `/app/uploads` 的 Docker volume（`uploads`）中，並透過 Caddy 於 `/uploads/*` 對外提供——詳見 ADR-0004。

### Email 通知

API 會在四種領域事件發生時寄送交易型通知信：借用申請送出待審核（通知 Room Manager）、借用審核結果（通知申請人）、非申請人本人取消借用（通知申請人）、報修單狀態變更或有新回覆（通知回報的 User）。透過上方的 `SMTP_*` 環境變數設定 SMTP；若未設定 `SMTP_HOST`，寄信動作會被略過（以 debug 等級記錄）——其餘功能仍正常運作。

### Google 日曆同步

當一筆 Booking 狀態變為 `CONFIRMED` 時，會在申請人的 Google 日曆上建立對應事件，使用的是 Google 登入時取得的 Calendar OAuth 授權範圍與 refresh token（`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`；refresh token 本身會透過 `ENCRYPTION_KEY` 加密儲存）。當該 Booking 之後變為 `REJECTED` 或 `CANCELLED`，對應的日曆事件會被移除。此功能僅適用於以 Google 帳號登入的 User——使用密碼帳號的 User 沒有連結的日曆，因此不會為其嘗試任何日曆操作。同步失敗（授權被撤銷、API 錯誤等）僅會被記錄下來，不會影響原本的 Booking 操作結果。

### 備份與還原

`backup` 服務每天容器時間 03:00 會對資料庫執行一次 `pg_dump`，經 gzip 壓縮後存入 `backups` 具名 volume——排程請見 `backup/crontab`，備份指令請見 `backup/backup.sh`。超過 `BACKUP_RETENTION_DAYS`（預設 14 天）的備份會在每次執行後被刪除。

**立即觸發備份**（例如在進行高風險變更之前）：
```bash
docker compose exec backup sh /backup.sh
```

**列出備份檔：**
```bash
docker compose exec backup ls -la /backups
```

**還原流程。** 一律還原到*全新*的 Postgres——絕不可對正在運作中的資料庫執行還原，因為備份檔會嘗試重新建立已經存在的資料表。

1. 將備份檔從 volume 複製到主機：
   ```bash
   docker compose cp backup:/backups/meetfix-<timestamp>.sql.gz ./meetfix-restore.sql.gz
   ```
2. 停止整個堆疊並刪除目前的資料庫 volume（務必先確認備份檔已安全複製出來，此步驟僅適用於真正的災難復原還原——若只是例行演練，請改用另一個可拋棄的 Postgres 容器還原，不要動到正式的 `pgdata` volume）。下方的 volume 名稱為 `<compose-project-name>_pgdata`；Compose 預設會以此 repo 所在目錄的名稱作為 project name（除非另外指定），若你的環境不同請自行調整前綴（可用 `docker volume ls` 確認）：
   ```bash
   docker compose down
   docker volume rm meetfix_pgdata
   ```
3. 讓 Postgres 以空資料庫重新啟動，並等待其回報健康狀態（先不要啟動 `api`，先完成還原可避免它與針對空 schema 執行的 `prisma migrate deploy` 互相搶跑）：
   ```bash
   docker compose up -d postgres
   docker compose exec postgres sh -c 'until pg_isready -U "$POSTGRES_USER"; do sleep 1; done'
   ```
4. 執行還原。`POSTGRES_USER`/`POSTGRES_DB` 是容器內 `.env` 的值，並非你主機 shell 的環境變數，請先 export 出來（或直接代入實際值）。備份檔已包含完整 schema、資料，以及 Prisma 自己的 migration 歷史紀錄表，因此這步驟就能重建所有內容：
   ```bash
   set -a; source .env; set +a
   gunzip -c meetfix-restore.sql.gz | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
   ```
5. 啟動堆疊的其餘服務。`api` 的 `prisma migrate deploy` 會看到每個 migration 都已被記錄為套用過，因此不會再做任何事：
   ```bash
   docker compose up -d
   ```

此流程已經過人工驗證：從一個有種子資料的堆疊取得備份，還原到全新的 Postgres 容器後，資料列數與來源完全一致。

### 停止／重置

```bash
docker compose down          # 停止服務，保留資料
docker compose down -v       # 停止服務並清除資料庫 volume
```

## 後端開發（不使用 Docker）

```bash
cd backend
npm install
cp .env.example .env   # 接著將 DATABASE_URL 指向本機 Postgres
npx prisma migrate dev   # 針對你的 DATABASE_URL 套用／建立 migration
npm run start:dev
```

### 測試

測試會對真實的 PostgreSQL 資料庫執行（不使用模擬的 Prisma／DB 層）——詳見專案規格中關於測試策略的說明。執行前請將 `backend/.env` 的 `DATABASE_URL` 指向一個可拋棄的 Postgres 實例（本機的 Docker 容器即可）：

```bash
cd backend
npm run test        # 單元測試
npm run test:e2e    # 針對真實資料庫的 HTTP 邊界測試
```

### 資料庫 migration

Schema 變更一律透過 Prisma migration 進行——絕不手動修改資料庫：

```bash
cd backend
npx prisma migrate dev --name <describe-the-change>
```

Migration 檔案會提交至 `backend/prisma/migrations/`，並在正式環境中透過 `prisma migrate deploy` 自動套用，此指令會在每次容器啟動時執行（詳見 `backend/docker-entrypoint.sh`）。
