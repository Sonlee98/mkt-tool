import type { Pool } from 'pg';
import { config } from '../config.js';
import { getNowInTz, shiftDate } from '../utils/time.js';

interface SeedCampaignSpec {
    id: string;
    externalId: string;
    productId: string;
    adAccountId: string | null;
    channel: string;
    marketerId: string;
    name: string;
    countriesText: string;
    budgetVnd: number;
    dailySpendVnd: number;
    roasTarget: number;      // e.g. 1.18 = 118%
    cutoffMultiplier: number; // cutoff_rev / cohort_rev (or direct daily cutoff if spend=0)
    cpiVnd: number;
    countrySplits: Array<{ country: string; share: number }>;
}

const HOURLY_WEIGHTS = [
    0.020, 0.018, 0.015, 0.013, 0.015, 0.022,
    0.032, 0.042, 0.053, 0.060, 0.068, 0.071,
    0.067, 0.065, 0.069, 0.073, 0.077, 0.075,
    0.070, 0.064, 0.052, 0.045, 0.036, 0.028
];
const WEIGHT_SUM = HOURLY_WEIGHTS.reduce((a, b) => a + b, 0);

const CAMPAIGNS: SeedCampaignSpec[] = [
    // AIP922 - Nexus AI Video Generator
    {
        id: 'cmp_928174102',
        externalId: '#6',
        productId: 'AIP922',
        adAccountId: 'act_102938401',
        channel: 'Facebook',
        marketerId: 'HoangNC',
        name: 'AIP922_FB_US_VideoHug_Tier1_CBO',
        countriesText: 'US, CA, AU',
        budgetVnd: 45_000_000,
        dailySpendVnd: 38_500_000,
        roasTarget: 1.185,
        cutoffMultiplier: 1.14,
        cpiVnd: 4850,
        countrySplits: [
            { country: 'US', share: 0.65 },
            { country: 'CA', share: 0.20 },
            { country: 'AU', share: 0.15 }
        ]
    },
    {
        id: 'cmp_928174109',
        externalId: '#22',
        productId: 'AIP922',
        adAccountId: 'act_102938402',
        channel: 'Facebook',
        marketerId: 'TrangDQ',
        name: 'AIP922_FB_LATAM_Transformation_Auto',
        countriesText: 'PE, CO, MX',
        budgetVnd: 50_000_000,
        dailySpendVnd: 44_000_000,
        roasTarget: 1.015,
        cutoffMultiplier: 1.16,
        cpiVnd: 2790,
        countrySplits: [
            { country: 'PE', share: 0.55 },
            { country: 'CO', share: 0.25 },
            { country: 'MX', share: 0.20 }
        ]
    },
    {
        id: 'cmp_928174115',
        externalId: '#123',
        productId: 'AIP922',
        adAccountId: 'act_102938402',
        channel: 'Facebook',
        marketerId: 'PhuongNTK',
        name: 'AIP922_FB_SEA_HindiMix_Scale',
        countriesText: 'IN, VN, PH',
        budgetVnd: 58_000_000,
        dailySpendVnd: 51_500_000,
        roasTarget: 0.945,
        cutoffMultiplier: 1.18,
        cpiVnd: 4120,
        countrySplits: [
            { country: 'IN', share: 0.55 },
            { country: 'VN', share: 0.25 },
            { country: 'PH', share: 0.20 }
        ]
    },
    {
        id: 'cmp_tt_922_01',
        externalId: '#201',
        productId: 'AIP922',
        adAccountId: 'act_719284109',
        channel: 'TikTok',
        marketerId: 'TrangDQ',
        name: 'AIP922_TikTok_Global_ViralDance_V2',
        countriesText: 'US, PE, IN',
        budgetVnd: 48_000_000,
        dailySpendVnd: 42_000_000,
        roasTarget: 1.068,
        cutoffMultiplier: 1.15,
        cpiVnd: 3520,
        countrySplits: [
            { country: 'US', share: 0.45 },
            { country: 'PE', share: 0.30 },
            { country: 'IN', share: 0.25 }
        ]
    },
    {
        id: 'cmp_gg_922_01',
        externalId: '#301',
        productId: 'AIP922',
        adAccountId: 'act_829104820',
        channel: 'Google Ads',
        marketerId: 'HoangNC',
        name: 'AIP922_UAC_US_HighIntent_tROAS',
        countriesText: 'US, CA',
        budgetVnd: 18_000_000,
        dailySpendVnd: 14_500_000,
        roasTarget: 1.095,
        cutoffMultiplier: 1.12,
        cpiVnd: 4450,
        countrySplits: [
            { country: 'US', share: 0.78 },
            { country: 'CA', share: 0.22 }
        ]
    },
    {
        id: 'cmp_org_922',
        externalId: 'ORG-922',
        productId: 'AIP922',
        adAccountId: null,
        channel: 'Organic',
        marketerId: 'MinhTV',
        name: 'AIP922_Organic_Store_Search',
        countriesText: 'US, IN, VN',
        budgetVnd: 0,
        dailySpendVnd: 0,
        roasTarget: 0,
        cutoffMultiplier: 19_500_000, // direct daily cutoff rev VND when spend=0
        cpiVnd: 0,
        countrySplits: [
            { country: 'US', share: 0.45 },
            { country: 'IN', share: 0.35 },
            { country: 'VN', share: 0.20 }
        ]
    },
    {
        id: 'cmp_med_922',
        externalId: 'MED-922',
        productId: 'AIP922',
        adAccountId: null,
        channel: 'Mediation',
        marketerId: 'MinhTV',
        name: 'AIP922_AppLovin_MAX_AdRevenue',
        countriesText: 'US, PE, IN',
        budgetVnd: 0,
        dailySpendVnd: 0,
        roasTarget: 0,
        cutoffMultiplier: 14_800_000,
        cpiVnd: 0,
        countrySplits: [
            { country: 'US', share: 0.50 },
            { country: 'PE', share: 0.25 },
            { country: 'IN', share: 0.25 }
        ]
    },

    // AIP886 - Framly - AI Photo Video Maker
    {
        id: 'cmp_fb_886_01',
        externalId: '#412',
        productId: 'AIP886',
        adAccountId: 'act_102938401',
        channel: 'Facebook',
        marketerId: 'PhuongNTK',
        name: 'AIP886_FB_US_PhotoRestore_Split',
        countriesText: 'US, CA',
        budgetVnd: 42_000_000,
        dailySpendVnd: 36_000_000,
        roasTarget: 1.045,
        cutoffMultiplier: 1.15,
        cpiVnd: 3890,
        countrySplits: [
            { country: 'US', share: 0.75 },
            { country: 'CA', share: 0.25 }
        ]
    },
    {
        id: 'cmp_tt_886_01',
        externalId: '#418',
        productId: 'AIP886',
        adAccountId: 'act_719284109',
        channel: 'TikTok',
        marketerId: 'TrangDQ',
        name: 'AIP886_TikTok_LATAM_FaceDance',
        countriesText: 'PE, CO',
        budgetVnd: 32_000_000,
        dailySpendVnd: 27_000_000,
        roasTarget: 0.965,
        cutoffMultiplier: 1.14,
        cpiVnd: 2950,
        countrySplits: [
            { country: 'PE', share: 0.65 },
            { country: 'CO', share: 0.35 }
        ]
    },
    {
        id: 'cmp_mtg_886_01',
        externalId: '#425',
        productId: 'AIP886',
        adAccountId: 'act_552910481',
        channel: 'Mintegral',
        marketerId: 'LienDT',
        name: 'AIP886_Mintegral_SEA_Enhancer',
        countriesText: 'IN, VN, PH',
        budgetVnd: 20_000_000,
        dailySpendVnd: 16_000_000,
        roasTarget: 0.992,
        cutoffMultiplier: 1.12,
        cpiVnd: 2650,
        countrySplits: [
            { country: 'IN', share: 0.50 },
            { country: 'VN', share: 0.30 },
            { country: 'PH', share: 0.20 }
        ]
    },
    {
        id: 'cmp_org_886',
        externalId: 'ORG-886',
        productId: 'AIP886',
        adAccountId: null,
        channel: 'Organic',
        marketerId: 'MinhTV',
        name: 'AIP886_Organic_Baseline',
        countriesText: 'US, IN',
        budgetVnd: 0,
        dailySpendVnd: 0,
        roasTarget: 0,
        cutoffMultiplier: 9_600_000,
        cpiVnd: 0,
        countrySplits: [
            { country: 'US', share: 0.55 },
            { country: 'IN', share: 0.45 }
        ]
    },

    // AIP919 - GeniAI: Photo & Video Creator
    {
        id: 'cmp_fb_919_01',
        externalId: '#508',
        productId: 'AIP919',
        adAccountId: 'act_102938401',
        channel: 'Facebook',
        marketerId: 'HoangNC',
        name: 'AIP919_FB_US_AnimeMorph_CBO',
        countriesText: 'US, AU',
        budgetVnd: 35_000_000,
        dailySpendVnd: 29_500_000,
        roasTarget: 0.985,
        cutoffMultiplier: 1.14,
        cpiVnd: 3750,
        countrySplits: [
            { country: 'US', share: 0.80 },
            { country: 'AU', share: 0.20 }
        ]
    },
    {
        id: 'cmp_gg_919_01',
        externalId: '#512',
        productId: 'AIP919',
        adAccountId: 'act_829104820',
        channel: 'Google Ads',
        marketerId: 'LienDT',
        name: 'AIP919_UAC_SEA_ChatbotVideo',
        countriesText: 'IN, VN',
        budgetVnd: 22_000_000,
        dailySpendVnd: 18_500_000,
        roasTarget: 1.028,
        cutoffMultiplier: 1.13,
        cpiVnd: 3120,
        countrySplits: [
            { country: 'IN', share: 0.60 },
            { country: 'VN', share: 0.40 }
        ]
    },

    // AAP885 - CloutDrama: AI Short Drama
    {
        id: 'cmp_fb_885_01',
        externalId: '#604',
        productId: 'AAP885',
        adAccountId: 'act_102938401',
        channel: 'Facebook',
        marketerId: 'TrangDQ',
        name: 'AAP885_FB_US_RevengeCEO_Ep1',
        countriesText: 'US, CA',
        budgetVnd: 28_000_000,
        dailySpendVnd: 23_500_000,
        roasTarget: 1.088,
        cutoffMultiplier: 1.16,
        cpiVnd: 5400,
        countrySplits: [
            { country: 'US', share: 0.82 },
            { country: 'CA', share: 0.18 }
        ]
    },
    {
        id: 'cmp_tt_885_01',
        externalId: '#611',
        productId: 'AAP885',
        adAccountId: 'act_719284109',
        channel: 'TikTok',
        marketerId: 'PhuongNTK',
        name: 'AAP885_TikTok_LATAM_ShortDrama',
        countriesText: 'PE, MX',
        budgetVnd: 18_000_000,
        dailySpendVnd: 14_000_000,
        roasTarget: 1.012,
        cutoffMultiplier: 1.14,
        cpiVnd: 3250,
        countrySplits: [
            { country: 'PE', share: 0.60 },
            { country: 'MX', share: 0.40 }
        ]
    },

    // AAP858 - AI Couple: Relationship AI
    {
        id: 'cmp_fb_858_01',
        externalId: '#701',
        productId: 'AAP858',
        adAccountId: 'act_102938402',
        channel: 'Facebook',
        marketerId: 'LienDT',
        name: 'AAP858_FB_LATAM_SpanishSingle_TPC',
        countriesText: 'PE, CO',
        budgetVnd: 16_000_000,
        dailySpendVnd: 13_200_000,
        roasTarget: 1.125,
        cutoffMultiplier: 1.15,
        cpiVnd: 2980,
        countrySplits: [
            { country: 'PE', share: 0.65 },
            { country: 'CO', share: 0.35 }
        ]
    }
];

