const SYSTEM_ADMIN_USERNAME = 'admin';
const SYSTEM_ADMIN_NAME = 'administrator';
const SYSTEM_ADMIN_EMAIL = 'admin@local';
const AD_USER_TYPES = ['sync_ad', 'ad', 'active_directory', 'ldap'];

export function isSystemAdminUser(): boolean {
    const users = [readStoredUser('user_raw_data'), readStoredUser('user')]
        .filter((user): user is Record<string, unknown> => !!user);

    return users.some((user) => isExactAuditLogAdmin(user));
}

function readStoredUser(key: string): Record<string, unknown> | null {
    try {
        if (typeof localStorage === 'undefined') {
            return null;
        }

        const raw = localStorage.getItem(key);
        if (!raw) {
            return null;
        }

        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : null;
    } catch {
        return null;
    }
}

function isExactAuditLogAdmin(user: Record<string, unknown>): boolean {
    return (
        isNonAdUser(user) &&
        readUserText(user, ['username', 'userName']) === SYSTEM_ADMIN_USERNAME &&
        readUserText(user, ['name', 'fullName', 'full_name']) === SYSTEM_ADMIN_NAME &&
        readUserText(user, ['email']) === SYSTEM_ADMIN_EMAIL
    );
}

function isNonAdUser(user: Record<string, unknown>): boolean {
    const rawType =
        user['type'] ??
        user['user_type'] ??
        user['source'] ??
        user['auth_provider'] ??
        user['provider'];

    if (typeof rawType !== 'string' && typeof rawType !== 'number') {
        return true;
    }

    return !AD_USER_TYPES.includes(String(rawType).trim().toLowerCase());
}

function readUserText(user: Record<string, unknown>, fields: string[]): string {
    for (const field of fields) {
        const value = user[field];
        if (typeof value === 'string' || typeof value === 'number') {
            const normalized = String(value).trim().toLowerCase();
            if (normalized !== '') {
                return normalized;
            }
        }
    }

    return '';
}
