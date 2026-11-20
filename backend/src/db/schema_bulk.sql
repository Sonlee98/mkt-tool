-- Apero MktPro Bulk Campaign Launcher Schema (Meta Marketing API & Google Ads UAC)
-- Safe idempotent migrations extending base schema.sql without breaking Realtime Report

ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS package_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS source_job_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS creative_ids TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS tactic_ids TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_campaigns_product_channel ON campaigns (product_id, channel);

-- 1. Creatives Hub Table
CREATE TABLE IF NOT EXISTS creatives (
    id                      VARCHAR(64) PRIMARY KEY,
    title                   VARCHAR(255) NOT NULL,
    file_name               VARCHAR(255) NOT NULL,
    sha256_hash             VARCHAR(64) NOT NULL,
    storage_path            TEXT NOT NULL,
    public_url              TEXT,
    thumb_url               TEXT,
    poster_gradient         VARCHAR(160) NOT NULL DEFAULT 'linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)',
    media_type              VARCHAR(16) NOT NULL DEFAULT 'VIDEO',
    visibility              VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
    duration_sec            NUMERIC(8,2) NOT NULL DEFAULT 15,
    duration_label          VARCHAR(16) NOT NULL DEFAULT '00:15',
    width                   INT NOT NULL DEFAULT 1080,
    height                  INT NOT NULL DEFAULT 1920,
    aspect_ratio            VARCHAR(16) NOT NULL DEFAULT '9:16',
    size_label              VARCHAR(32) NOT NULL DEFAULT '1.50 MB',
    file_size_bytes         BIGINT NOT NULL DEFAULT 0,
    product_id              VARCHAR(32) NOT NULL REFERENCES products(id),
    angle_code              VARCHAR(80),
    language_code           VARCHAR(64),
    market_target           VARCHAR(120),
    tiktok_policy           VARCHAR(32) NOT NULL DEFAULT 'Passed',
    tiktok_policy_reason    TEXT,
    meta_policy             VARCHAR(32) NOT NULL DEFAULT 'Approved',
    meta_policy_reason      TEXT,
    google_policy           VARCHAR(32) NOT NULL DEFAULT 'Approved',
    youtube_video_id        VARCHAR(32),
    campaign_success_count  INT NOT NULL DEFAULT 0,
    campaign_failed_count   INT NOT NULL DEFAULT 0,
    creator_id              VARCHAR(64) REFERENCES marketers(id),
    creator_name            VARCHAR(128) NOT NULL DEFAULT 'Đồng Quỳnh Trang',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creatives_product_created ON creatives (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creatives_sha256 ON creatives (sha256_hash);

-- 2. Per-Scope Media Upload Deduplication Cache
-- channel: 'Facebook' (scope_key = ad_account_id) | 'YouTube' (scope_key = youtube_channel_id) | 'GoogleAsset' (scope_key = ad_account_id)
CREATE TABLE IF NOT EXISTS ad_account_media_cache (
    id                  BIGSERIAL PRIMARY KEY,
    channel             VARCHAR(32) NOT NULL,
    scope_key           VARCHAR(64) NOT NULL,
    creative_sha256     VARCHAR(64) NOT NULL,
    remote_media_id     VARCHAR(128),
    remote_asset_rn     VARCHAR(255),
    status              VARCHAR(24) NOT NULL DEFAULT 'READY',
    error_message       TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (channel, scope_key, creative_sha256)
);

-- 3. Application Templates
CREATE TABLE IF NOT EXISTS app_templates (
    id              VARCHAR(64) PRIMARY KEY,
    name            VARCHAR(180) NOT NULL,
    channel         VARCHAR(32) NOT NULL,
    product_id      VARCHAR(32) NOT NULL REFERENCES products(id),
    store_type      VARCHAR(24) NOT NULL DEFAULT 'GOOGLE_PLAY',
    platform_app_id VARCHAR(128) NOT NULL,
    bundle_id       VARCHAR(180) NOT NULL,
    store_url       TEXT NOT NULL,
    link_status     VARCHAR(24) NOT NULL DEFAULT 'Linked',
    created_by      VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Page Templates (Facebook Identity)
CREATE TABLE IF NOT EXISTS page_templates (
    id                  VARCHAR(64) PRIMARY KEY,
    name                VARCHAR(180) NOT NULL,
    channel             VARCHAR(32) NOT NULL DEFAULT 'Facebook',
    page_id             VARCHAR(64) NOT NULL,
    instagram_actor_id  VARCHAR(64),
    app_template_id     VARCHAR(64) REFERENCES app_templates(id),
    status              VARCHAR(24) NOT NULL DEFAULT 'Active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Campaign Templates
CREATE TABLE IF NOT EXISTS campaign_templates (
    id                  VARCHAR(64) PRIMARY KEY,
    name                VARCHAR(200) NOT NULL,
    channel             VARCHAR(32) NOT NULL,
    buying_type         VARCHAR(32) NOT NULL DEFAULT 'Auction',
    objective           VARCHAR(64) NOT NULL DEFAULT 'App Promotion',
    performance_goal    VARCHAR(64) NOT NULL,
    convert_event       VARCHAR(64) DEFAULT 'AD_IMPRESSION',
    roas_goal           NUMERIC(8,2),
    target_cpa          NUMERIC(14,4),
    budget_amount       NUMERIC(18,2) NOT NULL,
    budget_currency     VARCHAR(8) NOT NULL DEFAULT 'VND',
    budget_level        VARCHAR(24) NOT NULL DEFAULT 'CAMPAIGN_CBO',
    ad_group_volume     INT NOT NULL DEFAULT 1 CHECK (ad_group_volume BETWEEN 1 AND 50),
    creative_volume     INT NOT NULL DEFAULT 1 CHECK (creative_volume BETWEEN 1 AND 50),
    is_worldwide        BOOLEAN NOT NULL DEFAULT FALSE,
    country_codes       TEXT[] NOT NULL DEFAULT '{}',
    language_codes      TEXT[] NOT NULL DEFAULT '{}',
    attribution_window  VARCHAR(64) DEFAULT '1-day click',
    is_ai_media         BOOLEAN NOT NULL DEFAULT FALSE,
    platform_extras     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by          VARCHAR(64),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Ad Templates (Facebook Multi-copy & Google Ads UAC Copy Groups)
CREATE TABLE IF NOT EXISTS ad_templates (
    id              VARCHAR(64) PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    channel         VARCHAR(32) NOT NULL,
    objective       VARCHAR(64) NOT NULL DEFAULT 'App Promotion',
    format          VARCHAR(64) NOT NULL DEFAULT 'Single Video (9:16)',
    cta_type        VARCHAR(48) DEFAULT 'INSTALL_MOBILE_APP',
    copy_payload    JSONB NOT NULL,
    created_by      VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Tactics
CREATE TABLE IF NOT EXISTS tactics (
    id              VARCHAR(64) PRIMARY KEY,
    name            VARCHAR(180) NOT NULL,
    description     TEXT,
    rules_payload   JSONB NOT NULL DEFAULT '[]'::jsonb,
    owner_id        VARCHAR(64),
    owner_name      VARCHAR(128) NOT NULL DEFAULT 'Nguyễn Công Hoàng',
    status          VARCHAR(24) NOT NULL DEFAULT 'Active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Packages
CREATE TABLE IF NOT EXISTS packages (
    id                      VARCHAR(64) PRIMARY KEY,
    name                    VARCHAR(220) NOT NULL,
    channel                 VARCHAR(32) NOT NULL,
    app_template_id         VARCHAR(64) NOT NULL REFERENCES app_templates(id),
    campaign_template_id    VARCHAR(64) NOT NULL REFERENCES campaign_templates(id),
    ad_template_id          VARCHAR(64) NOT NULL REFERENCES ad_templates(id),
    page_template_id        VARCHAR(64) REFERENCES page_templates(id),
    ad_account_id           VARCHAR(64) NOT NULL REFERENCES ad_accounts(id),
    tactic_ids              TEXT[] NOT NULL DEFAULT '{}',
    naming_template         VARCHAR(255) NOT NULL DEFAULT '{product}_{channel}_{geo}_{angle}_{lang}_{pkg_tag}_{acc_short}_{date}_{idx}',
    status                  VARCHAR(24) NOT NULL DEFAULT 'Running',
    created_by              VARCHAR(64),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Bulk Launch Batches & Checkpointed SQL Queue Jobs
CREATE TABLE IF NOT EXISTS bulk_launch_batches (
    id                      VARCHAR(64) PRIMARY KEY,
    idempotency_key         VARCHAR(128) NOT NULL UNIQUE,
    created_by              VARCHAR(64),
    selected_creative_ids   TEXT[] NOT NULL,
    selected_package_ids    TEXT[] NOT NULL,
    total_jobs              INT NOT NULL,
    succeeded_jobs          INT NOT NULL DEFAULT 0,
    failed_jobs             INT NOT NULL DEFAULT 0,
    status                  VARCHAR(24) NOT NULL DEFAULT 'RUNNING',
    options                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS campaign_launch_jobs (
    id                      VARCHAR(64) PRIMARY KEY,
    batch_id                VARCHAR(64) NOT NULL REFERENCES bulk_launch_batches(id) ON DELETE CASCADE,
    package_id              VARCHAR(64) NOT NULL REFERENCES packages(id),
    ad_account_id           VARCHAR(64) NOT NULL REFERENCES ad_accounts(id),
    product_id              VARCHAR(32) NOT NULL REFERENCES products(id),
    channel                 VARCHAR(32) NOT NULL,
    planned_campaign_name   VARCHAR(255) NOT NULL,
    creative_allocation     JSONB NOT NULL,
    current_step            VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
    status                  VARCHAR(24) NOT NULL DEFAULT 'QUEUED',
    execution_mode          VARCHAR(24) NOT NULL DEFAULT 'server_sandbox',
    platform_campaign_id    VARCHAR(128),
    platform_budget_rn      VARCHAR(255),
    platform_adgroup_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
    platform_ad_ids         JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_step              VARCHAR(40),
    error_code              VARCHAR(64),
    error_message           TEXT,
    is_retryable            BOOLEAN NOT NULL DEFAULT TRUE,
    attempt_count           INT NOT NULL DEFAULT 0,
    next_run_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at               TIMESTAMPTZ,
    started_at              TIMESTAMPTZ,
    finished_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_launch_jobs_poll
    ON campaign_launch_jobs (status, next_run_at, ad_account_id)
    WHERE status = 'QUEUED';

CREATE INDEX IF NOT EXISTS idx_launch_jobs_batch
    ON campaign_launch_jobs (batch_id, created_at);