function deterministicNoise(seedNum: number): number {
    const x = Math.sin(seedNum * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
}

export async function seedIfEmpty(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Always ensure baseline system settings exist
        await client.query(
            `INSERT INTO system_settings (key, value) VALUES
                ('exchange_rate_vnd', $1),
                ('platform_fee_rate', $2),
                ('ggsheet_csv_url', '')
             ON CONFLICT (key) DO NOTHING`,
            [String(config.exchangeRateVnd), String(config.platformFeeRate)]
        );

        const { rows: countRows } = await client.query<{ cnt: number }>(
            'SELECT COUNT(*) AS cnt FROM intraday_hourly_metrics'
        );
        if (countRows[0].cnt > 0) {
            await client.query('COMMIT');
            return;
        }

        // Seed Products
        await client.query(`
            INSERT INTO products (id, division, name, package_name, dau_label) VALUES
                ('AIP922', 'AIP', 'Nexus - AI Video Generator', 'com.ai.aiimage.aivideogenerator', '7.45M'),
                ('AIP886', 'AIP', 'Framly - AI Photo Video Maker', 'aiphoto.restore.generator.enhancer', '4.20M'),
                ('AIP919', 'AIP', 'GeniAI: Photo & Video Creator', 'aichat.photogenarator.chatbot.video', '3.85M'),
                ('AAP885', 'AAP', 'CloutDrama: AI Short Drama', 'com.movie.shortdrama.aidramashorts', '1.92M'),
                ('AAP858', 'AAP', 'AI Couple: Relationship AI', 'com.aimakeup.aifaceeditor.facemakeup.faceswap', '1.24M')
            ON CONFLICT (id) DO NOTHING
        `);

        // Seed Marketers
        await client.query(`
            INSERT INTO marketers (id, full_name, email, role, department) VALUES
                ('HoangNC', 'Nguyễn Công Hoàng', 'hoangnc@apero.vn', 'Lead Growth Marketer', 'Performance Marketing'),
                ('TrangDQ', 'Đồng Quỳnh Trang', 'trangdq@apero.vn', 'Creative & Growth Lead', 'Creative Hub'),
                ('PhuongNTK', 'Nguyễn Thị Kim Phượng', 'phuongntk@apero.vn', 'Senior Media Buyer', 'Performance Marketing'),
                ('MinhTV', 'Trần Văn Minh', 'minhtv@apero.vn', 'Product Analytics Lead', 'Product Intelligence'),
                ('LienDT', 'Đỗ Thị Liên', 'liendt@apero.vn', 'Automation Specialist', 'Ad Operations')
            ON CONFLICT (id) DO NOTHING
        `);

        // Seed Ad Accounts (no live token yet -> ready for adapter token injection)
        await client.query(`
            INSERT INTO ad_accounts (id, name, channel, currency, balance_usd, status, access_token, api_config, last_sync_at) VALUES
                ('act_102938401', 'BM_Apero_USA_Primary', 'Facebook', 'USD', 45000.00, 'Connected', NULL, '{"apiVersion":"v20.0","endpoint":"https://graph.facebook.com/v20.0"}'::jsonb, NOW() - INTERVAL '2 minutes'),
                ('act_102938402', 'BM_Apero_Latam_02', 'Facebook', 'USD', 28000.00, 'Connected', NULL, '{"apiVersion":"v20.0","endpoint":"https://graph.facebook.com/v20.0"}'::jsonb, NOW() - INTERVAL '3 minutes'),
                ('act_719284109', 'TikTok_Apero_Agency_01', 'TikTok', 'USD', 12500.00, 'Connected', NULL, '{"apiVersion":"v1.3","endpoint":"https://business-api.tiktok.com/open_api/v1.3"}'::jsonb, NOW() - INTERVAL '1 minute'),
                ('act_829104820', 'GoogleAds_Nexus_UAC', 'Google Ads', 'USD', 30000.00, 'Connected', NULL, '{"apiVersion":"v17","endpoint":"https://googleads.googleapis.com/v17"}'::jsonb, NOW() - INTERVAL '5 minutes'),
                ('act_552910481', 'Mintegral_DSP_Direct', 'Mintegral', 'USD', 8000.00, 'Connected', NULL, '{"apiVersion":"v2","endpoint":"https://ss-api.mintegral.com/api/v2"}'::jsonb, NOW() - INTERVAL '10 minutes')
            ON CONFLICT (id) DO NOTHING
        `);

        // Seed Campaigns
        for (const c of CAMPAIGNS) {
            await client.query(
                `INSERT INTO campaigns
                    (id, external_campaign_id, product_id, ad_account_id, channel, marketer_id, name, countries, daily_budget_vnd, status, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ON',NOW())
                 ON CONFLICT (id) DO NOTHING`,
                [
                    c.id,
                    c.externalId,
                    c.productId,
                    c.adAccountId,
                    c.channel,
                    c.marketerId,
                    c.name,
                    c.countriesText,
                    c.budgetVnd
                ]
            );
        }

        // Seed Hourly Metrics for today-4 .. today in configured timezone
        const now = getNowInTz();
        const metricRows: Array<unknown[]> = [];

        for (let dayOffset = -4; dayOffset <= 0; dayOffset++) {
            const metricDate = shiftDate(now.date, dayOffset);
            const maxHour = dayOffset === 0 ? now.hour : 23;
            // Slight day-to-day trend factor so T-1/T-2/T-3 look realistic
            const dayFactor = 1 + dayOffset * 0.018;

            for (let hour = 0; hour <= maxHour; hour++) {
                const baseWeight = HOURLY_WEIGHTS[hour] / WEIGHT_SUM;

                CAMPAIGNS.forEach((cmp, cIdx) => {
                    const noise = 0.92 + deterministicNoise((dayOffset + 10) * 1000 + hour * 37 + cIdx) * 0.16;
                    const hourRoasJitter = 0.96 + deterministicNoise((dayOffset + 20) * 500 + hour * 19 + cIdx) * 0.08;

                    if (cmp.dailySpendVnd > 0) {
                        const totalHourSpend = cmp.dailySpendVnd * baseWeight * noise * dayFactor;
                        const totalHourCohortRev = totalHourSpend * cmp.roasTarget * hourRoasJitter;
                        const totalHourCutoffRev = totalHourCohortRev * cmp.cutoffMultiplier;
                        const totalHourInstalls = Math.max(1, Math.round(totalHourSpend / cmp.cpiVnd));

                        cmp.countrySplits.forEach(split => {
                            metricRows.push([
                                metricDate,
                                hour,
                                cmp.productId,
                                cmp.channel,
                                cmp.id,
                                split.country,
                                Math.round(totalHourSpend * split.share),
                                Math.round(totalHourCohortRev * split.share),
                                Math.round(totalHourCutoffRev * split.share),
                                Math.max(1, Math.round(totalHourInstalls * split.share))
                            ]);
                        });
                    } else {
                        // Organic / Mediation (no paid spend, contributes to revenue & organic installs)
                        const directCutoff = cmp.cutoffMultiplier * baseWeight * noise * dayFactor;
                        const directCohort = cmp.channel === 'Organic' ? directCutoff * 0.45 : directCutoff * 0.25;
                        const organicInstalls = cmp.channel === 'Organic' ? Math.max(5, Math.round(directCutoff / 4200)) : 0;

                        cmp.countrySplits.forEach(split => {
                            metricRows.push([
                                metricDate,
                                hour,
                                cmp.productId,
                                cmp.channel,
                                cmp.id,
                                split.country,
                                0,
                                Math.round(directCohort * split.share),
                                Math.round(directCutoff * split.share),
                                Math.round(organicInstalls * split.share)
                            ]);
                        });
                    }
                });
            }
        }

        // Batch insert in chunks of 200 rows for fast clean startup
        const chunkSize = 200;
        for (let i = 0; i < metricRows.length; i += chunkSize) {
            const chunk = metricRows.slice(i, i + chunkSize);
            const placeholders: string[] = [];
            const values: unknown[] = [];
            chunk.forEach((row, idx) => {
                const base = idx * 10;
                placeholders.push(
                    `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`
                );
                values.push(...row);
            });
            await client.query(
                `INSERT INTO intraday_hourly_metrics
                    (metric_date, hour_slot, product_id, channel, campaign_id, country, spend_vnd, cohort_rev_vnd, cutoff_rev_vnd, installs)
                 VALUES ${placeholders.join(',')}
                 ON CONFLICT (metric_date, hour_slot, campaign_id, country) DO NOTHING`,
                values
            );
        }

        // Initial Telemetry Logs
        await client.query(`
            INSERT INTO telemetry_logs (source, status_code, latency_ms, message, payload_summary) VALUES
                ('PostgreSQL Seed Engine', 200, 18, 'Khởi tạo dữ liệu Intraday 5 ngày gần nhất (T-4 đến hôm nay)', '{"days":5}'::jsonb),
                ('Facebook Marketing API (v20.0)', 200, 38, 'Đồng bộ thành công chiến dịch #AIP922_FB_US_VideoHug (+42 installs)', '{"product":"AIP922","channel":"Facebook"}'::jsonb),
                ('TikTok Business API (v1.3)', 200, 31, 'Đồng bộ slot giờ hiện tại cho AIP922 & AIP886 TikTok Global', '{"channel":"TikTok"}'::jsonb),
                ('AppsFlyer Push Webhook', 200, 24, 'Cập nhật attribution Cohort D0 & LTV realtime', '{"source":"AppsFlyer"}'::jsonb)
        `);

        await client.query('COMMIT');
        console.log(`[Seed] Seeded PostgreSQL with ${CAMPAIGNS.length} campaigns and ${metricRows.length} hourly metric rows.`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
