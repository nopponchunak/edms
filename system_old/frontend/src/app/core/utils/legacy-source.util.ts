function parsePayload(value: unknown): any {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value;
  }

  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase());
  }

  return false;
}

function valueAt(source: any, path: string): unknown {
  return path.split('.').reduce((current, key) => current?.[key], source);
}

export function isLegacyRecord(item: any): boolean {
  const payload = parsePayload(item?.payload);
  const candidates = [
    valueAt(item, 'isLegacy'),
    valueAt(item, 'is_legacy'),
    valueAt(item, 'legacySource.isLegacy'),
    valueAt(item, 'legacy_source.is_legacy'),
    valueAt(payload, 'isLegacy'),
    valueAt(payload, 'is_legacy'),
    valueAt(payload, 'legacySource.isLegacy'),
    valueAt(payload, 'legacy_source.is_legacy'),
  ];

  return candidates.some((value) => asBoolean(value));
}
