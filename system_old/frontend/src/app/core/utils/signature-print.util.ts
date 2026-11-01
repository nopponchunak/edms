import { SignatureSetting } from 'app/core/services/signature-setting.service';

export interface SignaturePrintOptions {
  activeSignatureSettings: Map<string, SignatureSetting>;
  employeeLookup?: Map<string, string>;
  fallbackName?: string | null;
  allowNameOnlySignature?: boolean;
}

export function formatPoSignatureId(
  employeeCode: string | number | null | undefined,
  actionDate: string | Date | null | undefined
): string {
  const code = formatSignatureEmployeeCode(employeeCode);
  const date = formatSignatureDate(actionDate);

  if (!code || !date) {
    return '';
  }

  return `SIGN_ID:${code}-${date}`;
}

export function formatSignatureEmployeeCode(
  employeeCode: string | number | null | undefined
): string {
  const normalized = String(employeeCode ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();

  if (!normalized) {
    return '';
  }

  const match = normalized.match(/^([A-Z]+)-?(\d+)$/);
  if (!match) {
    return normalized;
  }

  return `${match[1]}-${match[2]}`;
}

export function formatSignatureDate(value: string | Date | null | undefined): string {
  const date = parseSignatureDate(value);

  if (!date) {
    return '';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);

  return `${day}${month}${year}`;
}

export function getPoSignatureLookupCandidates(
  employeeRef: string | number | null | undefined
): string[] {
  return getSignatureLookupCandidates(employeeRef);
}

export function getSignatureLookupCandidates(
  employeeRef: string | number | null | undefined
): string[] {
  const rawRef = String(employeeRef ?? '').trim();
  if (!rawRef) {
    return [];
  }

  const candidates = new Set<string>();
  const addCodeCandidates = (value: string | number | null | undefined): void => {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return;
    }

    candidates.add(raw);

    const compact = raw.replace(/\s+/g, '');
    if (compact) {
      candidates.add(compact);
    }

    const formatted = formatSignatureEmployeeCode(raw);
    if (formatted) {
      candidates.add(formatted);
      candidates.add(formatted.replace(/-/g, ''));
    }
  };

  addCodeCandidates(rawRef);

  const commaPrefix = rawRef.match(/^([^,]+),\s*.+$/)?.[1];
  addCodeCandidates(commaPrefix);

  return Array.from(candidates);
}

export function getSignatureLookupRefsFromValues(
  values: Array<string | number | null | undefined>,
  lookup?: Map<string, string>
): string[] {
  const refs = new Set<string>();
  values.forEach((value) => {
    getSignatureLookupRefs(value, lookup).forEach((candidate) => refs.add(candidate));
  });

  return Array.from(refs);
}

export function getSignatureLookupRefs(
  ref: string | number | null | undefined,
  lookup?: Map<string, string>
): string[] {
  const normalizedRef = String(ref ?? '').trim();
  if (!normalizedRef) {
    return [];
  }

  const candidates = new Set<string>(getSignatureLookupCandidates(normalizedRef));
  const targetLabel = normalizedRef.toLowerCase();

  lookup?.forEach((label, code) => {
    const labelText = String(label ?? '').trim();
    const labelWithoutTitle = labelText.split('|')[0].trim();
    const labelCandidates = [labelText, labelWithoutTitle]
      .map((value) => value.toLowerCase())
      .filter(Boolean);

    if (labelCandidates.includes(targetLabel)) {
      getSignatureLookupCandidates(code).forEach((candidate) => candidates.add(candidate));
    }
  });

  return Array.from(candidates);
}

export function getSignatureSettingForRef(
  ref: string | number | null | undefined,
  activeSignatureSettings: Map<string, SignatureSetting>,
  employeeLookup?: Map<string, string>
): SignatureSetting | null {
  const candidates = getSignatureLookupRefs(ref, employeeLookup);
  for (const candidate of candidates) {
    const setting = activeSignatureSettings.get(candidate);
    if (setting) {
      return setting;
    }
  }

  return null;
}

export function getSignaturePrintHtml(
  ref: string | number | null | undefined,
  actionDate: string | Date | null | undefined,
  options: SignaturePrintOptions
): string {
  const normalizedRef = String(ref ?? '').trim();
  if (!normalizedRef) {
    return '';
  }

  const setting = getSignatureSettingForRef(
    normalizedRef,
    options.activeSignatureSettings,
    options.employeeLookup
  );
  if (!setting) {
    return '';
  }

  const signId = formatPoSignatureId(setting.employee_code || normalizedRef, actionDate);
  if (!signId && options.allowNameOnlySignature !== true) {
    return '';
  }

  const name = getSignatureEmployeeName(setting) || String(options.fallbackName ?? '').trim();
  if (!name) {
    return '';
  }

  return `
    <span class="signature-print-block">
      <img class="signature-watermark" src="/favicon-32x32.png" alt="" />
      <span class="signature-name">${escapeSignatureHtml(name)}</span>
      ${signId ? `<span class="signature-id">${escapeSignatureHtml(signId)}</span>` : ''}
    </span>
  `;
}

export function getSignatureEmployeeName(setting: SignatureSetting): string {
  const firstname = setting.firstname || setting.employee?.firstname || '';
  const lastname = setting.lastname || setting.employee?.lastname || '';
  return [firstname, lastname].filter(Boolean).join(' ').trim();
}

export function escapeSignatureHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseSignatureDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return buildDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }

  const dmy = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (dmy) {
    return buildDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}
