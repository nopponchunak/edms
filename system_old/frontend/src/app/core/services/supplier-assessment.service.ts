import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiConfig } from '../config/api.config';

export interface SupplierAssessment {
  id: number;
  itemsSupplied: string;
  informationUsedForAssessment: string[];
  companyName: string;
  experienceScore: number;
  qualifiedStaffScore: number;
  productComplianceScore: number;
  totalScore: number;
  references: Array<{
    name: string;
    opinion: 'negative' | 'neutral' | 'positive';
  }>;
  recommendation: 'accept' | 'not_accept';
  reason?: string;
  assessedBy?: string | null;
  assessedByName?: string | null;
  assessedByDate?: string | null;
  assessedByStatus?: 'pending' | 'reject' | 'approve' | null;
  assessedDate: Date;
  approvedForSupplierList: boolean;
  approvedRemark?: string;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedByDate?: string | null;
  approvedByStatus?: 'pending' | 'reject' | 'approve' | null;
  approvedDate?: Date;
  acknowledgedBy?: string | null;
  acknowledgedByName?: string | null;
  acknowledgedByDate?: string | null;
  acknowledgedByStatus?: 'pending' | 'reject' | 'approve' | null;
  acknowledgedDate?: Date;
  status: 'draft' | 'submitted' | 'assessed' | 'approved' | 'rejected';
  rejectionReason?: string;
  createBy?: string | null;
  createByName?: string | null;
  updateBy?: string | null;
  updateByName?: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Paths from API e.g. ["uploads/files/a.pdf"] */
  attachments?: string[];
}

export interface CreateSupplierAssessmentRequest {
  itemsSupplied: string;
  informationUsedForAssessment: string[];
  companyName: string;
  experienceScore: number;
  qualifiedStaffScore: number;
  productComplianceScore: number;
  references: Array<{
    name: string;
    opinion: 'negative' | 'neutral' | 'positive';
  }>;
  recommendation: 'accept' | 'not_accept';
  reason?: string;
  assessedBy: string;
  assessedDate: string;
  approvedForSupplierList: boolean;
  approvedRemark?: string;
  approvedBy?: string;
  approvedDate?: string;
  acknowledgedBy?: string;
  acknowledgedDate?: string;
  attachments?: string[];
}

export interface UpdateSupplierAssessmentRequest extends Partial<CreateSupplierAssessmentRequest> {}

export interface UpdateStatusDto {
  table: string;
  field: 'assessed_by' | 'approved_by' | 'acknowledged_by';
  status: 'PENDING' | 'REJECT' | 'APPROVED';
  /** When field is approved_by: 1 = Yes, '-' = No (or not approved). */
  approved_to_supplier_list?: number | string;
  /** When field is approved_by: remark for the approval decision. */
  remark?: string;
}

export interface SupplierAssessmentStats {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
}

@Injectable({
  providedIn: 'root'
})
export class SupplierAssessmentService {
  constructor(
    private http: HttpClient,
    private apiConfig: ApiConfig
  ) {}

  create(data: CreateSupplierAssessmentRequest): Observable<SupplierAssessment> {
    return this.http.post<SupplierAssessmentApiResponse>(this.apiConfig.buildUrl('api/supplier_assessments'), data).pipe(
      map(response => this.transformSupplierAssessmentApiResponse(response))
    );
  }

  findAll(): Observable<SupplierAssessment[]> {
    return this.http.get<SupplierAssessment[]>(this.apiConfig.buildUrl('api/supplier-assessments'));
  }

  /**
   * Get paginated supplier assessments list using POST /api/supplier_assessments_page
   */
  findAllPaginated(request: SupplierAssessmentsPageRequest): Observable<SupplierAssessment[]> {
    return this.http.post<SupplierAssessmentsPageApiResponse>(this.apiConfig.buildUrl('api/supplier_assessments_page'), request).pipe(
      map(response => {
        // Handle paginated response structure
        let items: any[] = [];
        if (Array.isArray(response.data)) {
          items = response.data;
        } else if (response.data && typeof response.data === 'object' && 'data' in response.data) {
          items = response.data.data || [];
        }
        return items.map((item: any) => this.transformSupplierAssessmentItem(item));
      })
    );
  }

  findOne(id: number): Observable<SupplierAssessment> {
    return this.http.get<SupplierAssessmentApiResponse>(this.apiConfig.buildUrl(`api/supplier_assessments/${id}`)).pipe(
      map(response => this.transformSupplierAssessmentApiResponse(response))
    );
  }

  update(id: number, data: UpdateSupplierAssessmentRequest): Observable<SupplierAssessment> {
    return this.http.put<SupplierAssessmentApiResponse>(this.apiConfig.buildUrl(`api/supplier_assessments/${id}`), data).pipe(
      map(response => this.transformSupplierAssessmentApiResponse(response))
    );
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(this.apiConfig.buildUrl(`api/supplier_assessments/${id}`));
  }

