import type { FastifyInstance } from 'fastify';
import {
    buildIntradayCsv,
    getIntradayReport,
    updateCampaignStatus,
    type IntradayFilterParams
} from '../services/intradayService.js';
import { recordTelemetry } from '../services/telemetryService.js';
import { sseHub } from '../services/sseHub.js';

export async function intradayRoutes(app: FastifyInstance): Promise<void> {
    app.get<{ Querystring: IntradayFilterParams }>('/api/v1/intraday/report', async (req) => {
        return getIntradayReport(req.query);
    });

    app.get<{ Querystring: IntradayFilterParams & { currency?: string } }>(
        '/api/v1/intraday/export.csv',
        async (req, reply) => {
            const currency = req.query.currency?.toUpperCase() === 'USD' ? 'USD' : 'VND';
            const report = await getIntradayReport(req.query);
            const csv = buildIntradayCsv(report, currency);
            const filename = `Apero_Intraday_Report_${report.summary.date}_${currency}.csv`;

            reply
                .header('Content-Type', 'text/csv; charset=utf-8')
                .header('Content-Disposition', `attachment; filename="${filename}"`)
                .send(csv);
        }
    );

    app.patch<{ Params: { id: string }; Body: { status?: string } }>(
        '/api/v1/campaigns/:id/status',
        async (req, reply) => {
            const nextStatus = req.body?.status?.toUpperCase();
            if (nextStatus !== 'ON' && nextStatus !== 'OFF') {
                return reply.code(400).send({ ok: false, error: 'Status phải là ON hoặc OFF' });
            }
            const updated = await updateCampaignStatus(req.params.id, nextStatus);
            if (!updated) {
                return reply.code(404).send({ ok: false, error: 'Không tìm thấy chiến dịch' });
            }

            const telemetry = await recordTelemetry({
                source: 'Campaign Control API',
                statusCode: 200,
                latencyMs: 12,
                message: `Chuyển trạng thái chiến dịch "${updated.name}" sang ${updated.status}`,
                payloadSummary: { campaignId: updated.id, status: updated.status }
            });

            sseHub.broadcast('intraday_sync', {
                source: 'Campaign Control API',
                updatedRows: 1,
                campaignIds: [updated.id],
                spendDeltaTotal: 0,
                revDeltaTotal: 0,
                installsDeltaTotal: 0,
                telemetry
            });

            return { ok: true, campaign: updated };
        }
    );
}
