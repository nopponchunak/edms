import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiConfig } from '../config/api.config';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export type ProposalContractReviewStatus =
  | 'draft'
  | 'submitted'
  | 'pending_proposal_review'
  | 'pending_contract_review'
  | 'proposal_reviewed'
  | 'contract_reviewed'
  | 'contract_approved'
  | 'approved'
  | 'declined';

export interface ProposalContractReviewListItem {
  id: string;
  projectName: string;
  projectNo: string;
  proposalNumber: string;
  projectType: string;
  location: string;
  clientName: string;
  estimatedValue: number;
  currency: string;
  status: ProposalContractReviewStatus;
  filledInBy: string;
  createdAt: string;
  proposalReviewers: string[];
  contractReviewers: string[];
  contractAgreedToProceed?: boolean;
  mtProjects?: ProposalContractReviewProject[];
}

export interface ProposalContractReviewProject {
  id: string;
  proposalContractReviewId: string;
  proposalNumber: string;
  mtProjectNo: string;
  projectNo: string;
  projectName: string;
  primaryDiscipline: string;
  projectType: string;
  currency: string;
  estimatedTotalFees: number;
  sequenceNo: number;
  status: string;
  convertedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentProjectImportSummary {
  proposal_rows: number;
  project_rows: number;
  reference_rows_in_file: number;
  proposal_numbers: number;
  mt_project_numbers: number;
  proposals_with_projects: number;
  existing_proposal_numbers: number;
  existing_mt_project_numbers: number;
  existing_reference_project_numbers: number;
}

export interface CurrentProjectImportCreated {
  proposal_contract_review_ids?: number[];
  proposal_contract_review_project_ids?: number[];
  proposal_project_reference_ids?: number[];
}

export interface CurrentProjectImportData {
  commit: boolean;
  imported: boolean;
  summary: CurrentProjectImportSummary;
  errors: string[];
  warnings: string[];
  created?: CurrentProjectImportCreated;
}

export interface CurrentProjectImportResponse {
  code: string;
  status: boolean;
  message: string;
  data: CurrentProjectImportData;
}

interface ApiListResponse {
  code: string;
  status: boolean;
  message: string;
  data: any[];
}

interface ApiItem {
  id: number;
  status?: string;
  project_name?: string;
  project_no?: string;
  proposal_number?: string;
  project_type?: string;
  city?: string;
  country?: string;
  client_name?: string;
  estimated_total_fees?: string | number;
  currency?: string;

  filled_in_by?: string;
  filled_in_date?: string;

  created_at?: string;
  current_stage?: 'proposal' | 'contract' | null;
  approvals?: Array<{
    stage: 'proposal' | 'contract';
    approver_code: string;
    approver_name?: string;
    role?: string;
    decision?: string;
    acted_at?: string;
  }>;

  // ใช้เดา status (เพราะ API ตัวอย่างไม่ได้ส่ง status มาเป็น field เดียว)
  proposal_to_be_submitted?: number;
  proposal_decline?: number;
  proposal_reviewer1?: string | null;
  proposal_reviewer1_date?: string | null;

  contract_agreed_to_proceed?: number;
  contract_decline?: number;
  contract_reviewer1?: string | null;
  contract_reviewer1_date?: string | null;

  contract_reviewer2?: string | null;
  contract_reviewer3?: string | null;
  proposal_reviewer2?: string | null;
  proposal_reviewer3?: string | null;
  projects?: any[];
  mt_projects?: any[];
}

@Injectable({ providedIn: 'root' })
export class ProposalContractReviewService {
  constructor(private http: HttpClient, private apiConfig: ApiConfig) {}

  private extractRows(response: any): ApiItem[] {
    if (Array.isArray(response)) {
      return response as ApiItem[];
    }

    if (Array.isArray(response?.data?.data)) {
      return response.data.data as ApiItem[];
    }

    if (Array.isArray(response?.data)) {
      return response.data as ApiItem[];
    }

    return [];
  }

