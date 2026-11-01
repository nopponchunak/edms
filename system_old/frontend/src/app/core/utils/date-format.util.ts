/**
 * รูปแบบการแสดงวันที่มาตรฐาน
 * - formatDate: dd-MMM-yyyy (เช่น 02-Jan-2025)
 * - formatDateTime: dd-MMM-yyyy (เช่น 02-Jan-2025)
 */

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * แปลงค่าเป็น Date object (รองรับ string | Date | null | undefined)
 */
function toDate(value: string | Date | null | undefined): Date | null {
    if (value == null) return null;
    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
    }

    const trimmed = value.trim();
    let date: Date;

    const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) {
        date = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
        return isNaN(date.getTime()) ? null : date;
    }

    const dmy = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dmy) {
        date = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
        return isNaN(date.getTime()) ? null : date;
    }

    const ymdTime = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (ymdTime) {
        date = new Date(
            Number(ymdTime[1]),
            Number(ymdTime[2]) - 1,
            Number(ymdTime[3]),
            Number(ymdTime[4]),
            Number(ymdTime[5]),
            Number(ymdTime[6] || 0)
        );
        return isNaN(date.getTime()) ? null : date;
    }

    const dmyTime = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (dmyTime) {
        date = new Date(
            Number(dmyTime[3]),
            Number(dmyTime[2]) - 1,
            Number(dmyTime[1]),
            Number(dmyTime[4]),
            Number(dmyTime[5]),
            Number(dmyTime[6] || 0)
        );
        return isNaN(date.getTime()) ? null : date;
    }

    date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * แสดงวันที่รูปแบบ dd-MMM-yyyy (เช่น 02-Jan-2025)
 */
export function formatDateDisplay(value: string | Date | null | undefined): string {
    const date = toDate(value);
    if (!date) return '-';
    const day = date.getDate().toString().padStart(2, '0');
    const month = MONTH_NAMES[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * แสดงวันที่รูปแบบ dd-MMM-yyyy แม้ input จะเป็น datetime
 */
export function formatDateTimeDisplay(value: string | Date | null | undefined): string {
    const date = toDate(value);
    if (!date) return '-';
    const day = date.getDate().toString().padStart(2, '0');
    const month = MONTH_NAMES[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * แสดงวันที่รูปแบบ dd-MMM-yyyy HH:mm
 */
export function formatDateTimeNoSecondsDisplay(value: string | Date | null | undefined): string {
    const date = toDate(value);
    if (!date) return '-';
    const day = date.getDate().toString().padStart(2, '0');
    const month = MONTH_NAMES[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}`;
}
