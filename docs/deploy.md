# 部署（Production）

單一 `docker-compose` 堆疊：`api`（NestJS）、`postgres`、`backup`（排程 `pg_dump`）、`caddy`（反向代理，自動 HTTPS）。

## 目錄

- [前置需求](#前置需求)
- [啟動步驟](#啟動步驟)
- [環境變數](#環境變數)
- [備份與還原](#備份與還原)
- [停止／重置](#停止重置)

## 前置需求

- 主機已安裝 Docker 與 Docker Compose
- 網域 DNS 已指向部署主機，且對外開放 80/443 埠（Caddy 需要自動核發 HTTPS 憑證）
- 若要啟用 Google 登入（選用）：Google Cloud Console 已建立 OAuth 用戶端（Client ID／Secret），並在該用戶端的「已授權的重新導向 URI」填入 `GOOGLE_CALLBACK_URL` 的值。未建立則留空對應變數即可，系統會自動略過 Google 登入，僅提供帳號密碼登入

## 啟動步驟

1. 複製環境變數範本並填入實際值：

   ```bash
   cp .env.example .env
   ```

2. 正式環境務必設定：

   | 變數 | 說明 |
   | --- | --- |
   | `POSTGRES_PASSWORD` | 改掉預設值 |
   | `SITE_ADDRESS` | 填學校實際網域（例如 `meetfix.your-school.edu.tw`），DNS 需指向此主機，且對外開放 80/443 |
   | `JWT_SECRET` | 用 `openssl rand -hex 32` 產生 |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` / `SCHOOL_GOOGLE_DOMAIN` / `FRONTEND_URL` | 選用——要啟用 Google 登入才需要設定，見下方環境變數說明 |

3. 啟動所有服務：

   ```bash
   docker compose up -d --build
   ```

   會建置 API 映像檔，容器啟動時自動套用尚未執行的 Prisma migration，並啟動 Postgres 與 Caddy。

4. 確認服務正常：

   ```bash
   curl -sk https://localhost/health
   ```

   回傳 `{"status":"ok"}` 代表 Caddy → API → Postgres 都能正常連通。

## 環境變數

格式要求與範例值見 [`.env.example`](../.env.example) 內的逐行註解。

| 變數 | 必填 | 用途／未設定時的行為 |
| --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | 必填 | 資料庫帳密，`postgres` 與 `api` 共用 |
| `SITE_ADDRESS` | 必填 | Caddy 自動核發 HTTPS 憑證的網域；production 請填實際網域 |
| `VITE_API_URL` | 選填 | 前端 Vite 開發伺服器找 API 的位置；`docker compose` 部署不使用 |
| `VITE_SCHOOL_NAME` | 選填 | Footer 顯示的校名；未設定時 footer 不顯示校名，只顯示系統名稱 |
| `JWT_SECRET` | 必填 | 簽署 session JWT 的密鑰 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 選填 | Google OAuth 憑證，取自 Google Cloud Console -> APIs & Services -> Credentials；兩者只要留空其中一個，系統就會視為不使用 Google 登入（不影響帳號密碼登入） |
| `GOOGLE_CALLBACK_URL` | 選填（啟用 Google 登入才需要） | 須與該 OAuth 用戶端「已授權的重新導向 URI」(Authorized redirect URIs) 中填入的網址完全一致 |
| `SCHOOL_GOOGLE_DOMAIN` | 選填（啟用 Google 登入才需要） | 允許登入的 Google Workspace 網域，其餘一律拒絕 |
| `FRONTEND_URL` | 選填（啟用 Google 登入才需要） | 前端公開網址，Google 登入後導回此處；目前僅 Google 登入流程會用到 |
| `BACKUP_RETENTION_DAYS` | 選填 | 備份保留天數；未設定時預設 14 天 |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | 選填 | 首次啟動自動 bootstrap 的管理員帳號；未設定則跳過 |

上傳的檔案（教室與報修單照片）存放在 `uploads` volume，透過 Caddy 於 `/uploads/*` 對外提供——詳見 [ADR-0004](./adr/0004-local-disk-file-storage.md)。

## 備份與還原

- `backup` 服務每天容器時間 03:00 執行一次 `pg_dump`，gzip 壓縮後存入 `backups` volume。
- 排程：`deploy/backup/crontab`；備份指令：`deploy/backup/backup.sh`。
- 超過 `BACKUP_RETENTION_DAYS`（預設 14 天）的備份會在每次執行後刪除。

**立即觸發備份**：

```bash
docker compose exec backup sh /backup.sh
```

**列出備份檔**：

```bash
docker compose exec backup ls -la /backups
```

**還原流程**（一律還原到*全新*的 Postgres，絕不對正在運作中的資料庫執行還原）：

1. 把備份檔從 volume 複製到主機：

   ```bash
   docker compose cp backup:/backups/meetfix-<timestamp>.sql.gz ./meetfix-restore.sql.gz
   ```

2. 停止整個堆疊並刪除目前的資料庫 volume（先確認備份檔已安全複製出來；只是例行演練請改用可拋棄的 Postgres 容器，不要動正式的 `pgdata` volume）：

   ```bash
   docker compose down
   docker volume rm meetfix_pgdata
   ```

   （volume 名稱格式為 `<compose-project-name>_pgdata`；用 `docker volume ls` 確認實際名稱。）

3. 讓 Postgres 以空資料庫重新啟動，等待健康：

   ```bash
   docker compose up -d postgres
   docker compose exec postgres sh -c 'until pg_isready -U "$POSTGRES_USER"; do sleep 1; done'
   ```

4. 執行還原（備份檔已含完整 schema、資料與 Prisma migration 歷史）：

   ```bash
   set -a; source .env; set +a
   gunzip -c meetfix-restore.sql.gz | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
   ```

5. 啟動堆疊其餘服務（`api` 的 `prisma migrate deploy` 會看到 migration 都已套用過，不會重跑）：

   ```bash
   docker compose up -d
   ```

此流程已人工驗證：從有種子資料的堆疊取得備份，還原到全新 Postgres 容器後，資料列數與來源一致。

## 停止／重置

```bash
docker compose down          # 停止服務，保留資料
docker compose down -v       # 停止服務並清除資料庫 volume
```
