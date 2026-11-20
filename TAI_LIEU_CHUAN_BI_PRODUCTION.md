# Tài Liệu Chuẩn Bị Chạy Thật (Production Checklist)
**Hệ thống:** Apero MktPro — Phân hệ **Tạo Camp Hàng Loạt (Bulk Campaign Creation)** & **Báo Cáo Realtime (Realtime Intraday Report)**  
**Cập nhật:** 20/11/2026

---

## Tổng Quan Kiến Trúc & Dữ Liệu Dùng Chung

Cả hai chức năng chạy trên cùng một Backend (`Node.js + TypeScript + Fastify` tại cổng `4000`) và chung Database PostgreSQL (`apero_mktpro`):

- **Dữ liệu nền dùng chung**: Bảng `products`, `marketers`, `ad_accounts` (cột `access_token` và `api_config`), `campaigns`, `telemetry_logs`, `system_settings`.
- **Cơ chế chuyển chế độ `server_sandbox` $\leftrightarrow$ `live_api`**:
  - Khi `ad_accounts.access_token` **trống** (hoặc `api_config.sandboxOverride = true`), hệ thống chạy ở chế độ mô phỏng `server_sandbox` để test luồng Worker/SSE/Database.
  - Khi điền `access_token` thật (và `api_config` tương ứng với từng kênh) qua trang **Administration** (`POST /api/v1/ad-accounts`), cả **Bulk Launch Adapter** và **Realtime Sync Adapter** tự động chuyển sang gọi API thật của Meta / Google / TikTok.

---

## Phần 1: Hạ Tầng & Tài Khoản Dùng Chung cho cả 2 chức năng

*(Chỉ cần chuẩn bị và cấu hình 1 lần — sử dụng đồng thời cho cả Bắn Camp lẫn Kéo Báo Cáo)*

### 1.1. Hạ tầng Server & Tên miền HTTPS công khai
- **Domain HTTPS (`https://<domain-cua-ban>`)** trỏ về Backend cổng `4000` (qua Nginx hoặc Cloudflare Tunnel):
  1. **Nhận Realtime Webhook/Postback** từ MMP (AppsFlyer / Adjust) và các kênh quảng cáo gửi về `POST https://<domain-cua-ban>/api/v1/webhooks/:source`.
  2. **Cung cấp URL Media công khai (`PUBLIC_MEDIA_BASE_URL`)**: Khi set biến môi trường `PUBLIC_MEDIA_BASE_URL`, hệ thống sẽ gửi `file_url` để Meta tự kéo video `.mp4` qua đường truyền Server-to-Server (nhanh hơn upload binary trực tiếp khi chạy nhiều luồng). Lưu ý chỉ định thư mục tĩnh tại `/uploads/creatives/<ten-file>`.

### 1.2. Tham số Kinh doanh & Quy chuẩn Mã Định Danh (`.env` / `system_settings`)
Tập tin cấu hình hiện tại: `apero-mktpro/backend/.env`

```ini
# --- CẤU HÌNH HIỆN CÓ ---
PORT=4000
DATABASE_URL=postgres://apero:apero123@127.0.0.1:5434/apero_mktpro
TIMEZONE=Asia/Ho_Chi_Minh
SYNC_WORKER_INTERVAL_MS=8000
SYNC_WORKER_ENABLED=true
EXCHANGE_RATE_VND=25718
PLATFORM_FEE_RATE=0.0155

# --- BỔ SUNG KHI LÊN PRODUCTION ---
PUBLIC_MEDIA_BASE_URL=https://<domain-cua-ban>
GOOGLE_ADS_DEVELOPER_TOKEN=<developer-token-duoc-duyet>
WEBHOOK_SECRET=<chuoi-bi-mat-xac-thuc-webhook>
```

- **Quy chuẩn Mã Sản phẩm (`Product ID`)**: Thống nhất 1 mã ngắn (VD: `AIP922`, `AIP886`, `AAP104`...) giữa:
  - Tên/ID sản phẩm trong bảng `products` (`AIP*` thuộc division `AIP`, `AAP*` thuộc division `AAP`),
  - Tiền tố `{product}` trong `naming_template` của Bulk Launch,
  - Trường `productId` / `appId` bắn từ Webhook MMP.
  *(Nhờ đồng nhất mã này, camp mới tạo hàng loạt sẽ tự động đổ số liệu khớp ngay vào cây 3 cấp `Product -> Channel -> Campaign` trên bảng Intraday).*
