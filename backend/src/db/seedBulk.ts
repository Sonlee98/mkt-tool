import crypto from 'node:crypto';
import type { Pool } from 'pg';

function sha256Text(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
}

export async function seedBulkIfEmpty(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: appCount } = await client.query<{ cnt: number }>(
            'SELECT COUNT(*) AS cnt FROM app_templates'
        );
        if (appCount[0].cnt > 0) {
            await client.query('COMMIT');
            return;
        }

        // 1. Seed Application Templates (Facebook + Google Ads)
        await client.query(`
            INSERT INTO app_templates (id, name, channel, product_id, store_type, platform_app_id, bundle_id, store_url, link_status, created_by) VALUES
                ('app_aip922_fb', 'AIP922_Nexus_FB', 'Facebook', 'AIP922', 'GOOGLE_PLAY', '29321565010862795', 'com.ai.aiimage.aivideogenerator', 'https://play.google.com/store/apps/details?id=com.ai.aiimage.aivideogenerator', 'Linked', 'HoangNC'),
                ('app_aip886_fb', 'AIP886_Framly_FB', 'Facebook', 'AIP886', 'GOOGLE_PLAY', '839201948201948', 'aiphoto.restore.generator.enhancer', 'https://play.google.com/store/apps/details?id=aiphoto.restore.generator.enhancer', 'Linked', 'PhuongNTK'),
                ('app_aap885_fb', 'AAP885_CloutDrama_FB', 'Facebook', 'AAP885', 'GOOGLE_PLAY', '4822304614716374', 'com.movie.shortdrama.aidramashorts', 'https://play.google.com/store/apps/details?id=com.movie.shortdrama.aidramashorts', 'Linked', 'TrangDQ'),
                ('app_aap858_fb', 'AAP858_AICouple_FB', 'Facebook', 'AAP858', 'GOOGLE_PLAY', '391827461928374', 'com.aimakeup.aifaceeditor.facemakeup.faceswap', 'https://play.google.com/store/apps/details?id=com.aimakeup.aifaceeditor.facemakeup.faceswap', 'Linked', 'LienDT'),
                ('app_aip922_gg', 'AIP922_Nexus_Google_UAC', 'Google Ads', 'AIP922', 'GOOGLE_PLAY', 'com.ai.aiimage.aivideogenerator', 'com.ai.aiimage.aivideogenerator', 'https://play.google.com/store/apps/details?id=com.ai.aiimage.aivideogenerator', 'Linked', 'HoangNC'),
                ('app_aip919_gg', 'AIP919_GeniAI_Google_UAC', 'Google Ads', 'AIP919', 'GOOGLE_PLAY', 'aichat.photogenarator.chatbot.video', 'aichat.photogenarator.chatbot.video', 'https://play.google.com/store/apps/details?id=aichat.photogenarator.chatbot.video', 'Linked', 'LienDT')
            ON CONFLICT (id) DO NOTHING
        `);

        // 2. Seed Page Templates (Facebook only)
        await client.query(`
            INSERT INTO page_templates (id, name, channel, page_id, instagram_actor_id, app_template_id, status) VALUES
                ('page_nexus_global', 'Nexus AI - Official Global', 'Facebook', '109284710293847', '178414059283741', 'app_aip922_fb', 'Active'),
                ('page_framly_studio', 'Framly AI Studio', 'Facebook', '283910482019482', '178414091827364', 'app_aip886_fb', 'Active'),
                ('page_clout_drama', 'Short Drama & Films Fan Club', 'Facebook', '394820194820194', NULL, 'app_aap885_fb', 'Active'),
                ('page_nexus_india', 'Nexus AI India Community', 'Facebook', '495820194820195', NULL, 'app_aip922_fb', 'Active')
            ON CONFLICT (id) DO NOTHING
        `);

        // 3. Seed Campaign Templates (Facebook + Google Ads UAC)
        await client.query(`
            INSERT INTO campaign_templates (
                id, name, channel, buying_type, objective, performance_goal, convert_event,
                roas_goal, target_cpa, budget_amount, budget_currency, budget_level,
                ad_group_volume, creative_volume, is_worldwide, country_codes, language_codes,
                attribution_window, is_ai_media, platform_extras, created_by
            ) VALUES
                (
                    'cam_fb_single_100k',
                    'AGA-GLOBAL-SINGLE-TEST-100K-VND',
                    'Facebook', 'Auction', 'App Promotion', 'MAXIMIZE_VALUE', 'AD_IMPRESSION',
                    NULL, NULL, 2500000, 'VND', 'CAMPAIGN_CBO',
                    1, 1, TRUE, ARRAY['US','IN','VN','PE'], ARRAY['en','hi','es'],
                    '1-day click', TRUE, '{"smart_promotion_type":"AUTOMATED_APP_ADS","os_platform":"ANDROID"}'::jsonb, 'LienDT'
                ),
                (
                    'cam_fb_us_cbo_scale',
                    'CAM_FB_US_TIER1_ROAS_AUTO_SCALE',
                    'Facebook', 'Auction', 'App Promotion', 'MAXIMIZE_VALUE', 'AD_IMPRESSION',
                    120.00, NULL, 500, 'USD', 'CAMPAIGN_CBO',
                    2, 3, FALSE, ARRAY['US','CA','AU'], ARRAY['en'],
                    '7-day click, 1-day view', TRUE, '{"smart_promotion_type":"AUTOMATED_APP_ADS","os_platform":"ANDROID"}'::jsonb, 'HoangNC'
                ),
                (
                    'cam_fb_latam_viral',
                    'CAM_FB_LATAM_VIRAL_SCALE_D0',
                    'Facebook', 'Auction', 'App Promotion', 'MAXIMIZE_INSTALLS', 'APP_INSTALL',
                    NULL, 0.08, 350, 'USD', 'CAMPAIGN_CBO',
                    1, 5, FALSE, ARRAY['PE','CO','MX','CL'], ARRAY['es'],
                    '1-day click', FALSE, '{"os_platform":"ANDROID"}'::jsonb, 'TrangDQ'
                ),
                (
                    'cam_gg_uac_us_troas',
                    'CAM_GOOGLE_UAC_US_TARGET_ROAS',
                    'Google Ads', 'UAC', 'App Promotion', 'TARGET_ROAS', 'AD_IMPRESSION',
                    120.00, NULL, 250, 'USD', 'CAMPAIGN_CBO',
                    2, 5, FALSE, ARRAY['US','CA'], ARRAY['en'],
                    '30-day click', FALSE, '{"app_campaign_sub_type":"APP_CAMPAIGN","bidding_strategy_goal_type":"OPTIMIZE_IN_APP_CONVERSIONS_TARGET_VALUE"}'::jsonb, 'HoangNC'
                ),
                (
                    'cam_gg_uac_global_tcpa',
                    'CAM_GOOGLE_UAC_GLOBAL_INSTALLS',
                    'Google Ads', 'UAC', 'App Promotion', 'TARGET_CPA', 'APP_INSTALL',
                    NULL, 0.12, 180, 'USD', 'CAMPAIGN_CBO',
                    1, 10, TRUE, ARRAY['US','IN','BR','VN'], ARRAY['en'],
                    '30-day click', FALSE, '{"app_campaign_sub_type":"APP_CAMPAIGN","bidding_strategy_goal_type":"OPTIMIZE_INSTALLS_TARGET_INSTALL_COST"}'::jsonb, 'LienDT'
                )
            ON CONFLICT (id) DO NOTHING
        `);

        // 4. Seed Ad Templates (Facebook multi-copy + Google Ads UAC copy groups <=30/<=90 chars)
        await client.query(`
            INSERT INTO ad_templates (id, name, channel, objective, format, cta_type, copy_payload, created_by) VALUES
                (
                    'ad_fb_ai_hug_video',
                    'ADS_FB_VIDEO_9x16_AI_HUG_EMOTIONAL',
                    'Facebook', 'App Promotion', 'Single Video (9:16)', 'INSTALL_MOBILE_APP',
                    '{
                        "primary_texts": [
                            "Transform your photos into moving AI hugs with one click! ✨ Try for free now.",
                            "Bring a precious family memory back to life in seconds."
                        ],
                        "headlines": ["AI Video Hug Generator #1", "Bring a Memory to Life"],
                        "descriptions": ["Over 5,000,000+ creators love Nexus AI"]
                    }'::jsonb,
                    'TrangDQ'
                ),
                (
                    'ad_fb_photo_restore',
                    'ADS_FB_VIDEO_PHOTO_RESTORE_HD',
                    'Facebook', 'App Promotion', 'Single Video (9:16)', 'USE_APP',
                    '{
                        "primary_texts": [
                            "Old blurred photos to 4K ultra clear instantly. Experience Framly AI."
                        ],
                        "headlines": ["HD Photo Enhancer AI"],
                        "descriptions": ["Before / After Magic"]
                    }'::jsonb,
                    'PhuongNTK'
                ),
                (
                    'ad_fb_hindi_mix',
                    'ADS_FB_HINDI_TRANSFORMATION_MIX',
                    'Facebook', 'App Promotion', 'Single Video (9:16)', 'INSTALL_MOBILE_APP',
                    '{
                        "primary_texts": [
                            "Apni photo ko banayein trending AI video sirf ek click mein! 🌟"
                        ],
                        "headlines": ["AI Video Banane Wala App"],
                        "descriptions": ["5 Million+ Downloads in India"]
                    }'::jsonb,
                    'TrangDQ'
                ),
                (
                    'ad_gg_uac_nexus_en',
                    'ADS_GG_UAC_NEXUS_EN_2GROUPS',
                    'Google Ads', 'App Promotion', 'UAC Multi-Asset', 'INSTALL_MOBILE_APP',
                    '{
                        "groups": [
                            {
                                "group_index": 1,
                                "theme_name": "AI_Hug_Emotional",
                                "headlines": [
                                    "Make Photos Hug with AI",
                                    "AI Video Generator Free",
                                    "Turn Selfies Into Videos"
                                ],
                                "descriptions": [
                                    "Create emotional AI hug videos from old photos in seconds. Try now!",
                                    "5M+ creators trust Nexus AI Video Maker. Export HD with one tap."
                                ]
                            },
                            {
                                "group_index": 2,
                                "theme_name": "Viral_Transform",
                                "headlines": [
                                    "Animate Any Old Photo",
                                    "Viral AI Video Effects"
                                ],
                                "descriptions": [
                                    "Bring old family portraits to life with realistic AI motion. Download!"
                                ]
                            }
                        ]
                    }'::jsonb,
                    'HoangNC'
                ),
                (
                    'ad_gg_uac_geniai_global',
                    'ADS_GG_UAC_GENIAI_GLOBAL_1GROUP',
                    'Google Ads', 'App Promotion', 'UAC Multi-Asset', 'INSTALL_MOBILE_APP',
                    '{
                        "groups": [
                            {
                                "group_index": 1,
                                "theme_name": "GeniAI_Creator",
                                "headlines": [
                                    "GeniAI Photo & Video AI",
                                    "Create AI Art in Seconds"
                                ],
                                "descriptions": [
                                    "Turn text and photos into stunning AI videos and anime art instantly."
                                ]
                            }
                        ]
                    }'::jsonb,
                    'LienDT'
                )
            ON CONFLICT (id) DO NOTHING
        `);

        // 5. Seed Tactics
        await client.query(`
            INSERT INTO tactics (id, name, description, rules_payload, owner_id, owner_name, status) VALUES
                (
                    'tac_hoang_upscale',
                    'HoangNC_Upscale Copy',
                    'Scale budget 25% if ROAS D0 > 115% and Spend > $30. Reduce if ROAS < 80%.',
                    '[
                        {"if":"Spend > $30 AND ROAS D0 >= 115%","then":"Increase Budget by 25% (Max 3 times/day)"},
                        {"if":"Spend > $15 AND ROAS D0 < 75%","then":"Decrease Budget by 20%"},
                        {"if":"Spend > $25 AND ROAS D0 < 60%","then":"Pause Ad Set immediately"},
                        {"if":"CPI <= $0.08 AND Conversions >= 20","then":"Duplicate Ad Set to Lookalike 1-2%"}
                    ]'::jsonb,
                    'HoangNC', 'Nguyễn Công Hoàng', 'Active'
                ),
                (
                    'tac_phuong_off_test',
                    'PhuongNTK_Off TEST',
                    'Safety cut-off rule for creative testing campaigns within first 6 hours.',
                    '[
                        {"if":"Spend > $10 AND Installs == 0","then":"Pause Ad"},
                        {"if":"Spend > $20 AND CPI > $0.40","then":"Pause Ad Set"},
                        {"if":"CTR < 0.8% AND Impressions > 3,000","then":"Mark Creative as Low CTR"}
                    ]'::jsonb,
                    'PhuongNTK', 'Nguyễn Thị Kim Phượng', 'Active'
                ),
                (
                    'tac_liendt_downscale',
                    'LienDT_AGA_DownScale_D0',
                    'Automated down-scale protection during off-peak timezone hours.',
                    '[
                        {"if":"Time between 02:00 - 06:00 AND ROAS < 90%","then":"Reduce Budget by 30%"},
                        {"if":"Time > 07:00 AND Yesterday ROAS > 105%","then":"Restore Budget to Baseline"}
                    ]'::jsonb,
                    'LienDT', 'Đỗ Thị Liên', 'Active'
                ),
                (
                    'tac_scale_aggressive',
                    'Scale_High_ROAS_Aggressive',
                    'Aggressive scaling tactic for top performing angles in Tier 1 US/CA/AU.',
                    '[
                        {"if":"ROAS D0 >= 130% AND Spend > $50","then":"Increase Budget 40%"},
                        {"if":"ROAS D1 >= 140%","then":"Raise Daily Budget Limit to $2,000"}
                    ]'::jsonb,
                    'TrangDQ', 'Đồng Quỳnh Trang', 'Active'
                )
            ON CONFLICT (id) DO NOTHING
        `);

        // 6. Seed Packages (3 Facebook + 2 Google Ads UAC)
        await client.query(`
            INSERT INTO packages (
                id, name, channel, app_template_id, campaign_template_id, ad_template_id,
                page_template_id, ad_account_id, tactic_ids, naming_template, status, created_by
            ) VALUES
                (
                    'pkg_fb_single_tk01',
                    'AIP922-GLOBAL-SINGLE-TEST - BM_USA_01',
                    'Facebook', 'app_aip922_fb', 'cam_fb_single_100k', 'ad_fb_ai_hug_video',
                    'page_nexus_global', 'act_102938401', ARRAY['tac_phuong_off_test','tac_hoang_upscale'],
                    '{product}_{channel}_{geo}_{angle}_{lang}_SINGLE_{acc_short}_{date}_{idx}', 'Running', 'HoangNC'
                ),
                (
                    'pkg_fb_cbo_us_tk01',
                    'AIP922-US-TIER1-CBO-SCALE - BM_USA_01',
                    'Facebook', 'app_aip922_fb', 'cam_fb_us_cbo_scale', 'ad_fb_ai_hug_video',
                    'page_nexus_global', 'act_102938401', ARRAY['tac_scale_aggressive','tac_hoang_upscale'],
                    '{product}_{channel}_{geo}_{angle}_{lang}_CBO_{acc_short}_{date}_{idx}', 'Running', 'HoangNC'
                ),
                (
                    'pkg_fb_latam_tk02',
                    'AIP886-LATAM-VIRAL-RESTORE - BM_LATAM_02',
                    'Facebook', 'app_aip886_fb', 'cam_fb_latam_viral', 'ad_fb_photo_restore',
                    'page_framly_studio', 'act_102938402', ARRAY['tac_liendt_downscale'],
                    '{product}_{channel}_{geo}_{angle}_{lang}_LATAM_{acc_short}_{date}_{idx}', 'Running', 'PhuongNTK'
                ),
                (
                    'pkg_gg_uac_us_01',
                    'AIP922-GOOGLE-UAC-US-TARGET-ROAS - UAC_01',
                    'Google Ads', 'app_aip922_gg', 'cam_gg_uac_us_troas', 'ad_gg_uac_nexus_en',
                    NULL, 'act_829104820', ARRAY['tac_hoang_upscale'],
                    '{product}_UAC_{geo}_{angle}_{lang}_{acc_short}_{date}_{idx}', 'Running', 'HoangNC'
                ),
                (
                    'pkg_gg_uac_global_02',
                    'AIP919-GOOGLE-UAC-GLOBAL-INSTALLS - UAC_01',
                    'Google Ads', 'app_aip919_gg', 'cam_gg_uac_global_tcpa', 'ad_gg_uac_geniai_global',
                    NULL, 'act_829104820', ARRAY['tac_liendt_downscale'],
                    '{product}_UAC_GLB_{angle}_{lang}_{acc_short}_{date}_{idx}', 'Running', 'LienDT'
                )
            ON CONFLICT (id) DO NOTHING
        `);

        // 7. Seed Creatives (Matching original Creative Hub cards with real CSS gradients & SHA-256 hashes)
        const seedCreatives = [
            {
                id: 'cr-73',
                title: 'hindi tổng hợp mix (73).mp4',
                fileName: 'hindi_tong_hop_mix_73.mp4',
                gradient: 'linear-gradient(135deg, #d97706 0%, #be123c 100%)',
                visibility: 'PRIVATE',
                durationSec: 10,
                durationLabel: '00:10',
                sizeLabel: '1.10 MB',
                sizeBytes: 1153433,
                productId: 'AIP922',
                angle: 'Transformation',
                lang: 'Hindi',
                market: 'India / SEA',
                tiktokPolicy: 'Check failed',
                tiktokReason: 'Text density exceeds 20% overlay limit',
                metaPolicy: 'Review',
                metaReason: 'Pending AI Automated Compliance Check',
                googlePolicy: 'Approved',
                ytId: 'yt_seed_hindi73',
                success: 14,
                failed: 3,
                creatorId: 'TrangDQ',
                creatorName: 'Đồng Quỳnh Trang'
            },
            {
                id: 'cr-61',
                title: 'hindi tổng hợp mix (61).mp4',
                fileName: 'hindi_tong_hop_mix_61.mp4',
                gradient: 'linear-gradient(135deg, #9333ea 0%, #3730a3 100%)',
                visibility: 'PUBLIC',
                durationSec: 12,
                durationLabel: '00:12',
                sizeLabel: '1.03 MB',
                sizeBytes: 1080033,
                productId: 'AIP922',
                angle: 'Transformation',
                lang: 'Hindi',
                market: 'India',
                tiktokPolicy: 'Passed',
                tiktokReason: 'Compliance verified by TikTok AI',
                metaPolicy: 'Approved',
                metaReason: 'Meta AI Safe for App Promotion',
                googlePolicy: 'Approved',
                ytId: 'yt_seed_hindi61',
                success: 42,
                failed: 0,
                creatorId: 'TrangDQ',
                creatorName: 'Đồng Quỳnh Trang'
            },
            {
                id: 'cr-92',
                title: 'nexus_ai_hug_emotional_us_hook01.mp4',
                fileName: 'nexus_ai_hug_emotional_us_hook01.mp4',
                gradient: 'linear-gradient(135deg, #2563eb 0%, #0e7490 100%)',
                visibility: 'PUBLIC',
                durationSec: 15,
                durationLabel: '00:15',
                sizeLabel: '2.45 MB',
                sizeBytes: 2569011,
                productId: 'AIP922',
                angle: 'AI Hug',
                lang: 'English',
                market: 'US / Tier 1',
                tiktokPolicy: 'Passed',
                tiktokReason: 'Passed all audio and visual moderation checks',
                metaPolicy: 'Approved',
                metaReason: 'High quality score creative',
                googlePolicy: 'Approved',
                ytId: 'yt_seed_aihg92',
                success: 128,
                failed: 2,
                creatorId: 'HoangNC',
                creatorName: 'Nguyễn Công Hoàng'
            },
            {
                id: 'cr-45',
                title: 'framly_face_dance_funny_meme_latam.mp4',
                fileName: 'framly_face_dance_funny_meme_latam.mp4',
                gradient: 'linear-gradient(135deg, #db2777 0%, #be123c 100%)',
                visibility: 'PUBLIC',
                durationSec: 10,
                durationLabel: '00:10',
                sizeLabel: '1.80 MB',
                sizeBytes: 1887436,
                productId: 'AIP886',
                angle: 'Face Dance',
                lang: 'Spanish',
                market: 'LATAM / Global',
                tiktokPolicy: 'Passed',
                tiktokReason: 'Viral trending audio compliant',
                metaPolicy: 'Approved',
                metaReason: 'Approved for Reels & Stories',
                googlePolicy: 'Approved',
                ytId: 'yt_seed_fdnc45',
                success: 89,
                failed: 1,
                creatorId: 'PhuongNTK',
                creatorName: 'Nguyễn Thị Kim Phượng'
            },
            {
                id: 'cr-18',
                title: 'geniai_anime_morph_cyberpunk_tier1.mp4',
                fileName: 'geniai_anime_morph_cyberpunk_tier1.mp4',
                gradient: 'linear-gradient(135deg, #059669 0%, #115e59 100%)',
                visibility: 'PUBLIC',
                durationSec: 15,
                durationLabel: '00:15',
                sizeLabel: '3.10 MB',
                sizeBytes: 3250585,
                productId: 'AIP919',
                angle: 'Anime Morph',
                lang: 'English',
                market: 'US / UK / CA',
                tiktokPolicy: 'Passed',
                tiktokReason: 'Verified',
                metaPolicy: 'Approved',
                metaReason: 'Verified',
                googlePolicy: 'Approved',
                ytId: 'yt_seed_anim18',
                success: 64,
                failed: 0,
                creatorId: 'MinhTV',
                creatorName: 'Trần Văn Minh'
            },
            {
                id: 'cr-09',
                title: 'cloutdrama_revenge_ceo_teaser_ep1.mp4',
                fileName: 'cloutdrama_revenge_ceo_teaser_ep1.mp4',
                gradient: 'linear-gradient(135deg, #dc2626 0%, #92400e 100%)',
                visibility: 'PUBLIC',
                durationSec: 30,
                durationLabel: '00:30',
                sizeLabel: '4.20 MB',
                sizeBytes: 4404019,
                productId: 'AAP885',
                angle: 'Short Drama',
                lang: 'English',
                market: 'US / Tier 1',
                tiktokPolicy: 'Passed',
                tiktokReason: 'Drama teaser verified',
                metaPolicy: 'Review',
                metaReason: 'Dramatic scenes manual AI review',
                googlePolicy: 'Approved',
                ytId: 'yt_seed_clt09',
                success: 32,
                failed: 1,
                creatorId: 'TrangDQ',
                creatorName: 'Đồng Quỳnh Trang'
            },
            {
                id: 'cr-88',
                title: 'nexus_action_hero_latam_explosive.mp4',
                fileName: 'nexus_action_hero_latam_explosive.mp4',
                gradient: 'linear-gradient(135deg, #ea580c 0%, #991b1b 100%)',
                visibility: 'PRIVATE',
                durationSec: 10,
                durationLabel: '00:10',
                sizeLabel: '1.60 MB',
                sizeBytes: 1677721,
                productId: 'AIP922',
                angle: 'Action Hero',
                lang: 'Spanish',
                market: 'LATAM',
                tiktokPolicy: 'Check failed',
                tiktokReason: 'Simulated weapon/explosion flagged by safety model',
                metaPolicy: 'Flagged',
                metaReason: 'Sensitive content policy violation',
                googlePolicy: 'Review',
                ytId: null,
                success: 8,
                failed: 12,
                creatorId: 'TrangDQ',
                creatorName: 'Đồng Quỳnh Trang'
            },
            {
                id: 'cr-52',
                title: 'framly_old_photo_restore_grandma_split.mp4',
                fileName: 'framly_old_photo_restore_grandma_split.mp4',
                gradient: 'linear-gradient(135deg, #4f46e5 0%, #5b21b6 100%)',
                visibility: 'PUBLIC',
                durationSec: 15,
                durationLabel: '00:15',
                sizeLabel: '2.10 MB',
                sizeBytes: 2202009,
                productId: 'AIP886',
                angle: 'Photo Restore',
                lang: 'Global (No voiceover)',
                market: 'Global',
                tiktokPolicy: 'Passed',
                tiktokReason: 'Clear before/after transformation passed',
                metaPolicy: 'Approved',
                metaReason: 'Highest engagement tier',
                googlePolicy: 'Approved',
                ytId: 'yt_seed_rst52',
                success: 215,
                failed: 3,
                creatorId: 'PhuongNTK',
                creatorName: 'Nguyễn Thị Kim Phượng'
            }
        ];

        for (let idx = 0; idx < seedCreatives.length; idx++) {
            const cr = seedCreatives[idx];
            await client.query(
                `INSERT INTO creatives (
                    id, title, file_name, sha256_hash, storage_path, public_url, thumb_url,
                    poster_gradient, media_type, visibility, duration_sec, duration_label,
                    width, height, aspect_ratio, size_label, file_size_bytes, product_id,
                    angle_code, language_code, market_target, tiktok_policy, tiktok_policy_reason,
                    meta_policy, meta_policy_reason, google_policy, youtube_video_id,
                    campaign_success_count, campaign_failed_count, creator_id, creator_name,
                    created_at, updated_at
                ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,'VIDEO',$9,$10,$11,
                    1080,1920,'9:16',$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,
                    NOW() - ($28 * INTERVAL '45 minutes'), NOW() - ($28 * INTERVAL '45 minutes')
                ) ON CONFLICT (id) DO NOTHING`,
                [
                    cr.id,
                    cr.title,
                    cr.fileName,
                    sha256Text(cr.fileName),
                    `seed://${cr.fileName}`,
                    null,
                    null,
                    cr.gradient,
                    cr.visibility,
                    cr.durationSec,
                    cr.durationLabel,
                    cr.sizeLabel,
                    cr.sizeBytes,
                    cr.productId,
                    cr.angle,
                    cr.lang,
                    cr.market,
                    cr.tiktokPolicy,
                    cr.tiktokReason,
                    cr.metaPolicy,
                    cr.metaReason,
                    cr.googlePolicy,
                    cr.ytId,
                    cr.success,
                    cr.failed,
                    cr.creatorId,
                    cr.creatorName,
                    idx + 1
                ]
            );
        }

        // Seed 1 cache entry for cr-92 on Facebook USA account to demonstrate Cache Hit in preview
        await client.query(
            `INSERT INTO ad_account_media_cache (channel, scope_key, creative_sha256, remote_media_id, status)
             VALUES ('Facebook', 'act_102938401', $1, 'fb_vid_seed_92_cached', 'READY')
             ON CONFLICT (channel, scope_key, creative_sha256) DO NOTHING`,
            [sha256Text('nexus_ai_hug_emotional_us_hook01.mp4')]
        );

        await client.query('COMMIT');
        console.log('[SeedBulk] Seeded Bulk Campaign templates, packages, tactics, and creatives.');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
