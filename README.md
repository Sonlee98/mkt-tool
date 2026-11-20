# Apero MktPro — UA Campaign Automation & Realtime Growth Intelligence

Nền tảng quản trị tăng trưởng người dùng (UA) hợp nhất hai phân hệ cốt lõi trên cùng một hạ tầng **Node.js + TypeScript + Fastify v5 + PostgreSQL 17 + Vanilla JS SSE**:
1. **Mass Campaign Launcher (Tạo Camp Hàng Loạt)** cho ứng dụng di động trên **Facebook / Meta Ads (Marketing API v21.0)** và **Google Ads UAC (API v18)**.
2. **Realtime Intraday Report (Báo Cáo Thời Gian Thực)** đồng bộ tức thì theo khung giờ `00:00–23:00` qua **Server-Sent Events (SSE)**.

---

## Tính Năng Nổi Bật

### 1. Mass Campaign Launcher (Tạo Camp Hàng Loạt)
- **Creative Hub & Upload Binary thật**: Hỗ trợ tải lên video `.mp4`/ảnh lên tới `250MB`, tự động băm `SHA-256`, đọc thời lượng/tỷ lệ khung hình MP4 (`mvhd`/`tkhd`) và khử upload trùng lặp theo từng phạm vi tài khoản (`Facebook` / `YouTube` / `GoogleAsset`) thông qua `pg_advisory_xact_lock` + bảng `ad_account_media_cache`.
- **Template & Package Builder**:
  - Quản lý đầy đủ `App Template`, `Page Template`, `Campaign Template`, `Ad Copy Template` và `Tactics`.
  - Kiểm tra chéo (Cross-validation) tự động khi tạo Package: bắt buộc Page cho Facebook, giới hạn $\le 20$ video/Ad Group cho Google UAC, Headline $\le 30$ ký tự (2–5 dòng) và Description $\le 90$ ký tự (1–5 dòng).
- **Dry-Run Matrix Preview & Checkpointed Saga Queue**:
  - Tính toán trước số chiến dịch $N = \lceil |C| / (G \times V) \rceil$, ngân sách dự kiến (`VND` / `USD`), tỷ lệ cache hit và ước tính quota YouTube Data API v3 (`1,600 units/video`).
  - Hàng đợi SQL dùng `FOR UPDATE OF j SKIP LOCKED` chạy song song an toàn (tối đa 4 luồng toàn cục, 2 luồng/tài khoản, tự lùi 60s khi Meta chạm ngưỡng `>= 75%` rate limit), có Idempotency-Key và checkpoint từng bước (`PAUSED` Campaign $\rightarrow$ AdGroup $\rightarrow$ Ad) để Retry không tạo trùng camp.

### 2. Realtime Intraday Report & Data Ingestion
- **9 Thẻ KPI Động & Bảng Cây 3 Cấp**: Tính trực tiếp từ PostgreSQL các chỉ số `Spend`, `Cutoff Rev`, `ROAS`, `PL2`, `%PL2`, `EST ROAS`, `Total Install`, `CPI`, `LTV`, chuỗi `hourly` 24 giờ và bảng phân cấp `Product -> Channel -> Campaign` (quy đổi song song `VND` $\leftrightarrow$ `USD`), kèm **Export CSV** chuẩn UTF-8 BOM.
- **Đa Nguồn Nhập Dữ Liệu Thật**:
  - Webhook realtime chuẩn: `POST /api/v1/webhooks/:source` (`appsflyer`, `adjust`, `facebook`, `tiktok`, `google_ads`, `custom`) hỗ trợ cả chế độ cộng dồn (**Delta Mode**) và ghi đè theo giờ (**Absolute Mode**).
  - Nhập liệu thủ công từ giao diện, Import **CSV / JSON**, và đồng bộ trực tiếp từ link **Google Sheets** (`sync-ggsheet`).
  - **Tách bạch nguồn số liệu Live**: Kênh Quảng cáo (`Facebook`, `TikTok`, `Google Ads` GAQL) chỉ ghi `spend_vnd` (+ `installs`), bảo toàn nguyên vẹn `cohort_rev_vnd` và `cutoff_rev_vnd` do MMP Webhook đẩy về.