  getStats(): Observable<SupplierAssessmentStats> {
    return this.http.get<SupplierAssessmentStats>(this.apiConfig.buildUrl('api/supplier-assessments/stats'));
  }

  updateStatus(id: string, updateStatusDto: UpdateStatusDto): Observable<any> {
    return this.http.put(this.apiConfig.buildUrl(`api/update_status/${id}`), updateStatusDto);
  }

  /**
   * Convert SupplierAssessment (from GET) to API update payload (snake_case).
   * Use for PUT after loading assessment (e.g. action request).
   */
  assessmentToUpdatePayload(assessment: SupplierAssessment): Record<string, unknown> {
    const info = assessment.informationUsedForAssessment || [];
    const refA = assessment.references?.[0];
    const refB = assessment.references?.[1];
    return {
      items_supplied: assessment.itemsSupplied || '',
      info_company_profile: info.includes('company_profile') ? 1 : 0,
      info_project_reference: info.includes('project_reference') ? 1 : 0,
      info_site_visit: info.includes('site_visit') ? 1 : 0,
      info_previous_assessment_record: info.includes('previous_assessment_record') ? 1 : 0,
      info_previous_evaluation_record: info.includes('previous_evaluation_record') ? 1 : 0,
      info_iso_certificates: info.includes('iso_certificates') ? 1 : 0,
      company_name: assessment.companyName || '',
      experience_score: assessment.experienceScore ?? 0,
      staff_score: assessment.qualifiedStaffScore ?? 0,
      product_compliance_score: assessment.productComplianceScore ?? 0,
      total_score: assessment.totalScore ?? 0,
      reference_a_name: refA?.name || '',
      reference_a_opinion: refA?.opinion || '',
      reference_b_name: refB?.name || '',
      reference_b_opinion: refB?.opinion || '',
      recommendation: assessment.recommendation || '',
      recommendation_reason: assessment.reason || '',
      assessed_by: assessment.assessedBy || null,
      assessed_by_date: assessment.assessedByDate ? this.formatDateForApi(assessment.assessedByDate) : null,
      assessed_by_status: assessment.assessedByStatus || null,
      assessed_date: assessment.assessedDate ? this.formatDateForApi(assessment.assessedDate) : '',
      approved_to_supplier_list: assessment.approvedForSupplierList === true ? 1 : '-',
      remark: assessment.approvedRemark || '',
      approved_by: assessment.approvedBy || null,
      approved_by_date: assessment.approvedByDate ? this.formatDateForApi(assessment.approvedByDate) : null,
      approved_by_status: assessment.approvedByStatus || null,
      approved_date: assessment.approvedDate ? this.formatDateForApi(assessment.approvedDate) : '',
      acknowledged_by: assessment.acknowledgedBy || null,
      acknowledged_by_date: assessment.acknowledgedByDate ? this.formatDateForApi(assessment.acknowledgedByDate) : null,
      acknowledged_by_status: assessment.acknowledgedByStatus || null,
      acknowledged_date: assessment.acknowledgedDate ? this.formatDateForApi(assessment.acknowledgedDate) : ''
    };
  }

