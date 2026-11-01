export interface NormalizedProjectFeeSheetSnapshot {
  fee_sheet_type: string;
  project_id: number | null;
  proposal_project_reference_id: number | null;
  mt_project_no: string;
  project_name: string;
  discipline_id: number;
  director_in_charge_id: number;
  client_name: string;
  location: string;
  mtl_scope_detail: string;
  contact_name: string;
  comment: string;
  team: string[];
  fee_agreements: NormalizedFeeAgreementSnapshot[];
  job_costings: NormalizedJobCostingSnapshot[];
  billing_forecasts: NormalizedBillingForecastSnapshot[];
  project_type_id: number;
  form_filled_by_id: string;
  form_filled_by_date: string;
  approved_by_ch_id: string;
  approved_by_ch_date: string;
}

export interface NormalizedFeeAgreementSnapshot {
  gross_fee_excl_vat: number;
  less_subconsultants_items: NormalizedFeeAgreementLineItemSnapshot[];
  less_subconsultants_number: number;
  less_other_expenses_items: NormalizedFeeAgreementLineItemSnapshot[];
  less_other_expenses: number;
  net_fee_excl_vat: number;
  agreement_received: string;
}

export interface NormalizedFeeAgreementLineItemSnapshot {
  name: string;
  amount: number;
}

export interface NormalizedJobCostingSnapshot {
  phase: string;
  percent: number;
  start_date: string;
  end_date: string;
}

export interface NormalizedBillingForecastSnapshot {
  deliverable: string;
  month: string;
  amount: number;
}

function normalizeText(value: any): string {
  return String(value ?? '').trim();
}

function normalizeNumber(value: any): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeNullableNumber(value: any): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function normalizeProjectFeeSheetDate(value: any): string {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return '';
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const text = normalizeText(value);
  const ymd = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) {
    return ymd[1];
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeTeam(value: any): string[] {
  const items = Array.isArray(value)
    ? value
    : normalizeText(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  return items
    .map((item) => {
      if (item && typeof item === 'object') {
        return normalizeText(item.employee_code ?? item.employeeCode ?? item.code ?? item.id);
      }

      return normalizeText(item);
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeFeeAgreements(rows: any): NormalizedFeeAgreementSnapshot[] {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const subconsultantsItems = normalizeFeeAgreementLineItems(
        row,
        'less_subconsultants_items',
        'less_subconsultants_name',
        'less_subconsultants_number'
      );
      const otherExpensesItems = normalizeFeeAgreementLineItems(
        row,
        'less_other_expenses_items',
        'less_other_expenses_name',
        'less_other_expenses'
      );

      return {
        gross_fee_excl_vat: normalizeNumber(row?.gross_fee_excl_vat),
        less_subconsultants_items: subconsultantsItems,
        less_subconsultants_number: feeAgreementLineItemTotal(
          subconsultantsItems,
          row,
          'less_subconsultants_items',
          'less_subconsultants_number'
        ),
        less_other_expenses_items: otherExpensesItems,
        less_other_expenses: feeAgreementLineItemTotal(
          otherExpensesItems,
          row,
          'less_other_expenses_items',
          'less_other_expenses'
        ),
        net_fee_excl_vat: normalizeNumber(row?.net_fee_excl_vat),
        agreement_received: normalizeText(row?.agreement_received),
      };
    });
}

function normalizeFeeAgreementLineItems(
  row: any,
  itemsKey: string,
  legacyNameKey: string,
  legacyAmountKey: string
): NormalizedFeeAgreementLineItemSnapshot[] {
  const hasItems = Array.isArray(row?.[itemsKey]);
  const source = hasItems
    ? row[itemsKey]
    : ((normalizeText(row?.[legacyNameKey]) || normalizeNumber(row?.[legacyAmountKey]) !== 0)
        ? [{ name: row?.[legacyNameKey], amount: row?.[legacyAmountKey] }]
        : []);

  return source
    .map((item: any) => ({
      name: normalizeText(item?.name),
      amount: normalizeNumber(item?.amount),
    }))
    .filter((item: NormalizedFeeAgreementLineItemSnapshot) => item.name || item.amount !== 0)
    .sort((a: NormalizedFeeAgreementLineItemSnapshot, b: NormalizedFeeAgreementLineItemSnapshot) => {
      const nameCompare = a.name.localeCompare(b.name);
      return nameCompare !== 0 ? nameCompare : a.amount - b.amount;
    });
}

function feeAgreementLineItemTotal(
  items: NormalizedFeeAgreementLineItemSnapshot[],
  row: any,
  itemsKey: string,
  legacyAmountKey: string
): number {
  if (!Array.isArray(row?.[itemsKey])) {
    return normalizeNumber(row?.[legacyAmountKey]);
  }

  return items.reduce((sum, item) => sum + normalizeNumber(item.amount), 0);
}

function normalizeJobCostings(rows: any): NormalizedJobCostingSnapshot[] {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      phase: normalizeText(row?.phase).toUpperCase(),
      percent: normalizeNumber(row?.percent ?? row?.percentage),
      start_date: normalizeProjectFeeSheetDate(row?.start_date ?? row?.startDate),
      end_date: normalizeProjectFeeSheetDate(row?.end_date ?? row?.endDate),
    }))
    .filter((row) => row.phase && row.start_date && row.end_date)
    .sort((a, b) => a.phase.localeCompare(b.phase));
}

