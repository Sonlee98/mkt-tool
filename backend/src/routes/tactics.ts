import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { makeId } from '../services/batchPlanner.js';
import { formatShortDateTimeInTz } from '../utils/time.js';

function mapTacticRow(r: Record<string, unknown>) {
    const rules = Array.isArray(r.rules_payload) ? r.rules_payload : [];
    return {
        id: r.id,
        name: r.name,
        description: r.description || '',
        rulesCount: rules.length,
        rules,
        ownerId: r.owner_id,
        owner: r.owner_name || r.owner_id || 'Nguyễn Công Hoàng',
        status: r.status || 'Active',
        createdAt: formatShortDateTimeInTz(r.created_at as Date),
        lastUpdated: formatShortDateTimeInTz(r.updated_at as Date)
    };
}

export async function tacticRoutes(app: FastifyInstance): Promise<void> {
    app.get<{ Querystring: { status?: string; owner?: string; search?: string } }>(
        '/api/v1/tactics',
        async (req) => {
            const { rows } = await pool.query(`SELECT * FROM tactics ORDER BY updated_at DESC`);
            let items = rows.map(mapTacticRow);

            const statusFilter = req.query.status?.trim();
            const ownerFilter = req.query.owner?.trim();
            const search = req.query.search?.trim().toLowerCase();

            if (statusFilter && statusFilter !== 'All') {
                items = items.filter(t => t.status === statusFilter);
            }
            if (ownerFilter && ownerFilter !== 'All') {
                items = items.filter(t => String(t.owner).toLowerCase().includes(ownerFilter.toLowerCase()));
            }
            if (search) {
                items = items.filter(t =>
                    `${t.name} ${t.description} ${t.owner}`.toLowerCase().includes(search)
                );
            }

            return { ok: true, items, totalCount: rows.length };
        }
    );

    app.post<{
        Body: {
            name?: string;
            description?: string;
            rules?: Array<{ if: string; then: string }>;
            ownerId?: string;
            ownerName?: string;
            status?: string;
        };
    }>('/api/v1/tactics', async (req, reply) => {
        const b = req.body || {};
        const name = String(b.name || '').trim();
        if (!name) {
            return reply.code(400).send({ ok: false, error: 'Thiếu tên Tactic.' });
        }

        const rules = Array.isArray(b.rules) ? b.rules : [];
        const id = makeId('tac');
        const { rows } = await pool.query(
            `INSERT INTO tactics (id, name, description, rules_payload, owner_id, owner_name, status, created_at, updated_at)
             VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,NOW(),NOW())
             RETURNING *`,
            [
                id,
                name,
                String(b.description || ''),
                JSON.stringify(rules),
                String(b.ownerId || 'HoangNC'),
                String(b.ownerName || 'Nguyễn Công Hoàng'),
                b.status === 'Paused' ? 'Paused' : 'Active'
            ]
        );

        return { ok: true, item: mapTacticRow(rows[0]) };
    });

    app.patch<{
        Params: { id: string };
        Body: { name?: string; description?: string; status?: string; rules?: Array<{ if: string; then: string }> };
    }>('/api/v1/tactics/:id', async (req, reply) => {
        const b = req.body || {};
        const { rows } = await pool.query(
            `UPDATE tactics
             SET name = COALESCE($2, name),
                 description = COALESCE($3, description),
                 status = COALESCE($4, status),
                 rules_payload = COALESCE($5::jsonb, rules_payload),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [
                req.params.id,
                b.name ? String(b.name).trim() : null,
                b.description !== undefined ? String(b.description) : null,
                b.status ? (b.status === 'Paused' ? 'Paused' : 'Active') : null,
                b.rules ? JSON.stringify(b.rules) : null
            ]
        );

        if (!rows[0]) {
            return reply.code(404).send({ ok: false, error: 'Không tìm thấy Tactic.' });
        }

        return { ok: true, item: mapTacticRow(rows[0]) };
    });
}
