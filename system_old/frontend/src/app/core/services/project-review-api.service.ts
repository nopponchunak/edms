import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, throwError, switchMap } from 'rxjs';
import { ApiConfig } from '../config/api.config';

export type ProjectReviewApiKey =
  | 'conceptDesignReview'
  | 'schematicDesignReview'
  | 'submissionReview'
  | 'tenderReview'
  | 'tenderCsaReview'
  | 'tenderCsaVerification'
  | 'tenderMepReview'
  | 'tenderMepVerification'
  | 'constructionValidation'
  | 'engineeringAuditReview'
  | 'valueEngineeringReview'
  | 'leedReview';

type ProjectReviewType =
  | 'concept_design_review'
  | 'schematic_design_review'
  | 'submission_review'
  | 'tender_review'
  | 'tender_csa_review'
  | 'tender_csa_verification'
  | 'tender_mep_review'
  | 'tender_mep_verification'
  | 'construction_validation'
  | 'engineering_audit_review'
  | 'value_engineering_review'
  | 'leed_review';

interface ReviewEndpointConfig {
  type: ProjectReviewType;
}

const REVIEW_ENDPOINTS: Record<ProjectReviewApiKey, ReviewEndpointConfig> = {
  conceptDesignReview: { type: 'concept_design_review' },
  schematicDesignReview: { type: 'schematic_design_review' },
  submissionReview: { type: 'submission_review' },
  tenderReview: { type: 'tender_review' },
  tenderCsaReview: { type: 'tender_csa_review' },
  tenderCsaVerification: { type: 'tender_csa_verification' },
  tenderMepReview: { type: 'tender_mep_review' },
  tenderMepVerification: { type: 'tender_mep_verification' },
  constructionValidation: { type: 'construction_validation' },
  engineeringAuditReview: { type: 'engineering_audit_review' },
  valueEngineeringReview: { type: 'value_engineering_review' },
  leedReview: { type: 'leed_review' },
};

function pluralizeReviewType(type: ProjectReviewType): string {
  return `${type}s`;
}

function buildReviewCollectionPath(type: ProjectReviewType): string {
  return `api/${pluralizeReviewType(type)}`;
}

function buildReviewListPath(type: ProjectReviewType): string {
  return `api/get_${pluralizeReviewType(type)}`;
}

function buildReviewPagePath(type: ProjectReviewType): string {
  return `api/${pluralizeReviewType(type)}_page`;
}

function buildSharedReviewPagePath(): string {
  return 'api/project_reviews_page';
}

type GenericChecklistStatus =
  | 'draft'
  | 'in_review'
  | 'responded'
  | 'signed'
  | 'acknowledged'
  | 'completed'
  | 'rejected';

type EngineeringAuditStatus =
  | 'draft'
  | 'in_review'
  | 'pe_response'
  | 'reviewer_followup'
  | 'tl_review'
  | 'di_acknowledge'
  | 'completed'
  | 'rejected';

function readPath(source: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], source);
}

function hasValue(value: any): boolean {
  return value !== undefined && value !== null && value !== '';
}

export function pickValue(source: any, ...paths: string[]): any {
  for (const path of paths) {
    const value = readPath(source, path);
    if (hasValue(value)) {
      return value;
    }
  }

  return undefined;
}

export function pickString(source: any, ...paths: string[]): string {
  const value = pickValue(source, ...paths);
  return hasValue(value) ? String(value) : '';
}

function employeeLabelFromValue(value: any): string {
  if (!hasValue(value)) {
    return '';
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return pickString(
      value,
      'displayLabel',
      'display_label',
      'label',
      'name',
      'fullName',
      'full_name'
    );
  }

  return String(value).trim();
}

function employeeCodeFromValue(value: any): string {
  if (!hasValue(value)) {
    return '';
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return pickString(
      value,
      'code',
      'employeeCode',
      'employee_code',
      'id',
      'employeeId',
      'employee_id'
    );
  }

  return String(value).trim();
}

function employeeLookupBaseKey(key: string, suffix: string): string {
  return key.slice(0, -suffix.length);
}