function normalizeBillingForecasts(rows: any): NormalizedBillingForecastSnapshot[] {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      deliverable: normalizeText(row?.deliverable),
      month: normalizeProjectFeeSheetDate(row?.month),
      amount: normalizeNumber(row?.amount),
    }))
    .filter((row) => row.month)
    .sort((a, b) => {
      const monthCompare = a.month.localeCompare(b.month);
      return monthCompare !== 0 ? monthCompare : a.deliverable.localeCompare(b.deliverable);
    });
}

export function normalizeProjectFeeSheetSnapshot(payload: any): NormalizedProjectFeeSheetSnapshot {
  const source = payload ?? {};

  return {
    fee_sheet_type: normalizeText(source.fee_sheet_type || 'project'),
    project_id: normalizeNullableNumber(source.project_id),
    proposal_project_reference_id: normalizeNullableNumber(source.proposal_project_reference_id),
    mt_project_no: normalizeText(source.mt_project_no),
    project_name: normalizeText(source.project_name),
    discipline_id: normalizeNumber(source.discipline_id),
    director_in_charge_id: normalizeNumber(source.director_in_charge_id),
    client_name: normalizeText(source.client_name),
    location: normalizeText(source.location),
    mtl_scope_detail: normalizeText(source.mtl_scope_detail),
    contact_name: normalizeText(source.contact_name),
    comment: normalizeText(source.comment),
    team: normalizeTeam(source.team),
    fee_agreements: normalizeFeeAgreements(source.fee_agreements),
    job_costings: normalizeJobCostings(source.job_costings ?? source.job_costing),
    billing_forecasts: normalizeBillingForecasts(source.billing_forecasts ?? source.billing_forecast),
    project_type_id: normalizeNumber(source.project_type_id),
    form_filled_by_id: normalizeText(source.form_filled_by_id),
    form_filled_by_date: normalizeProjectFeeSheetDate(source.form_filled_by_date),
    approved_by_ch_id: normalizeText(source.approved_by_ch_id),
    approved_by_ch_date: normalizeProjectFeeSheetDate(source.approved_by_ch_date),
  };
}

export function projectFeeSheetSnapshotsDiffer(current: any, baseline: any): boolean {
  return JSON.stringify(normalizeProjectFeeSheetSnapshot(current)) !==
    JSON.stringify(normalizeProjectFeeSheetSnapshot(baseline));
}