- **Tỷ giá (`EXCHANGE_RATE_VND`)**: VD `25718` — dùng để quy đổi ngân sách khi tạo camp trên tài khoản USD (Facebook nhân `100` thành cents, Google nhân `1,000,000` thành micros) và quy đổi toàn bảng báo cáo VND $\leftrightarrow$ USD.
- **Tỷ lệ phí nền tảng (`PLATFORM_FEE_RATE`)**: VD `0.0155` (1.55%) — dùng tính `PL2` và `%PL2` trên Intraday Report.
- **Múi giờ (`TIMEZONE`)**: Mặc định `Asia/Ho_Chi_Minh` — phải khớp với múi giờ cài đặt trên Ad Account & MMP để khung giờ `00:00–23:00` (`hour_slot`) không bị lệch ngày chốt sổ.

### 1.3. Tài khoản & API Token Kênh Quảng Cáo
*(Nhập 1 lần tại trang **Administration** $\rightarrow$ Lưu vào bảng `ad_accounts`)*

| Kênh (`channel`) | Thông tin cần chuẩn bị | Quyền (Scopes / Access) bắt buộc cho cả 2 chiều |
| :--- | :--- | :--- |
| **Facebook** *(Meta Marketing API v20/v21)* | 1. **Meta Business App** đã bật sản phẩm *Marketing API* ở chế độ *Live*<br>2. **System User Access Token** (loại vĩnh viễn tạo trong Business Manager, đã gán quyền vào Ad Account & Fanpage)<br>3. Danh sách **Ad Account ID** dạng `act_xxxxxxxxx` + đúng **Currency** (`USD` hoặc `VND`) | - `ads_management` *(Tạo/bật/tắt camp, set adset/ad, upload `advideos`)*<br>- `ads_read` *(Kéo `insights` Spend & Install realtime)*<br>- `business_management`<br>- `pages_show_list`, `pages_read_engagement` |
| **Google Ads** *(UAC — API v18)* | 1. **MCC ID (`login_customer_id`)**: 10 chữ số viết liền, không dấu `-`<br>2. **Developer Token**: đã xin duyệt **Basic Access** hoặc **Standard Access** *(Token Test không chạy được tài khoản thật)*<br>3. Bộ **Google Cloud OAuth2**: `Client ID`, `Client Secret`, `Refresh Token` (và `Access Token` đang dùng)<br>4. Danh sách **Child Customer ID** (10 số) + **Currency** | - OAuth Scope: `https://www.googleapis.com/auth/adwords`<br>*(Dùng cho cả `googleAds:mutate` tạo UAC và đọc báo cáo Spend GAQL)* |
| **TikTok** *(Business API v1.3 — Hiện dùng cho Report)* | 1. **TikTok Marketing API App**<br>2. **Access-Token** dài hạn<br>3. Danh sách **`advertiser_id`** | - Quyền `Reporting` *(Đọc Spend/Conversion trong `report/integrated/get`)* |

**Mẫu JSON cấu hình bổ sung (`api_config`) cho Ad Account Google Ads trong `ad_accounts`:**
```json
{
  "login_customer_id": "1234567890",
  "developer_token": "ABcdefGhiJkl...",
  "youtube_channel_id": "UCxxxxxxxxxxxxxx"
}
```

---

## Phần 2: Thông Tin Riêng cho chức năng Tạo Camp Hàng Loạt (Bulk Campaign Creation)

Các thông tin dưới đây được khai báo tại phân hệ **Template Management** và **Creative Hub** trước khi ghép thành **Package**:

### 2.1. Định danh Ứng dụng & Cửa hàng (`App Template`)
Mỗi App cần tạo bản ghi `app_templates` gồm:
- **`store_type`**: `GOOGLE_PLAY` hoặc `APP_STORE`.
- **`bundle_id`**:
  - Android: Package Name chính xác trên Play Store (VD: `com.apero.aivideo`).
  - iOS: Numeric App Store ID (VD: `6471928310`).
- **`store_url`**: URL đầy đủ trên Google Play / App Store.
- **`platform_app_id`**: Mã **Facebook Application ID** (tạo trên Meta for Developers, đã liên kết SDK/MMP với Ad Account để chạy `OUTCOME_APP_PROMOTION`).
- **Sự kiện tối ưu (`convert_event` & `performance_goal`)**:
  - Facebook: `AD_IMPRESSION` (AdROAS), `PURCHASE` (IAP), hoặc `APP_INSTALL` (`performance_goal`: `MAXIMIZE_INSTALLS` / `MAXIMIZE_VALUE`).
  - Google Ads UAC (`bidding_strategy_goal_type`): VD `OPTIMIZE_INSTALLS_TARGET_INSTALL_COST`, `OPTIMIZE_IN_APP_CONVERSIONS_TARGET_INSTALL_COST`, `OPTIMIZE_RETURN_ON_ADVERTISING_SPEND`.