function rememberEmployeeLookupEntry(
  lookup: Map<string, string>,
  code: any,
  label: any
): void {
  const normalizedCode = employeeCodeFromValue(code);
  const normalizedLabel = employeeLabelFromValue(label);

  if (!normalizedCode || !normalizedLabel) {
    return;
  }

  lookup.set(normalizedCode, normalizedLabel);
}

export function mergeProjectReviewEmployeeLookup(
  rows: any[],
  lookup: Map<string, string> = new Map<string, string>()
): Map<string, string> {
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') {
      return;
    }

    Object.keys(row).forEach((key) => {
      if (key.endsWith('_name')) {
        const baseKey = employeeLookupBaseKey(key, '_name');
        rememberEmployeeLookupEntry(lookup, row[baseKey], row[key]);
        return;
      }

      if (key.endsWith('Name')) {
        const baseKey = employeeLookupBaseKey(key, 'Name');
        rememberEmployeeLookupEntry(lookup, row[baseKey], row[key]);
        return;
      }

      if (key.endsWith('_employee')) {
        const baseKey = employeeLookupBaseKey(key, '_employee');
        rememberEmployeeLookupEntry(lookup, row[baseKey] ?? row[key], row[key]);
        return;
      }

      if (key.endsWith('Employee')) {
        const baseKey = employeeLookupBaseKey(key, 'Employee');
        rememberEmployeeLookupEntry(lookup, row[baseKey] ?? row[key], row[key]);
      }
    });
  });

  return lookup;
}

export function projectReviewEmployeeLabelFromRecord(row: any, value: any): string {
  const normalizedCode = employeeCodeFromValue(value);
  if (!normalizedCode || !row || typeof row !== 'object') {
    return '';
  }

  for (const key of Object.keys(row)) {
    if (employeeCodeFromValue(row[key]) !== normalizedCode) {
      continue;
    }

    const label = employeeLabelFromValue(row[`${key}_name`]) ||
      employeeLabelFromValue(row[`${key}Name`]) ||
      employeeLabelFromValue(row[`${key}_employee`]) ||
      employeeLabelFromValue(row[`${key}Employee`]);

    if (label) {
      return label;
    }
  }

  return '';
}

export function asInteger(value: any): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return asInteger(
      value.employeeId ??
        value.employee_id ??
        value.userId ??
        value.user_id ??
        value.id
    );
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (/^-?\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
  }

  return null;
}

export function pickInteger(source: any, ...paths: string[]): number | null {
  return asInteger(pickValue(source, ...paths));
}

export function pickIntegerOrString(
  source: any,
  ...paths: string[]
): number | string {
  const value = pickValue(source, ...paths);
  const integerValue = asInteger(value);

  if (integerValue !== null) {
    return integerValue;
  }

  return hasValue(value) ? String(value) : '';
}

export function asBoolean(value: any): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'y'].includes(normalized);
  }

  return false;
}

export function asDate(value: any): Date | null {
  if (!hasValue(value)) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function pickDate(source: any, ...paths: string[]): Date | null {
  return asDate(pickValue(source, ...paths));
}

export function asStringArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        return asStringArray(parsed);
      } catch {
        return [];
      }
    }

    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function pickStringArray(source: any, ...paths: string[]): string[] {
  return asStringArray(pickValue(source, ...paths));
}

export function toApiDate(value: any): string | null {
  const date = asDate(value);
  if (!date) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function readDepartmentFromLocalStorage(): string {
  if (typeof localStorage === 'undefined') {
    return '';
  }

  const directDepartment = localStorage.getItem('department');
  if (directDepartment?.trim()) {
    return directDepartment.trim();
  }

  const rawUserData = localStorage.getItem('user_raw_data');
  if (!rawUserData) {
    return '';
  }

  try {
    const parsed = JSON.parse(rawUserData);
    const department = pickString(
      parsed,
      'department',
      'department_name',
      'departmentName',
      'user.department',
      'user.department_name',
      'user.departmentName',
      'data.department',
      'data.department_name',
      'data.departmentName'
    ).trim();
    return department;
  } catch {
    return '';
  }
}

export function humanizeReviewMethod(value: any): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (!normalized) {
    return '-';
  }

  const labels: Record<string, string> = {
    before: 'Before Release',
    after: 'After Release',
    a: 'Method A',
    b: 'Method B',
  };

  return labels[normalized] ?? String(value);
}

