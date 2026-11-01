// fee-sheet.service.ts
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ApiConfig } from '../config/api.config';
import { map, Observable } from 'rxjs';

export type FeeSheetType = 'project' | 'facade' | 'lighting' | 'transportation';
export type FeeSheetWorkflowStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | string;

interface FeeSheetsListApiResponse {
  data: any[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
    from: number | null;
    to: number | null;
  };
  links: {
    first: string;
    last: string;
    prev: string | null;
    next: string | null;
  };
}

interface FeeSheetByIdApiResponse {
  data: any;
}

export interface FeeSheetRow {
  id: string;
  projectPNo: string;
  projectNo: string;
  projectName: string;
  client: string;
  discipline: string;
  projectType: string;
  grossFee: number;
  nettFee: number;
  status: FeeSheetWorkflowStatus;
  filledInBy: string;
  approvedBy: string;
  createdAt: string;
  updatedAt: string;
  feeSheetType: FeeSheetType;
}

export function normalizeFeeSheetStatus(status: unknown): FeeSheetWorkflowStatus | null {
  if (status === null || status === undefined) {
    return null;
  }

  const normalized = String(status).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'pending') {
    return 'submitted';
  }

  if (normalized === 'approve' || normalized === 'approved') {
    return 'approved';
  }

  if (normalized === 'reject' || normalized === 'rejected' || normalized === 'decline' || normalized === 'declined') {
    return 'rejected';
  }

  return normalized;
}

export function resolveFeeSheetStatus(...candidates: unknown[]): FeeSheetWorkflowStatus {
  for (const candidate of candidates) {
    const status = normalizeFeeSheetStatus(candidate);
    if (!status) {
      continue;
    }

    if (status === 'draft') {
      continue;
    }

    if (status) {
      return status;
    }
  }

  return 'draft';
}

export function canEditCurrentFeeSheet(status: unknown): boolean {
  const normalized = normalizeFeeSheetStatus(status);
  return normalized === 'draft' || normalized === 'submitted';
}

export function canCreateFeeSheetRevision(status: unknown): boolean {
  return normalizeFeeSheetStatus(status) === 'approved';
}

@Injectable({ providedIn: 'root' })
export class FeeSheetService {
  constructor(private http: HttpClient, private apiConfig: ApiConfig) {}

  private unwrapFeeSheetResponse(response: FeeSheetByIdApiResponse | any): any {
    if (response && typeof response === 'object' && 'data' in response) {
      return response.data ?? null;
    }

    return response ?? null;
  }

  private looksLikeFeeSheetRevision(source: any): boolean {
    if (!source || typeof source !== 'object') {
      return false;
    }

    return [
      'project_name',
      'client_name',
      'location',
      'contact_name',
      'comment',
      'team',
      'discipline_id',
      'director_in_charge_id',
      'project_type_id',
      'form_filled_by_id',
      'approved_by_ch_id',
      'fee_agreements',
      'job_costings',
      'job_costing',
      'billing_forecasts',
      'billing_forecast',
    ].some((key) => source[key] !== undefined && source[key] !== null);
  }

  private pickArray(...candidates: any[]): any[] {
    let firstArray: any[] | null = null;

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }

      if (firstArray === null) {
        firstArray = candidate;
      }