  private normalizeStatus(value: any): ProposalContractReviewStatus | null {
    switch (String(value ?? '').trim().toLowerCase()) {
      case 'draft':
      case 'submitted':
      case 'pending_proposal_review':
      case 'pending_contract_review':
      case 'proposal_reviewed':
      case 'contract_reviewed':
      case 'contract_approved':
      case 'approved':
      case 'declined':
        return String(value).trim().toLowerCase() as ProposalContractReviewStatus;
      default:
        return null;
    }
  }

  /** ✅ GET: ตรวจเอาดา (ดึงทั้งหมด) */
  getAll(): Observable<ProposalContractReviewListItem[]> {
    return this.http
      .get<ApiListResponse>(this.apiConfig.buildUrl('api/get_proposal_contract_reviews'))
      .pipe(
        map((res) => this.extractRows(res).map((it) => this.toListItem(it as ApiItem)))
      );
  }

  /** ✅ GET: get by id */
  getById(id: string | number): Observable<any> {
    return this.http.get(this.apiConfig.buildUrl(`api/proposal_contract_reviews/${id}`));
  }

  /** ✅ POST: เพิ่ม */
  create(payload: any): Observable<any> {
    return this.http.post(this.apiConfig.buildUrl('api/proposal_contract_reviews'), payload);
  }

  getNextNumber(proposalNumberType: string): Observable<any> {
    return this.http.get(
      this.apiConfig.buildUrl(`api/proposal_contract_reviews/next-number?primary_discipline=${encodeURIComponent(proposalNumberType || 'general')}`)
    );
  }

  getActionItems(userCode: string): Observable<ProposalContractReviewListItem[]> {
    return this.http
      .get<ApiListResponse>(
        this.apiConfig.buildUrl(`api/proposal_contract_reviews/action-items?user_code=${encodeURIComponent(userCode || '')}`)
      )
      .pipe(map((res) => this.extractRows(res).map((it) => this.toListItem(it as ApiItem))));
  }

  submitProposalReview(id: string | number, payload: any): Observable<any> {
    return this.http.post(this.apiConfig.buildUrl(`api/proposal_contract_reviews/${id}/proposal-review`), payload);
  }

  submitContractReview(id: string | number, payload: any): Observable<any> {
    return this.http.post(this.apiConfig.buildUrl(`api/proposal_contract_reviews/${id}/contract-review`), payload);
  }

  getProjects(id: string | number): Observable<ProposalContractReviewProject[]> {
    return this.http
      .get(this.apiConfig.buildUrl(`api/proposal_contract_reviews/${id}/projects`))
      .pipe(map((res: any) => this.extractRows(res).map((it) => this.toProject(it))));
  }

  createProject(id: string | number, payload: any): Observable<any> {
    return this.http.post(this.apiConfig.buildUrl(`api/proposal_contract_reviews/${id}/projects`), payload);
  }

  createPqaFromReview(id: string | number, payload: any = {}): Observable<any> {
    return this.http.post(
      this.apiConfig.buildUrl(`api/project_quality_assurance_plans/from-proposal-contract-review/${id}`),
      payload
    );
  }

  importCurrentProjects(file: File, commit = false): Observable<CurrentProjectImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('commit', commit ? '1' : '0');

    return this.http.post<CurrentProjectImportResponse>(
      this.apiConfig.buildUrl('api/proposal_contract_reviews/import-current-projects'),
      formData
    );
  }

  /** ✅ PUT: แก้ไข */
  update(id: string | number, payload: any): Observable<any> {
    return this.http.put(this.apiConfig.buildUrl(`api/proposal_contract_reviews/${id}`), payload);
  }

  /** ✅ DELETE: ลบ */
  remove(id: string | number): Observable<any> {
    return this.http.delete(this.apiConfig.buildUrl(`api/proposal_contract_reviews/${id}`));
  }