export function serializeDatesDeep<T>(value: T): T {
  if (value instanceof Date) {
    return toApiDate(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeDatesDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, any>).reduce(
      (acc, [key, entryValue]) => {
        acc[key] = serializeDatesDeep(entryValue);
        return acc;
      },
      {} as Record<string, any>
    ) as T;
  }

  return value;
}

function normalizeChecklistStatus(value: any): GenericChecklistStatus | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  const aliases: Record<string, GenericChecklistStatus> = {
    draft: 'draft',
    in_review: 'in_review',
    review: 'in_review',
    submitted: 'in_review',
    responded: 'responded',
    response: 'responded',
    signed: 'signed',
    acknowledged: 'acknowledged',
    completed: 'completed',
    complete: 'completed',
    rejected: 'rejected',
    declined: 'rejected',
  };

  return aliases[normalized] ?? null;
}

function normalizeEngineeringStatus(value: any): EngineeringAuditStatus | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  const aliases: Record<string, EngineeringAuditStatus> = {
    draft: 'draft',
    in_review: 'in_review',
    pe_response: 'pe_response',
    reviewer_followup: 'reviewer_followup',
    reviewer_follow_up: 'reviewer_followup',
    tl_review: 'tl_review',
    di_acknowledge: 'di_acknowledge',
    completed: 'completed',
    rejected: 'rejected',
    declined: 'rejected',
  };

  return aliases[normalized] ?? null;
}