      if (candidate.length > 0) {
        return candidate;
      }
    }

    return firstArray ?? [];
  }

  private normalizeTeamMembers(source: any): any[] {
    if (Array.isArray(source?.team_members) && source.team_members.length > 0) {
      return source.team_members;
    }

    const teamValue = source?.team;
    if (typeof teamValue !== 'string' || !teamValue.trim()) {
      return [];
    }

    return teamValue
      .split(',')
      .map((value: string) => value.trim())
      .filter(Boolean)
      .map((employeeCode: string) => ({ employee_code: employeeCode }));
  }

  private latestSectionRows(rows: any[], forceSingleRow = false): any[] {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    const hasRevisionNo = rows.some((row) => row?.revision_no !== undefined && row?.revision_no !== null);
    if (!hasRevisionNo) {
      return forceSingleRow ? rows.slice(0, 1) : rows;
    }

    const latestRevisionNo = Math.max(
      ...rows.map((row) => Number(row?.revision_no ?? 0)).filter((value) => Number.isFinite(value))
    );

    const latestRows = rows.filter((row) => Number(row?.revision_no ?? 0) === latestRevisionNo);
    return forceSingleRow ? latestRows.slice(0, 1) : latestRows;
  }

  private normalizeSectionSnapshotRows(rows: any[], forceSingleRow = false): any[] {
    return this.latestSectionRows(rows, forceSingleRow).map((row) => ({
      ...row,
      revision_no: 0,
      revision_label: 'Original',
      revision_name: row?.revision_name ?? 'Original',
    }));
  }

  private usesFullPageRevisionSnapshots(type: any): boolean {
    return ['project', 'facade', 'transportation'].includes(String(type ?? ''));
  }

  private normalizeRevision(source: any, fallback: any = null): any {
    const primary = source && typeof source === 'object' ? source : {};
    const backup = fallback && typeof fallback === 'object' ? fallback : {};

    if (!Object.keys(primary).length && !Object.keys(backup).length) {
      return null;
    }

    const jobCostings = this.pickArray(
      primary?.job_costings,
      primary?.job_costing,
      backup?.job_costings,
      backup?.job_costing
    );

    const billingForecasts = this.pickArray(
      primary?.billing_forecasts,
      primary?.billing_forecast,
      backup?.billing_forecasts,
      backup?.billing_forecast
    );

    const teamMembers = this.normalizeTeamMembers(primary);
    const fallbackTeamMembers = this.normalizeTeamMembers(backup);
    const feeAgreements = this.pickArray(primary?.fee_agreements, backup?.fee_agreements);
    const usesFullPageSnapshots = this.usesFullPageRevisionSnapshots(
      primary?.fee_sheet_type ?? backup?.fee_sheet_type ?? 'project'
    );

    return {
      ...backup,
      ...primary,
      fee_agreements: usesFullPageSnapshots
        ? this.normalizeSectionSnapshotRows(feeAgreements, true)
        : feeAgreements,
      job_costings: usesFullPageSnapshots
        ? this.normalizeSectionSnapshotRows(jobCostings)
        : jobCostings,
      job_costing: usesFullPageSnapshots
        ? this.normalizeSectionSnapshotRows(jobCostings)
        : jobCostings,
      billing_forecasts: usesFullPageSnapshots
        ? this.normalizeSectionSnapshotRows(billingForecasts)
        : billingForecasts,
      billing_forecast: usesFullPageSnapshots
        ? this.normalizeSectionSnapshotRows(billingForecasts)
        : billingForecasts,
      team_members: teamMembers.length > 0 ? teamMembers : fallbackTeamMembers,
      team: primary?.team ?? backup?.team ?? '',
    };
  }

  private normalizeProject(data: any, revision: any): any {
    const project = data?.project && typeof data.project === 'object' ? data.project : {};
    const projectReference =
      data?.project_reference && typeof data.project_reference === 'object'
        ? data.project_reference
        : {};
    const projectReferenceId =
      Number(
        data?.proposal_project_reference_id ??
          data?.proposalProjectReferenceId ??
          revision?.proposal_project_reference_id ??
          revision?.proposalProjectReferenceId ??
          projectReference?.id ??
          0
      ) || null;

    return {
      ...projectReference,
      ...project,
      id: project?.id ?? data?.project_id ?? null,
      proposal_project_reference_id: projectReferenceId,
      proposalProjectReferenceId: projectReferenceId,
      project_no:
        project?.project_no ??
        data?.project_no ??
        projectReference?.proposal_number ??
        '',
      project_name:
        project?.project_name ??
        data?.project_name ??
        projectReference?.project_name ??
        revision?.project_name ??
        '',
      client_name: project?.client_name ?? data?.client_name ?? revision?.client_name ?? '',
      client_contact_name:
        project?.client_contact_name ?? data?.contact_name ?? revision?.contact_name ?? '',
      city: project?.city ?? data?.city ?? '',
      copies_to: project?.copies_to ?? data?.copies_to ?? '',
      circ_adm: project?.circ_adm ?? data?.circ_adm ?? '',
      ch_file: project?.ch_file ?? data?.ch_file ?? '',
      estimated_total_fees:
        project?.estimated_total_fees ?? data?.estimated_total_fees ?? null,
    };
  }

  private revisionHasDetails(revision: any): boolean {
    if (!revision) {
      return false;
    }

    const hasJob =
      (Array.isArray(revision?.job_costings) && revision.job_costings.length > 0) ||
      (Array.isArray(revision?.job_costing) && revision.job_costing.length > 0);
    const hasFee =
      Array.isArray(revision?.fee_agreements) && revision.fee_agreements.length > 0;

    return hasJob || hasFee;
  }

  private normalizeProjectIdsForWrite(payload: any): any {
    const projectReferenceId =
      Number(payload?.proposal_project_reference_id ?? payload?.proposalProjectReferenceId ?? 0) || null;
    const projectId = Number(payload?.project_id ?? payload?.projectId ?? 0) || null;

    if (projectReferenceId && projectId && projectReferenceId === projectId) {
      return {
        ...payload,
        project_id: null,
        projectId: null,
      };
    }

    return payload;
  }

  // =========================
  // CREATE (POST)  ✅ dash
  // POST /api/fee-sheets
  // =========================
  create(payload: any): Observable<any> {
    if (!payload?.fee_sheet_type) {
      throw new Error('FeeSheetService.create: "fee_sheet_type" is required');
    }

    return this.http.post<any>(
      this.apiConfig.buildUrl('api/fee-sheets'),
      this.normalizeProjectIdsForWrite(payload)
    );
  }

  // =========================
  // EDIT = CREATE REVISION ✅ dash
  // POST /api/fee-sheets/{id}/revisions
  // =========================
  createRevision(feeSheetId: number | string, payload: any): Observable<any> {
    if (feeSheetId === null || feeSheetId === undefined || feeSheetId === '') {
      throw new Error('FeeSheetService.createRevision: "feeSheetId" is required');
    }
    if (!payload?.fee_sheet_type) {
      throw new Error('FeeSheetService.createRevision: "fee_sheet_type" is required');
    }

    return this.http.post<any>(
      this.apiConfig.buildUrl(`api/fee-sheets/${feeSheetId}/revisions`),
      this.normalizeProjectIdsForWrite(payload)
    );
  }

  // =========================
  // UPDATE (compat helper for form components)
  // Backend fee-sheet edit creates a new revision under existing fee sheet.
  // =========================
  update(feeSheetId: number | string, payload: any): Observable<any> {
    return this.createRevision(feeSheetId, payload);
  }

  // =========================
  // EDIT CURRENT REVISION (PUT)
  // PUT /api/fee-sheets/{id}
  // =========================
  editCurrentRevision(feeSheetId: number | string, payload: any): Observable<any> {
    if (feeSheetId === null || feeSheetId === undefined || feeSheetId === '') {
      throw new Error('FeeSheetService.editCurrentRevision: "feeSheetId" is required');
    }

    const body = {
      ...this.normalizeProjectIdsForWrite(payload),
      mode: 'edit_current',
    };

    return this.http.put<any>(
      this.apiConfig.buildUrl(`api/fee-sheets/${feeSheetId}`),
      body
    );
  }

  updateApproval(
    feeSheetId: number | string,
    decision: 'approve' | 'reject' | 'approved' | 'rejected',
    comments?: string | null
  ): Observable<any> {
    if (feeSheetId === null || feeSheetId === undefined || feeSheetId === '') {
      throw new Error('FeeSheetService.updateApproval: "feeSheetId" is required');
    }

    const approved = normalizeFeeSheetStatus(decision) === 'approved';
    const now = this.getCurrentLocalDateTime();
    const body: any = {
      mode: 'edit_current',
      status: approved ? 'approved' : 'rejected',
      approved_by_ch_status: approved ? 'approved' : 'rejected',
      approved_by_ch_date: now,
    };

    if (comments !== undefined && comments !== null) {
      body.approved_by_ch_comments = comments;
      body.approved_by_ch_comment = comments;
      body.comments = comments;
    }

    return this.http.put<any>(
      this.apiConfig.buildUrl(`api/fee-sheets/${feeSheetId}`),
      body
    );
  }

  // =========================
  // LIST BY TYPE ✅ dash
  // GET /api/get_fee-sheets?fee_sheet_type=...&page=...
  // =========================
  listByType(
    type: FeeSheetType,
    page: number = 1,
    perPage: number = 25,
    sortBy: string = 'created_at',
    sortDirection: 'asc' | 'desc' = 'desc'
  ): Observable<{
    items: FeeSheetRow[];
    total: number;
    page: number;
    perPage: number;
    lastPage: number;
  }> {
    const params = new HttpParams()
      .set('fee_sheet_type', type)
      .set('page', String(page))
      .set('per_page', String(perPage))
      .set('sort_by', sortBy)
      .set('sort_direction', sortDirection);

    return this.http
      .get<FeeSheetsListApiResponse>(this.apiConfig.buildUrl('api/get_fee-sheets'), { params })
      .pipe(
        map((res) => {
          const rows = Array.isArray(res?.data) ? res.data : [];
          return {
            items: rows.map((x) => this.transformRow(x, type)),
            total: res?.meta?.total ?? 0,
            page: res?.meta?.current_page ?? page,
            perPage: res?.meta?.per_page ?? 25,
            lastPage: res?.meta?.last_page ?? 1,
          };
        })
      );
  }

  // =========================
  // RAW LIST (ถ้าหน้าเก่าต้องการ)
  // GET /api/get_fee-sheets
  // =========================
  getByType(type: FeeSheetType, page: number = 1): Observable<FeeSheetsListApiResponse> {
    const params = new HttpParams().set('fee_sheet_type', type).set('page', String(page));
    return this.http.get<FeeSheetsListApiResponse>(this.apiConfig.buildUrl('api/get_fee-sheets'), { params });
  }

  // =========================
  // PAGE (ถ้า backend ใช้)
  // POST /api/fee_sheets_page  ✅ underscore
  // =========================
  page(body: any): Observable<any> {
    return this.http.post<any>(this.apiConfig.buildUrl('api/fee_sheets_page'), body);
  }

  // =========================
  // GET BY ID ✅ underscore
  // GET /api/fee_sheets/{id}
  // =========================
  getById(
    id: number | string
  ): Observable<{
    id: number;
    projectId: number | null;
    proposalProjectReferenceId?: number | null;
    proposal_project_reference_id?: number | null;
    mtProjectNo: string;
    status: FeeSheetWorkflowStatus;
    revision: any;
    currentRevision?: any;
    revisions?: any[];
    project: any;
  }> {
    const params = new HttpParams().set('_t', String(Date.now()));
    return this.http
      .get<FeeSheetByIdApiResponse>(this.apiConfig.buildUrl(`api/fee_sheets/${id}`), { params })
      .pipe(
        map((res) => {
          const data = this.unwrapFeeSheetResponse(res);
          const flatRevision = this.looksLikeFeeSheetRevision(data)
            ? this.normalizeRevision(data)
            : null;
          const rev = this.normalizeRevision(data?.current_revision ?? data?.revision ?? null, flatRevision);
          const revisions = Array.isArray(data?.revisions)
            ? data.revisions
                .map((row: any) => this.normalizeRevision(row, flatRevision))
                .filter(Boolean)
                .sort((a: any, b: any) => Number(a?.rev_no ?? a?.revision_no ?? 0) - Number(b?.rev_no ?? b?.revision_no ?? 0))
            : [];
          const latestRevision = revisions[revisions.length - 1] ?? null;
          const chosenRevision = rev ?? latestRevision ?? flatRevision ?? null;
          const normalizedCurrentRevision = rev ?? latestRevision ?? flatRevision ?? chosenRevision ?? null;
          const normalizedRevisions = revisions.length
            ? revisions
            : (chosenRevision ? [chosenRevision] : []);
          const normalizedProject = this.normalizeProject(
            data,
            chosenRevision ?? normalizedCurrentRevision
          );
          const proposalProjectReferenceId =
            Number(
              data?.proposal_project_reference_id ??
                data?.proposalProjectReferenceId ??
                chosenRevision?.proposal_project_reference_id ??
                chosenRevision?.proposalProjectReferenceId ??
                normalizedCurrentRevision?.proposal_project_reference_id ??
                normalizedCurrentRevision?.proposalProjectReferenceId ??
                normalizedProject?.proposal_project_reference_id ??
                normalizedProject?.proposalProjectReferenceId ??
                0
            ) || null;

          if (proposalProjectReferenceId) {
            if (chosenRevision) {
              chosenRevision.proposal_project_reference_id = proposalProjectReferenceId;
              chosenRevision.proposalProjectReferenceId = proposalProjectReferenceId;
            }

            if (normalizedCurrentRevision) {
              normalizedCurrentRevision.proposal_project_reference_id = proposalProjectReferenceId;
              normalizedCurrentRevision.proposalProjectReferenceId = proposalProjectReferenceId;
            }
          }

          return {
            id: Number(data?.id ?? id),
            projectId: Number(
              data?.project_id ??
                data?.projectId ??
                chosenRevision?.project_id ??
                normalizedCurrentRevision?.project_id ??
                0
            ) || null,
            proposalProjectReferenceId,
            proposal_project_reference_id: proposalProjectReferenceId,
            mtProjectNo:
              data?.mt_project_no ??
              data?.mtProjectNo ??
              chosenRevision?.mt_project_no ??
              normalizedCurrentRevision?.mt_project_no ??
              '',
            status: resolveFeeSheetStatus(
              normalizedCurrentRevision?.status,
              normalizedCurrentRevision?.approved_by_ch_status,
              chosenRevision?.status,
              chosenRevision?.approved_by_ch_status,
              data?.status,
              data?.current_status,
              data?.workflow_status
            ),
            revision: chosenRevision,
            currentRevision: normalizedCurrentRevision,
            revisions: normalizedRevisions,
            project: normalizedProject,
          };
        })
      );
  }

  // =========================
  // DELETE ✅ underscore
  // DELETE /api/fee_sheets/{id}
  // =========================
  delete(id: number | string): Observable<any> {
    return this.http.delete<any>(this.apiConfig.buildUrl(`api/fee_sheets/${id}`));
  }

  deleteById(id: number | string): Observable<any> {
    return this.delete(id);
  }

  // =========================
  // mapper (list row)
  // =========================
  private transformRow(item: any, fallbackType: FeeSheetType = 'project'): FeeSheetRow {
    const rev = item?.current_revision ?? item?.revision ?? null;
    const revisions = Array.isArray(item?.revisions) ? item.revisions : [];
    const latestRevision = revisions.length
      ? [...revisions].sort(
          (a: any, b: any) =>
            Number(a?.rev_no ?? a?.revision_no ?? a?.id ?? 0) -
            Number(b?.rev_no ?? b?.revision_no ?? b?.id ?? 0)
        )[revisions.length - 1]
      : null;
    const revision = {
      ...(latestRevision ?? {}),
      ...(rev ?? {}),
    };
    const proj = item?.project ?? null;
    const projectReference =
      item?.project_reference ??
      item?.projectReference ??
      revision?.project_reference ??
      revision?.projectReference ??
      latestRevision?.project_reference ??
      latestRevision?.projectReference ??
      null;
    const effectiveType = revision?.fee_sheet_type ?? item?.fee_sheet_type ?? fallbackType;
    const rawFeeAgreements = this.pickArray(
      revision?.fee_agreements,
      rev?.fee_agreements,
      latestRevision?.fee_agreements,
      item?.fee_agreements
    );
    const feeAgreements = this.usesFullPageRevisionSnapshots(effectiveType)
      ? this.latestSectionRows(rawFeeAgreements, true)
      : rawFeeAgreements;
    const currentFeeAgreement =
      feeAgreements[0] ??
      revision?.fee_agreement ??
      revision?.feeAgreement ??
      item?.fee_agreement ??
      item?.feeAgreement ??
      (item?.gross_fee_excl_vat !== undefined || item?.net_fee_excl_vat !== undefined ? item : null);

    return {
      id: String(item?.id),
      projectPNo:
        item?.proposal_number ??
        item?.proposalNumber ??
        projectReference?.proposal_number ??
        projectReference?.proposalNumber ??
        proj?.proposal_number ??
        proj?.proposalNumber ??
        proj?.project_no ??
        proj?.projectNo ??
        '-',
      projectNo:
        revision?.mt_project_no ??
        latestRevision?.mt_project_no ??
        item?.mt_project_no ??
        projectReference?.project_number ??
        projectReference?.projectNumber ??
        proj?.mt_project_no ??
        proj?.project_number ??
        proj?.project_no ??
        '-',
      projectName: revision?.project_name ?? proj?.project_name ?? '-',
      client: revision?.client_name ?? proj?.client_name ?? '-',
      discipline: revision?.discipline?.name ?? String(revision?.discipline_id ?? '-'),
      projectType: this.formatProjectTypeLabel(revision?.project_type, revision?.project_type_id),
      grossFee: Number(currentFeeAgreement?.gross_fee_excl_vat ?? 0),
      nettFee: Number(currentFeeAgreement?.net_fee_excl_vat ?? 0),
      status: resolveFeeSheetStatus(
        revision?.status,
        revision?.approved_by_ch_status,
        latestRevision?.status,
        latestRevision?.approved_by_ch_status,
        item?.status,
        item?.current_status,
        item?.workflow_status
      ),
      filledInBy: String(revision?.form_filled_by_id ?? '-'),
      approvedBy: String(revision?.approved_by_ch_id ?? '-'),
      createdAt: revision?.created_at ?? item?.created_at ?? '',
      updatedAt: revision?.updated_at ?? item?.updated_at ?? '',
      feeSheetType: effectiveType as FeeSheetType,
    };
  }

  private formatProjectTypeLabel(projectType: any, id: any): string {
    const code = String(projectType?.code ?? '').trim();
    const name = String(projectType?.name ?? '').trim();
    if (code && name) return `${code} - ${name}`;
    if (name) return name;
    return String(id ?? '-');
  }

  private getCurrentLocalDateTime(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}