  private formatDateForApi(value: Date | string | null | undefined): string {
    if (value == null) return '';
    const d = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const seconds = d.getSeconds().toString().padStart(2, '0');
    return `${y}-${m}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Transform supplier assessment item from snake_case to camelCase
   */
  private transformSupplierAssessmentItem(item: any): SupplierAssessment {
    // Build informationUsedForAssessment array from boolean fields
    const informationUsed: string[] = [];
    if (item.info_company_profile === 1) informationUsed.push('company_profile');
    if (item.info_project_reference === 1) informationUsed.push('project_reference');
    if (item.info_site_visit === 1) informationUsed.push('site_visit');
    if (item.info_previous_assessment_record === 1) informationUsed.push('previous_assessment_record');
    if (item.info_previous_evaluation_record === 1) informationUsed.push('previous_evaluation_record');
    if (item.info_iso_certificates === 1) informationUsed.push('iso_certificates');

    // Build references array
    const references: Array<{ name: string; opinion: 'negative' | 'neutral' | 'positive' }> = [];
    if (item.reference_a_name) {
      references.push({
        name: item.reference_a_name,
        opinion: this.parseOpinion(item.reference_a_opinion)
      });
    }
    if (item.reference_b_name) {
      references.push({
        name: item.reference_b_name,
        opinion: this.parseOpinion(item.reference_b_opinion)
      });
    }

    return {
      id: item.id,
      itemsSupplied: item.items_supplied || '',
      informationUsedForAssessment: informationUsed,
      companyName: item.company_name || '',
      experienceScore: item.experience_score || 0,
      qualifiedStaffScore: item.staff_score || 0,
      productComplianceScore: item.product_compliance_score || 0,
      totalScore: item.total_score || 0,
      references: references,
      recommendation: item.recommendation as 'accept' | 'not_accept',
      reason: item.recommendation_reason,
      assessedBy: item.assessed_by || null,
      assessedByName: item.assessed_by_name || null,
      assessedByDate: item.assessed_by_date || null,
      assessedByStatus: item.assessed_by_status ? (item.assessed_by_status.toString().toLowerCase() as 'pending' | 'reject' | 'approve') : null,
      assessedDate: item.assessed_date ? new Date(item.assessed_date) : new Date(),
      approvedForSupplierList: item.approved_to_supplier_list === 1,
      approvedRemark: item.remark,
      approvedBy: item.approved_by || null,
      approvedByName: item.approved_by_name || null,
      approvedByDate: item.approved_by_date || null,
      approvedByStatus: item.approved_by_status ? (item.approved_by_status.toString().toLowerCase() as 'pending' | 'reject' | 'approve') : null,
      approvedDate: item.approved_date ? new Date(item.approved_date) : undefined,
      acknowledgedBy: item.acknowledged_by || null,
      acknowledgedByName: item.acknowledged_by_name || null,
      acknowledgedByDate: item.acknowledged_by_date || null,
      acknowledgedByStatus: item.acknowledged_by_status ? (item.acknowledged_by_status.toString().toLowerCase() as 'pending' | 'reject' | 'approve') : null,
      acknowledgedDate: item.acknowledged_date ? new Date(item.acknowledged_date) : undefined,
      status: this.determineStatus(item),
      rejectionReason: undefined,
      createBy: item.create_by || item.created_by || null,
      createByName: item.create_by_name || item.created_by_name || null,
      updateBy: item.update_by || item.updated_by || null,
      updateByName: item.update_by_name || item.updated_by_name || null,
      createdAt: item.created_at ? new Date(item.created_at) : new Date(),
      updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
      attachments: Array.isArray(item.attachments) ? item.attachments : []
    };
  }

  private parseOpinion(opinion: string): 'negative' | 'neutral' | 'positive' {
    if (!opinion) return 'neutral';
    const lower = opinion.toLowerCase();
    if (lower.includes('good') || lower.includes('excellent') || lower.includes('positive')) {
      return 'positive';
    }
    if (lower.includes('bad') || lower.includes('poor') || lower.includes('negative')) {
      return 'negative';
    }
    return 'neutral';
  }

  private determineStatus(item: any): 'draft' | 'submitted' | 'assessed' | 'approved' | 'rejected' {
    // Determine status based on available fields
    if (item.approved_by && item.approved_date) {
      return 'approved';
    }
    if (item.assessed_by && item.assessed_date) {
      return 'assessed';
    }
    if (item.recommendation === 'not_accept') {
      return 'rejected';
    }
    return 'submitted';
  }

  /**
   * Transform single supplier assessment API response to SupplierAssessment model
   */
  private transformSupplierAssessmentApiResponse(response: SupplierAssessmentApiResponse): SupplierAssessment {
    const item = response.data;
    return this.transformSupplierAssessmentItem(item);
  }
}

interface SupplierAssessmentApiResponse {
  code: string;
  status: boolean;
  message: string;
  data: {
    id: number;
    items_supplied: string;
    company_name: string;
    info_company_profile: number;
    info_project_reference: number;
    info_site_visit: number;
    info_previous_assessment_record: number;
    info_previous_evaluation_record: number;
    info_iso_certificates: number;
    experience_score: number;
    staff_score: number;
    product_compliance_score: number;
    total_score: number;
    reference_a_name?: string;
    reference_a_opinion?: string;
    reference_b_name?: string;
    reference_b_opinion?: string;
    recommendation: string;
    recommendation_reason?: string;
    assessed_by?: string;
    assessed_by_name?: string;
    assessed_by_date?: string;
    assessed_by_status?: string;
    assessed_date?: string;
    approved_to_supplier_list?: number;
    remark?: string;
    approved_by?: string;
    approved_by_name?: string;
    approved_by_date?: string;
    approved_by_status?: string;
    approved_date?: string;
    acknowledged_by?: string;
    acknowledged_by_name?: string;
    acknowledged_by_date?: string;
    acknowledged_by_status?: string;
    acknowledged_date?: string;
    create_by?: string;
    create_by_name?: string;
    update_by?: string;
    update_by_name?: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
    [key: string]: any;
  };
}

// Interfaces for supplier assessments page API
export interface SupplierAssessmentsPageRequest {
  draw: number;
  type?: string;
  columns: Array<{ data: string }>;
  order: Array<{ column: number; dir: 'asc' | 'desc' }>;
  start: number;
  length: number;
  search: {
    value: string;
    regex: boolean;
  };
}

interface SupplierAssessmentsPageApiResponse {
  code: string;
  status: boolean;
  message: string;
  data: {
    current_page?: number;
    data?: any[];
    first_page_url?: string;
    from?: number;
    last_page?: number;
    last_page_url?: string;
    links?: Array<{ url: string | null; label: string; active: boolean }>;
    next_page_url?: string | null;
    path?: string;
    per_page?: number;
    prev_page_url?: string | null;
    to?: number;
    total?: number;
  } | any[];
}