export function deriveChecklistStatus(item: any): GenericChecklistStatus {
  // 1. Check for terminal statuses based on signature fields first
  if (asBoolean(pickValue(item, 'rejected', 'is_rejected', 'declined'))) {
    return 'rejected';
  }

  const acknowledgedStatus = String(pickValue(item, 'acknowledgedByStatus', 'acknowledged_by_status', 'acknowledged_by_d_i_status') || '').toLowerCase();
  const isAcknowledgedApproved = acknowledgedStatus === 'approved' || acknowledgedStatus === 'approve';
  const hasAcknowledgedDate = hasValue(
    pickValue(
      item,
      'acknowledgedByDate',
      'acknowledgedByTLDate',
      'acknowledgedByDIDate',
      'acknowledged_by_date',
      'acknowledged_by_tl_date',
      'acknowledged_by_di_date',
      'acknowledged_by_d_i_date'
    )
  );

  if (isAcknowledgedApproved || hasAcknowledgedDate) {
    const actionsTaken = asBoolean(
      pickValue(
        item,
        'recommendedActionsSatisfactorilyTaken',
        'recommended_actions_satisfactorily_taken',
        'recommended_actions_satisfactorily_taken_by_tl',
        'recommended_actions_satisfactorily_taken_by_t_l'
      )
    );

    // If acknowledged and final approval is given, it's completed
    if (isAcknowledgedApproved) {
      return 'completed';
    }

    return 'acknowledged';
  }

  // 2. Fall back to explicit status if it's a terminal one (completed/rejected)
  const explicitStatus = normalizeChecklistStatus(
    pickValue(item, 'status', 'current_status', 'workflow_status')
  );

  if (explicitStatus === 'completed') {
    if (isAcknowledgedApproved) {
      return 'completed';
    }
  } else if (explicitStatus === 'rejected') {
    return 'rejected';
  }

  // 3. Continue derivation for in-progress statuses
  const signedStatus = String(pickValue(item, 'signedByTLStatus', 'signed_by_tl_status', 'signed_by_t_l_status', 'signedByVVEStatus', 'signed_by_vve_status') || '').toLowerCase();
  const isSignedApproved = signedStatus === 'approved' || signedStatus === 'approve';
  const hasSignedDate = hasValue(
    pickValue(
      item,
      'signedByDate',
      'signedByTLDate',
      'signedByTL2Date',
      'signedByTL3Date',
      'signedByVVEDate',
      'signed_by_date',
      'signed_by_tl_date',
      'signed_by_t_l_date',
      'signed_by_tl2_date',
      'signed_by_t_l2_date',
      'signed_by_tl3_date',
      'signed_by_t_l3_date',
      'signed_by_vve_date'
    )
  );

  if (isSignedApproved || hasSignedDate) {
    return 'signed';
  }

  const respondedStatus = String(pickValue(item, 'respondedByStatus', 'responded_by_status') || '').toLowerCase();
  const isRespondedApproved = respondedStatus === 'approved' || respondedStatus === 'approve';
  const hasRespondedDate = hasValue(
    pickValue(
      item,
      'respondedByDate',
      'responded_by_date',
      'peResponseDate',
      'pe_response_date',
      'reviewerFollowUpDate',
      'reviewer_follow_up_date'
    )
  );

  if (isRespondedApproved || hasRespondedDate) {
    return 'responded';
  }

  const reviewedStatus = String(pickValue(item, 'reviewedByStatus', 'reviewed_by_status', 'reviewed_by_tl_status', 'reviewed_by_t_l_status') || '').toLowerCase();
  const isReviewedApproved = reviewedStatus === 'approved' || reviewedStatus === 'approve';
  const hasReviewDate = hasValue(
    pickValue(
      item,
      'reviewedByDate',
      'reviewed_by_date',
      'reviewed_by_tl_date',
      'reviewed_by_t_l_date',
      'completedByDate',
      'completed_by_date'
    )
  );

  if (isReviewedApproved || hasReviewDate) {
    return 'in_review';
  }

  const hasReviewActivity = hasValue(
    pickValue(
      item,
      'reviewerForAction',
      'reviewer_for_action',
      'reviewerComments',
      'reviewer_comments'
    )
  );

  if (hasReviewActivity || explicitStatus === 'in_review') {
    return 'in_review';
  }

  // Final fallback to explicit status (e.g. 'draft', 'in_review')
  return explicitStatus || 'draft';
}

export function deriveEngineeringAuditStatus(item: any): EngineeringAuditStatus {
  const explicitStatus = normalizeEngineeringStatus(
    pickValue(item, 'status', 'current_status', 'workflow_status')
  );
  const diStatus = String(pickValue(item, 'acknowledgedByStatus', 'acknowledged_by_status', 'diAcknowledgeStatus', 'di_acknowledge_status') || '').toLowerCase();
  const isDiApproved = ['approved', 'approve', 'completed', 'signed', 'acknowledged'].includes(diStatus);

  if (explicitStatus === 'completed') {
    if (isDiApproved) {
      return 'completed';
    }
  } else if (explicitStatus) {
    return explicitStatus;
  }

  if (asBoolean(pickValue(item, 'rejected', 'is_rejected', 'declined'))) {
    return 'rejected';
  }

  if (hasValue(pickValue(item, 'diAcknowledgeDate', 'di_acknowledge_date')) && isDiApproved) {
    return 'completed';
  }

  if (hasValue(pickValue(item, 'tlReviewDate', 'tl_review_date'))) {
    return 'tl_review';
  }

  if (
    hasValue(
      pickValue(item, 'reviewerFollowUpDate', 'reviewer_follow_up_date')
    )
  ) {
    return 'reviewer_followup';
  }

  if (hasValue(pickValue(item, 'peResponse', 'peResponseDate', 'pe_response', 'pe_response_date'))) {
    return 'pe_response';
  }

  if (
    hasValue(
      pickValue(
        item,
        'reviewerComments',
        'reviewer_comments',
        'reviewerForAction',
        'reviewer_for_action'
      )
    )
  ) {
    return 'in_review';
  }

  return 'draft';
}