### 3. Cầu Chì An Toàn & Bảo Mật Production
- **Mã hóa Token tại DB (`AES-256-GCM`)**: Toàn bộ `access_token`, `refresh_token`, `client_secret` của Ad Account được mã hóa trước khi ghi xuống `ad_accounts` và che giấu toàn bộ khi trả ra API/UI.
- **Google OAuth2 Auto-Refresh & GAQL Insights**: Tự động làm mới `Bearer Access Token` từ `Refresh Token` ở phút thứ 55 và kéo chi phí Google Ads theo ngày qua `googleAds:searchStream`.
- **Chế độ An toàn `launchPaused` & Trần Ngân Sách**: Mặc định giữ chiến dịch mới ở trạng thái `PAUSED` (`OFF`) trên tài khoản Live để Marketer kiểm tra lại trước khi chạy tiền thật; chặn Batch vượt quá `MAX_CAMPAIGN_DAILY_BUDGET_USD` (`$2,000`) hoặc `MAX_BATCH_DAILY_BUDGET_USD` (`$10,000`) nếu chưa tích xác nhận.
- **Xác thực Webhook & Admin**: Kiểm tra chữ ký `WEBHOOK_SECRET` (Bearer Token bằng `crypto.timingSafeEqual`) tại `/api/v1/webhooks/:source` và khóa `x-admin-key` (`ADMIN_API_KEY`) tùy chọn cho các tác vụ quản trị.

---

## Kiến Trúc & Tài Liệu Chi Tiết

```text
apero-mktpro/
├── index.html                        # SPA Shell (Dark/Light theme, Sidebar 14 routes)
├── MKTPRO_APP.html                   # File HTML bundle độc lập (có Offline Fallback)
├── docker-compose.yml                # PostgreSQL 17 Alpine (cổng 5434)
├── build_bundle.ps1                  # Đóng gói CSS + 19 file JS vào MKTPRO_APP.html
├── css/style.css                     # Design System giao diện
├── js/                               # Frontend Vanilla JS (api.js, app.js, charts.js, 15 modules)
├── backend/
│   ├── .env.example                  # Mẫu biến môi trường (Server, DB, Guardrails, OAuth)
│   └── src/
│       ├── server.ts                 # Fastify v5 + SSE Hub + Static Server + Admin Hook
│       ├── db/                       # Schema 17 bảng (schema.sql + schema_bulk.sql) & Seed
│       ├── routes/                   # 9 module REST API & SSE (/api/v1/*)
│       ├── services/                 # BatchPlanner, Intraday, Ingest, MediaProcessor, Telemetry
│       ├── adapters/                 # Dual-mode Adapters (Meta v20/v21, Google Ads v18, TikTok v1.3)
│       ├── workers/                  # SyncWorker (8s tick) & BulkLaunchWorker (SKIP LOCKED)
│       └── utils/                    # AES-256-GCM Vault, Google OAuth2 Refresh, Timezone
├── TAI_LIEU_KIEN_TRUC_HE_THONG.md    # Tài liệu kiến trúc chi tiết FE & BE + sơ đồ Mermaid
└── TAI_LIEU_CHUAN_BI_PRODUCTION.md   # Danh sách tài khoản, Token/API Key & hướng dẫn Go-Live
```

Xem chi tiết:
- [Tài Liệu Kiến Trúc Hệ Thống (FE & BE)](./TAI_LIEU_KIEN_TRUC_HE_THONG.md)
- [Tài Liệu Chuẩn Bị Production (Hạ tầng, Webhook, API Key & Token)](./TAI_LIEU_CHUAN_BI_PRODUCTION.md)

---

## Cài Đặt & Chạy Nhanh (Quick Start)