  // -----------------------
  // mapper
  // -----------------------
  private toListItem(item: ApiItem): ProposalContractReviewListItem {
    const city = item.city ?? '';
    const country = item.country ?? '';
    const location = [city, country].filter(Boolean).join(', ');

    const estimatedValue =
      typeof item.estimated_total_fees === 'string'
        ? Number(item.estimated_total_fees)
        : Number(item.estimated_total_fees ?? 0);

    return {
      id: String(item.id),
      projectName: item.project_name ?? '-',
      projectNo: item.project_no ?? '-',
      proposalNumber: item.proposal_number ?? '-',
      projectType: item.project_type ?? '-',
      location,
      clientName: item.client_name ?? '-',
      estimatedValue: isNaN(estimatedValue) ? 0 : estimatedValue,
      currency: item.currency ?? 'THB',

      status: this.deriveStatus(item),
      filledInBy: item.filled_in_by ?? '-',
      createdAt: item.created_at ?? item.filled_in_date ?? '',

      proposalReviewers: this.extractReviewerCodes(item, 'proposal'),
      contractReviewers: this.extractReviewerCodes(item, 'contract'),
      contractAgreedToProceed: this.toBool(item.contract_agreed_to_proceed),
      mtProjects: this.extractProjectRows(item).map((project) => this.toProject(project)),
    };
  }

  toProject(project: any): ProposalContractReviewProject {
    const estimatedTotalFees = Number(project?.estimated_total_fees ?? project?.estimatedTotalFees ?? 0);

    return {
      id: String(project?.id ?? ''),
      proposalContractReviewId: String(project?.proposal_contract_review_id ?? project?.proposalContractReviewId ?? ''),
      proposalNumber: project?.proposal_number ?? project?.proposalNumber ?? '-',
      mtProjectNo: project?.mt_project_no ?? project?.mtProjectNo ?? '-',
      projectNo: project?.project_no ?? project?.projectNo ?? project?.mt_project_no ?? project?.mtProjectNo ?? '-',
      projectName: project?.project_name ?? project?.projectName ?? '-',
      primaryDiscipline: project?.primary_discipline ?? project?.primaryDiscipline ?? '-',
      projectType: project?.project_type ?? project?.projectType ?? '-',
      currency: project?.currency ?? 'THB',
      estimatedTotalFees: Number.isFinite(estimatedTotalFees) ? estimatedTotalFees : 0,
      sequenceNo: this.toNumber(project?.sequence_no ?? project?.sequenceNo ?? 0),
      status: project?.status ?? 'active',
      convertedAt: project?.converted_at ?? project?.convertedAt ?? '',
      createdAt: project?.created_at ?? project?.createdAt ?? '',
      updatedAt: project?.updated_at ?? project?.updatedAt ?? '',
    };
  }

  private extractProjectRows(item: ApiItem): any[] {
    if (Array.isArray(item.projects)) {
      return item.projects;
    }

    if (Array.isArray(item.mt_projects)) {
      return item.mt_projects;
    }

    return [];
  }

  /** เดา status จาก field ที่มี (ปรับได้ตาม backend จริง) */
  private deriveStatus(item: ApiItem): ProposalContractReviewStatus {
    const explicitStatus = this.normalizeStatus(item.status);
    if (explicitStatus) return explicitStatus;

    if ((item.proposal_decline ?? 0) === 1 || (item.contract_decline ?? 0) === 1) return 'declined';
    if ((item.contract_agreed_to_proceed ?? 0) === 1 || item.contract_reviewer1 || item.contract_reviewer1_date) return 'contract_reviewed';
    if (item.proposal_reviewer1 || item.proposal_reviewer1_date) return 'proposal_reviewed';
    if ((item.proposal_to_be_submitted ?? 0) === 1) return 'submitted';
    return 'draft';
  }

  private extractReviewerCodes(item: ApiItem, stage: 'proposal' | 'contract'): string[] {
    const fromApproval = (item.approvals ?? [])
      .filter((approval) => approval.stage === stage)
      .map((approval) => approval.approver_code)
      .filter(Boolean);

    if (fromApproval.length) {
      return fromApproval;
    }

    return stage === 'proposal'
      ? [item.proposal_reviewer1, item.proposal_reviewer2, item.proposal_reviewer3].filter(Boolean) as string[]
      : [item.contract_reviewer1, item.contract_reviewer2, item.contract_reviewer3].filter(Boolean) as string[];
  }

  private toNumber(value: any): number {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private toBool(value: any): boolean {
    const normalized = String(value ?? '').trim().toLowerCase();
    return value === true || value === 1 || normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
}
