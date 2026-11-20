-- Apero MktPro Realtime Intraday Schema (PostgreSQL)
-- Safe idempotent migrations (never drops or truncates existing data)

CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(32) PRIMARY KEY,
    division VARCHAR(16) NOT NULL,
    name VARCHAR(255) NOT NULL,
    package_name VARCHAR(255),
    dau_label VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketers (
    id VARCHAR(64) PRIMARY KEY,
    full_name VARCHAR(128) NOT NULL,
    email VARCHAR(128),
    role VARCHAR(128),
    department VARCHAR(128)
);

CREATE TABLE IF NOT EXISTS ad_accounts (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    channel VARCHAR(64) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    balance_usd NUMERIC(14,2) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'Connected',
    access_token TEXT,
    api_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
    id VARCHAR(64) PRIMARY KEY,
    external_campaign_id VARCHAR(64) NOT NULL,
    product_id VARCHAR(32) NOT NULL REFERENCES products(id),
    ad_account_id VARCHAR(64) REFERENCES ad_accounts(id),
    channel VARCHAR(64) NOT NULL,
    marketer_id VARCHAR(64) REFERENCES marketers(id),
    name VARCHAR(255) NOT NULL,
    countries VARCHAR(255) NOT NULL DEFAULT 'Global',
    daily_budget_vnd NUMERIC(18,2) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'ON',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intraday_hourly_metrics (
    metric_date DATE NOT NULL,
    hour_slot SMALLINT NOT NULL CHECK (hour_slot BETWEEN 0 AND 23),
    product_id VARCHAR(32) NOT NULL REFERENCES products(id),
    channel VARCHAR(64) NOT NULL,
    campaign_id VARCHAR(64) NOT NULL REFERENCES campaigns(id),
    country VARCHAR(16) NOT NULL,
    spend_vnd NUMERIC(18,2) NOT NULL DEFAULT 0,
    cohort_rev_vnd NUMERIC(18,2) NOT NULL DEFAULT 0,
    cutoff_rev_vnd NUMERIC(18,2) NOT NULL DEFAULT 0,
    installs INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (metric_date, hour_slot, campaign_id, country)
);

CREATE INDEX IF NOT EXISTS idx_metrics_date_prod_chan
    ON intraday_hourly_metrics (metric_date, product_id, channel);

CREATE INDEX IF NOT EXISTS idx_metrics_campaign_date
    ON intraday_hourly_metrics (campaign_id, metric_date);

CREATE TABLE IF NOT EXISTS telemetry_logs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source VARCHAR(128) NOT NULL,
    status_code SMALLINT NOT NULL DEFAULT 200,
    latency_ms INTEGER NOT NULL DEFAULT 15,
    message TEXT NOT NULL,
    payload_summary JSONB
);

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