### 2.2. Định danh Trang Quảng Cáo (`Page Template` — Bắt buộc với Facebook)
- **Facebook Page ID (`page_id`)**: Danh sách Fanpage đại diện sản phẩm (System User phải có quyền *Quản trị / Tạo quảng cáo* trên Page này).
- **Instagram Actor ID (`instagram_actor_id`)** *(tuỳ chọn)*: ID tài khoản Instagram liên kết với Fanpage nếu muốn phân phối thêm vị trí Instagram.

### 2.3. Kho Creative & Tài nguyên Chữ (`Creative Hub` & `Ad Template`)
- **Video / Ảnh Creative**:
  - Định dạng video `.mp4` chuẩn tỷ lệ `9:16`, `1:1`, `16:9`.
  - Khi upload vào `Creative Hub`, Backend tự tính `SHA-256` để chống upload trùng lặp trên cùng Ad Account (`ad_account_media_cache`).
- **Riêng Google Ads UAC — Kênh YouTube `Unlisted` (Bắt buộc)**:
  - Google Ads UAC không upload trực tiếp file `.mp4` vào chiến dịch mà bắt buộc tham chiếu qua **`youtube_video_id`** (chuỗi 11 ký tự) để gọi `assets:mutate` (`type: YOUTUBE_VIDEO`).
  - Cần chuẩn bị **ít nhất 1 kênh YouTube phụ** chuyên đăng video ads ở chế độ **Không công khai (`Unlisted`)**:
    - *Cách 1 (Thủ công/nhanh)*: Upload video lên YouTube Unlisted và dán mã `youtube_video_id` vào Creative.
    - *Cách 2 (Tự động qua API)*: Cấp OAuth scope `https://www.googleapis.com/auth/youtube.upload` và đăng ký **nâng hạn mức YouTube Data API v3 Quota** *(mặc định Google chỉ cấp 10,000 units/ngày $\approx$ tối đa 6 video/ngày vì mỗi lần `videos.insert` tốn 1,600 units)*.
- **Giới hạn cứng của Ad Copy & Nhóm Creative**:
  - Mỗi **Google Ads UAC Ad Group** tối đa **20 videos** (`creative_volume <= 20`).
  - Mỗi **Google Ads UAC Copy Group** bắt buộc:
    - **Headlines**: từ **2 đến 5 câu**, mỗi câu **$\le 30$ ký tự**.
    - **Descriptions**: từ **1 đến 5 câu**, mỗi câu **$\le 90$ ký tự**.

---

## Phần 3: Thông Tin Riêng cho chức năng Báo Cáo Realtime (Realtime Intraday Report)

> **Lưu ý nghiệp vụ quan trọng:** API của Facebook, Google Ads, TikTok **chỉ cung cấp chính xác chi phí quảng cáo (`Spend`)** và lượt cài đặt tự quy cho nền tảng đó. Để hệ thống tính đúng cả 9 thẻ KPI (**Spend, Cutoff Rev, ROAS, PL2, %PL2, EST ROAS, Total Install, CPI, LTV**) và **Cohort Rev D0**, bắt buộc phải có **luồng Doanh thu & Attribution từ MMP/Mediation**.

### 3.1. Kết nối MMP Real-time Postback / Webhook *(Luồng chính cho Production)*
- **Tài khoản MMP (AppsFlyer hoặc Adjust)** đã tích hợp SDK trong App:
  - Bật **AppsFlyer Push API** hoặc **Adjust Real-time Callbacks** đẩy về endpoint của hệ thống:
    - `POST https://<domain-cua-ban>/api/v1/webhooks/appsflyer`
    - `POST https://<domain-cua-ban>/api/v1/webhooks/adjust`
    - hoặc `POST https://<domain-cua-ban>/api/v1/webhooks/custom`
  - **Các trường dữ liệu cần map trong Webhook Payload**:
    - Định danh: `productId` (hoặc `appId`), `channel`, `campaignId` / `externalCampaignId` / `campaignName`, `country` (mã ISO 2 ký tự như `US`, `BR`, `JP`...), `date` (`YYYY-MM-DD`), `hourSlot` (`0..23`).
    - Chỉ số (hỗ trợ **cả 2 chế độ**):
      - **Chế độ cộng dồn sự kiện (Delta Mode — khuyên dùng cho MMP/Postback realtime)**: `installsDelta`, `cohortRevDeltaVnd`, `cutoffRevDeltaVnd`, `spendDeltaVnd`. Hệ thống tự `ON CONFLICT DO UPDATE` cộng dồn an toàn vào đúng khung giờ `(metric_date, hour_slot, campaign_id, country)`.
      - **Chế độ chốt số tuyệt đối theo giờ (Absolute Mode — dùng cho sync theo lô/BI)**: `spendVnd`, `cohortRevVnd` (hoặc `revenueVnd`), `cutoffRevVnd`, `installs`.

