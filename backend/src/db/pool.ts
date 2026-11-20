import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';
import { seedIfEmpty } from './seed.js';
import { seedBulkIfEmpty } from './seedBulk.js';

// Parse DATE (OID 1082) as raw 'YYYY-MM-DD' string, NUMERIC (OID 1700) as float, INT8 (OID 20) as number
pg.types.setTypeParser(1082, (val: string) => val);
pg.types.setTypeParser(1700, (val: string) => parseFloat(val));
pg.types.setTypeParser(20, (val: string) => parseInt(val, 10));

export const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 15,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureDatabaseReady(): Promise<void> {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf8');
    await pool.query(schemaSql);
    await seedIfEmpty(pool);

    const bulkSchemaPath = path.join(__dirname, 'schema_bulk.sql');
    const bulkSchemaSql = await fs.readFile(bulkSchemaPath, 'utf8');
    await pool.query(bulkSchemaSql);
    await seedBulkIfEmpty(pool);
}