function unwrapData<T>(response: any): T {
  return (response?.data ?? response) as T;
}

function unwrapList<T>(response: any): T[] {
  const data = unwrapData<any>(response);

  if (Array.isArray(data)) {
    return data as T[];
  }

  if (Array.isArray(data?.data)) {
    return data.data as T[];
  }

  return [];
}

@Injectable({ providedIn: 'root' })
export class ProjectReviewApiService {
  constructor(private http: HttpClient, private apiConfig: ApiConfig) {}

  private getReviewType(key: ProjectReviewApiKey): ProjectReviewType {
    return REVIEW_ENDPOINTS[key].type;
  }

  private getCollectionPath(key: ProjectReviewApiKey): string {
    return buildReviewCollectionPath(REVIEW_ENDPOINTS[key].type);
  }

  private getListPath(key: ProjectReviewApiKey): string {
    return buildReviewListPath(REVIEW_ENDPOINTS[key].type);
  }

  private getPagePath(key: ProjectReviewApiKey): string {
    return buildReviewPagePath(REVIEW_ENDPOINTS[key].type);
  }

  list(key: ProjectReviewApiKey): Observable<any[]> {
    return this.http
      .get<any>(this.apiConfig.buildUrl(this.getListPath(key)))
      .pipe(map((response) => unwrapList<any>(response)));
  }

  page(key: ProjectReviewApiKey, payload: any): Observable<any> {
    const typedPayload = {
      ...payload,
      type: payload?.type ?? this.getReviewType(key),
    };

    return this.http
      .post<any>(this.apiConfig.buildUrl(buildSharedReviewPagePath()), typedPayload)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (error.status !== 404 && error.status !== 405) {
            return throwError(() => error);
          }

          return this.http.post<any>(
            this.apiConfig.buildUrl(this.getPagePath(key)),
            typedPayload
          );
        })
      );
  }

  getById(key: ProjectReviewApiKey, id: string | number): Observable<any> {
    return this.http
      .get<any>(this.apiConfig.buildUrl(`${this.getCollectionPath(key)}/${id}`))
      .pipe(map((response) => unwrapData<any>(response)));
  }

  create(key: ProjectReviewApiKey, payload: any): Observable<any> {
    const departmentFromLocal = readDepartmentFromLocalStorage();
    const typedPayload = {
      ...payload,
      department: pickString(payload, 'department').trim() || departmentFromLocal,
    };

    return this.http
      .post<any>(this.apiConfig.buildUrl(this.getCollectionPath(key)), typedPayload)
      .pipe(map((response) => unwrapData<any>(response)));
  }

  update(
    key: ProjectReviewApiKey,
    id: string | number,
    payload: any
  ): Observable<any> {
    return this.http
      .put<any>(this.apiConfig.buildUrl(`${this.getCollectionPath(key)}/${id}`), payload)
      .pipe(map((response) => unwrapData<any>(response)));
  }

  delete(key: ProjectReviewApiKey, id: string | number): Observable<any> {
    return this.http
      .delete<any>(this.apiConfig.buildUrl(`${this.getCollectionPath(key)}/${id}`))
      .pipe(map((response) => unwrapData<any>(response)));
  }

  getCommitteeEmployees(committeeName: string): Observable<any[]> {
    // First find the committee by name
    return this.http.get<any>(this.apiConfig.buildUrl(`api/get_committees?search=${committeeName}`)).pipe(
      switchMap(response => {
        const items = response?.data || [];
        // Exact match check
        const committee = items.find((c: any) => String(c.name).trim().toLowerCase() === committeeName.trim().toLowerCase());

        if (!committee || !committee.id) {
          return of([]);
        }

        // Fetch full details including employees
        return this.http.get<any>(this.apiConfig.buildUrl(`api/committees/${committee.id}`)).pipe(
          map(res => {
            const data = res?.data;
            return Array.isArray(data?.employees) ? data.employees : [];
          })
        );
      }),
      catchError(error => {
        console.error(`Error fetching committee ${committeeName}:`, error);
        return of([]);
      })
    );
  }
}