**Ví dụ JSON Payload chuẩn gửi vào `POST /api/v1/webhooks/appsflyer`:**
```json
{
  "events": [
    {
      "productId": "AIP922",
      "channel": "Facebook",
      "externalCampaignId": "12021459820123",
      "campaignName": "AIP922_FB_US_Hook01_EN_261120_1",
      "country": "US",
      "date": "2026-11-20",
      "hourSlot": 15,
      "installsDelta": 1,
      "cohortRevDeltaVnd": 18500,
      "cutoffRevDeltaVnd": 21000
    }
  ]
}
```

### 3.2. Kết nối Doanh thu Quảng cáo trong App (ILRD) & Mua gói (IAP)
Để MMP hoặc BI Server nội bộ có số doanh thu realtime gửi sang Webhook trên, cần:
- **Ad Mediation ILRD (Impression-Level Revenue Data)**: Nối **AppLovin MAX** hoặc **Google AdMob** với MMP (AppsFlyer / Adjust Ad Revenue) để bắn doanh thu quảng cáo từng user xem ad theo thời gian thực.
- **In-App Purchase (IAP)**: Bật Server-to-Server notification từ **Google Play Billing / App Store Server Notifications** (hoặc **RevenueCat**) sang MMP/BI.

### 3.3. Nguồn Nhập Bổ Trợ / Đối Soát *(Tuỳ chọn)*
Trong trường hợp một số kênh chưa gắn xong API/Webhook, hệ thống hỗ trợ sẵn:
- **Link Google Sheets Live Sync**: File Google Sheet bật quyền *"Anyone with the link can view"* hoặc *"Publish to Web (CSV)"* để kéo bất cứ lúc nào từ nút **GGSheet** (`POST /api/v1/intraday/sync-ggsheet`).
- **Import CSV / JSON**: File xuất có dòng tiêu đề chuẩn:
  ```csv
  Product,Channel,CampaignName,CampaignId,Countries,Budget,Spend,Revenue,Installs,Marketer
  ```

---

## Phần 4: 4 Điểm Kỹ Thuật Cần Bật Ngay Khi Có Bộ Token Thật

Khi bạn chuẩn bị xong các thông tin ở Phần 1–3, cần mở rộng thêm 4 điểm kỹ thuật nhỏ trong code trước khi chạy ngân sách lớn:

1. **Auto-Refresh Google OAuth Token**: `access_token` của Google chỉ có hạn 60 phút — bổ sung hàm tự động gọi `https://oauth2.googleapis.com/token` bằng `client_id`, `client_secret`, `refresh_token` để gia hạn mỗi 55 phút trước khi gọi Google Ads API.
2. **Nối luồng đọc Spend trực tiếp cho Google Ads (GAQL)**: Hiện `fetchLivePlatformInsights` trong `apero-mktpro/backend/src/adapters/adPlatformAdapters.ts` đã viết sẵn API đọc insights cho `Facebook` và `TikTok`; cần bổ sung truy vấn `googleAds:searchStream` cho `Google Ads` (và `Mintegral` nếu chạy) để tự động kéo `Spend` theo giờ về bảng Intraday.
3. **Tách bạch nguồn ghi `Spend` vs `Revenue/Installs` ở chế độ Live**: Bỏ hệ số nhân doanh thu tạm thời trong `fetchLivePlatformInsights` (`adPlatformAdapters.ts`) khi chạy Live để *Ad Network API chỉ cập nhật `Spend`*, còn *MMP Webhook chỉ cập nhật `Installs`, `Cohort Rev` và `Cutoff Rev`*, tránh ghi đè chéo dữ liệu thật.
4. **Cầu chì an toàn Production**:
   - Bật kiểm tra header chữ ký/`WEBHOOK_SECRET` trên `POST /api/v1/webhooks/:source`.
   - Thêm tùy chọn *"Giữ trạng thái `PAUSED` sau khi tạo xong Batch"* để Marketer kiểm tra lại Target/Ngân sách trên Ads Manager trước khi bật `ACTIVE`.

