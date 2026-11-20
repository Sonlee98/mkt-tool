import { config } from '../config.js';

export interface TzNow {
    date: string;      // YYYY-MM-DD
    hour: number;      // 0..23
    timeLabel: string; // HH:mm:ss
    shortTime: string; // HH:mm
    ddMm: string;      // DD/MM
    ddMmYyyy: string;  // DD/MM/YYYY
}

export function getNowInTz(tz = config.timezone): TzNow {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(now);

    const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    const hourNum = parseInt(get('hour'), 10) % 24;
    const hourStr = String(hourNum).padStart(2, '0');
    const minute = get('minute');
    const second = get('second');

    return {
        date: `${year}-${month}-${day}`,
        hour: hourNum,
        timeLabel: `${hourStr}:${minute}:${second}`,
        shortTime: `${hourStr}:${minute}`,
        ddMm: `${day}/${month}`,
        ddMmYyyy: `${day}/${month}/${year}`
    };
}

export function shiftDate(dateStr: string, deltaDays: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

export function formatTimeInTz(dateInput: Date | string | null | undefined, tz = config.timezone): string {
    if (!dateInput) return '-';
    const dt = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (Number.isNaN(dt.getTime())) return '-';
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(dt);
}

export function formatShortDateTimeInTz(dateInput: Date | string | null | undefined, tz = config.timezone): string {
    if (!dateInput) return '-';
    const dt = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (Number.isNaN(dt.getTime())) return '-';
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(dt);
    const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
    return `${get('hour')}:${get('minute')} ${get('day')}/${get('month')}`;
}

export function parseBudgetToVnd(raw: unknown, exchangeRate = config.exchangeRateVnd): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, raw);
    if (typeof raw !== 'string') return 0;
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed) return 0;

    const isUsd = trimmed.includes('$') || trimmed.includes('USD');
    const numMatch = trimmed.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!numMatch) return 0;
    let val = parseFloat(numMatch[0]);

    if (trimmed.includes('B')) {
        val *= 1_000_000_000;
    } else if (trimmed.includes('M')) {
        val *= 1_000_000;
    } else if (trimmed.includes('K')) {
        val *= 1_000;
    }

    if (isUsd) {
        val *= exchangeRate;
    }
    return Math.max(0, Math.round(val));
}

export function parseNumberSafe(raw: unknown, fallback = 0): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
        const cleaned = raw.replace(/[,₫$\s]/g, '');
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
}