### Yêu cầu môi trường
- **Node.js** >= 20
- **Docker** (khởi chạy PostgreSQL 17 trên cổng `5434`)

### Bước 1: Khởi động PostgreSQL
```bash
docker compose up -d
```

### Bước 2: Cấu hình môi trường Backend
```bash
cd backend
cp .env.example .env
npm install
```
*(Chỉnh sửa [backend/.env.example](./backend/.env.example) $\rightarrow$ `.env` nếu bạn muốn thay đổi cổng, `TOKEN_ENCRYPTION_KEY`, trần ngân sách hoặc gắn `WEBHOOK_SECRET` / `ADMIN_API_KEY`).*

### Bước 3: Chạy Backend & Giao diện Web
```bash
# Chế độ phát triển (tự reload khi sửa code)
npm run dev

# Hoặc chạy Production / Start trực tiếp
npm run start
```
Khi khởi động, Server sẽ tự chạy migration tạo **17 bảng** và nạp dữ liệu mẫu ban đầu nếu DB trống. Mở trình duyệt tại:
- **`http://localhost:4000`** *(Fastify phục vụ trực tiếp cả Frontend lẫn API/SSE)*
- Hoặc mở trực tiếp **`MKTPRO_APP.html`** để xem giao diện ở chế độ Offline Fallback.

---

## Biến Môi Trường Chính (`backend/.env`)

| Biến | Mặc định | Mô tả |
| :--- | :--- | :--- |
| `PORT` | `4000` | Cổng HTTP cho Backend API, SSE & Static Frontend |
| `DATABASE_URL` | `postgres://apero:apero123@127.0.0.1:5434/apero_mktpro` | Chuỗi kết nối PostgreSQL |
| `TIMEZONE` | `Asia/Ho_Chi_Minh` | Múi giờ chốt khung giờ `00:00–23:00` |
| `EXCHANGE_RATE_VND` | `25718` | Tỷ giá quy đổi `USD` $\leftrightarrow$ `VND` |
| `PLATFORM_FEE_RATE` | `0.0155` | Phí nền tảng dùng tính `PL2` / `%PL2` |
| `MAX_CAMPAIGN_DAILY_BUDGET_USD` | `2000` | Trần ngân sách ngày tối đa mỗi chiến dịch |
| `MAX_BATCH_DAILY_BUDGET_USD` | `10000` | Trần tổng ngân sách ngày tối đa mỗi Batch |
| `TOKEN_ENCRYPTION_KEY` | `apero-mktpro-dev-vault-key-change-in-prod` | Khóa gốc sinh AES-256-GCM key mã hóa Token trong DB |
| `WEBHOOK_SECRET` | *(trống)* | Token xác thực cho `/api/v1/webhooks/:source` |
| `ADMIN_API_KEY` | *(trống)* | Khóa bảo vệ `x-admin-key` cho API cấu hình & bắn camp |
| `PUBLIC_MEDIA_BASE_URL` | *(trống)* | Domain HTTPS công khai để Meta tải video qua `file_url` |

---

## Kiểm Thử Tự Động (E2E) & Đóng Gói

*(Đảm bảo Server đang chạy tại `http://localhost:4000` trước khi chạy các lệnh `verify*`)*

```bash
# Kiểm tra biên dịch TypeScript (trong backend/)
npm run build

# 1. Kiểm thử Realtime Intraday Report & SSE (10 checks)
npm run verify

# 2. Kiểm thử Bulk Campaign Creation & Checkpoint Retry (9 checks)
npm run verify:bulk

# 3. Kiểm thử Bảo mật AES-256-GCM, Budget Guardrails, launchPaused & Webhook Auth (5 checks)
npm run verify:prod
```

Đóng gói lại file HTML độc lập `MKTPRO_APP.html` (chạy tại thư mục gốc `apero-mktpro/` trên Windows PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File .\build_bundle.ps1
powershell -ExecutionPolicy Bypass -File .\verify_bundle.ps1
```