---

## Phần 5: Danh Mục Riêng Các Loại API Key, Token & Secret Cần Chuẩn Bị

Mục này tách riêng toàn bộ khóa xác thực (Credentials) cần chuẩn bị để bạn tiện bàn giao cho đội DevOps / Media / BI xin cấp quyền một lần.

### 5.1. Bảng Checklist Tổng Hợp Token & API Key

| # | Tên Token / API Key | Nơi lấy | Thời hạn | Nơi lưu trên hệ thống | Mục đích sử dụng | Mức độ |
| :-: | :--- | :--- | :--- | :--- | :--- | :---: |
| **1** | **Meta System User Access Token** | Meta Business Manager → *System Users* | Vĩnh viễn *(không hết hạn)* | Bảng `ad_accounts` (cột `access_token` qua trang *Administration*) | Tạo camp/adset/ad, upload `advideos` & kéo Spend Facebook | **Bắt buộc** |
| **2** | **Meta Business App (`App ID` & `App Secret`)** | Meta for Developers *(chế độ Live)* | Vĩnh viễn | Quản lý tập trung trên Meta BM *(gắn kèm System User)* | Định danh App chạy *Marketing API* hợp lệ | **Bắt buộc** |
| **3** | **Google Ads `Developer Token`** *(22 ký tự)* | Google Ads MCC → *Tools → API Center* | Vĩnh viễn *(cần duyệt Basic/Standard)* | File `backend/.env` (`GOOGLE_ADS_DEVELOPER_TOKEN`) hoặc `ad_accounts.api_config` | Header `developer-token` bắt buộc khi gọi Google Ads API v18 | **Bắt buộc** |
| **4** | **Google OAuth2 `Client ID` & `Client Secret`** | Google Cloud Console → *Credentials* | Vĩnh viễn | Cấu hình Server / `.env` *(cho luồng Auto-Refresh)* | Định danh ứng dụng OAuth2 xin cấp `Access Token` | **Bắt buộc** |
| **5** | **Google OAuth2 `Refresh Token`** | Sinh qua OAuth2 Playground / Consent Flow | Vĩnh viễn *(khi App ở chế độ In Production)* | `ad_accounts.api_config` / Vault bảo mật | Tự động đổi `Bearer Access Token` mới mỗi ~55–60 phút | **Bắt buộc** |
| **6** | **Webhook Auth Secret (`WEBHOOK_SECRET`)** | Tự sinh chuỗi ngẫu nhiên (32–64 ký tự) | Vĩnh viễn | File `backend/.env` + Header trên MMP *(AppsFlyer/Adjust)* | Xác thực `Authorization: Bearer <secret>` vào `/api/v1/webhooks/:source` | **Bắt buộc** |
| **7** | **TikTok Business `Access-Token`** *(kèm `App ID`, `Secret`)* | TikTok for Business Developers Portal | Dài hạn | Bảng `ad_accounts` (`access_token`, gắn với `advertiser_id`) | Kéo Spend & Conversion vào Realtime Intraday Report | *Nếu chạy TikTok* |
| **8** | **Mintegral `API Key` & `API Secret`** | Mintegral Advertiser Dashboard | Vĩnh viễn | Bảng `ad_accounts` (`api_config`) | Kéo Spend Mintegral vào Realtime Intraday Report | *Nếu chạy Mintegral* |
| **9** | **AppsFlyer API V2 Token / Adjust API Token** | Dashboard AppsFlyer / Adjust | Vĩnh viễn | File `.env` / Script đối soát cuối ngày | Kéo bù số liệu lịch sử `T-1`, `T-2`, `T-3` nếu lỡ gói Webhook | *Khuyên có* |
| **10** | **AppLovin MAX `Report Key` / Google AdMob OAuth** | AppLovin MAX Dashboard / Google AdMob | Vĩnh viễn | Nhập trực tiếp trên Dashboard AppsFlyer/Adjust | Đồng bộ doanh thu quảng cáo từng lượt hiển thị (**ILRD**) về MMP | *Khuyên có* |
| **11** | **Google Service Account JSON Key** | Google Cloud Console → *Service Accounts* | Vĩnh viễn | File JSON trên Server *(chỉ khi khóa quyền Sheet)* | Đọc Google Sheets riêng tư *(không cần nếu Sheet mở link view/CSV)* | *Tuỳ chọn* |

### 5.2. Chi Tiết Quyền (Scopes) & Lưu Ý Kỹ Thuật Từng Loại Khóa

1. **Facebook / Meta Ads (`System User Access Token`)**:
   - **Không dùng** User Token cá nhân lấy nhanh trên Graph API Explorer vì token cá nhân hết hạn sau 1 giờ – 60 ngày và sẽ làm sập cả worker bắn camp lẫn worker báo cáo.
   - Tạo **System User** (vai trò *Admin*) trong Business Manager, gán quyền truy cập vào đầy đủ Ad Accounts (`act_...`) và Fanpages, sau đó sinh token **Never Expire** với **5 scopes bắt buộc**:
     - `ads_management` — Tạo/sửa/bật/tắt Campaign, AdSet, AdCreative, Ad và upload video (`advideos`).
     - `ads_read` — Đọc chỉ số `insights` (Spend, Install) theo ngày/giờ.
     - `business_management` — Truy vấn tài nguyên trong Business Manager.
     - `pages_show_list` & `pages_read_engagement` — Đọc và gắn danh sách Fanpage đại diện khi tạo quảng cáo.

2. **Google Ads (`Bộ 4 khóa OAuth2 + Developer Token`)**:
   - **Developer Token**: Token mặc định khi mới tạo chỉ là *Test Account* (sẽ lỗi nếu gọi Ad Account thật). Cần điền form trên Google Ads API Center để xin tối thiểu **Basic Access** *(miễn phí, cấp 15,000 operations/ngày)* hoặc **Standard Access** *(không giới hạn)*.
   - **OAuth Consent Screen phải ở trạng thái `In Production`**: Nếu giữ trạng thái *Testing* trên Google Cloud Console, `Refresh Token` sẽ tự động bị thu hồi sau đúng **7 ngày**.
   - **Scopes cần cấp khi lấy `Refresh Token`**:
     - `https://www.googleapis.com/auth/adwords` *(Bắt buộc — dùng cho cả tạo chiến dịch UAC v18 lẫn truy vấn GAQL Spend)*.
     - `https://www.googleapis.com/auth/youtube.upload` *(Tuỳ chọn — chỉ cần nếu muốn hệ thống tự đẩy file `.mp4` lên kênh YouTube `Unlisted`, kèm xin nâng trần YouTube Data API v3 Quota trên mức mặc định 10,000 units/ngày)*.
   - **Lưu ý vòng đời Access Token**: `Bearer Access Token` của Google hết hạn đúng sau **60 phút**; Backend cần dùng `Client ID + Client Secret + Refresh Token` để tự làm mới mỗi 55 phút.

3. **TikTok Ads & Mintegral *(Phục vụ Realtime Report)***:
   - **TikTok**: Dùng `Access-Token` sinh qua luồng OAuth TikTok Marketing API v1.3, tích tối thiểu quyền **Reporting** *(tích thêm **Ad Account Management** nếu tương lai mở rộng bắn camp TikTok)*.
   - **Mintegral**: Lấy cặp `API Key` (SKey) và `Secret` trong tài khoản Advertiser để ký header xác thực khi kéo Spend theo ngày/giờ.

4. **MMP, ILRD & Bảo mật Webhook (`WEBHOOK_SECRET`)**:
   - **`WEBHOOK_SECRET`**: Bạn tự tạo chuỗi ngẫu nhiên (VD: `apr_wh_live_...`), cấu hình vào `backend/.env` và gắn vào **Custom HTTP Header** (`Authorization: Bearer <WEBHOOK_SECRET>`) trên **AppsFlyer Push API** / **Adjust Real-time Callbacks** để chặn request giả mạo từ bên ngoài bắn sai lệch báo cáo.
   - **Key Mediation (AppLovin MAX / AdMob)**: Không cần nhập vào Apero MktPro — chỉ cần dán vào phần *Ad Revenue / ILRD Integration* trên Dashboard của MMP (AppsFlyer/Adjust) để MMP thu được doanh thu quảng cáo in-app và đẩy gộp sang Webhook `/api/v1/webhooks/:source`.
   - **Google Sheets**: Nếu file Sheet đối soát đã bật *"Anyone with the link can view"* hoặc *"Publish to Web (CSV)"* thì nút `GGSheet` kéo trực tiếp không cần bất kỳ API Key nào; chỉ cần `Service Account JSON` khi yêu cầu bảo mật nội bộ không cho mở link xem.

