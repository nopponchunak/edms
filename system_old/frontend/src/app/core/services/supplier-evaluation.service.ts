import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiConfig } from '../config/api.config';

export interface SupplierEvaluation {
  id: number;
  supplierName: string;
  projectName: string;
  projectNo: string;
  departmentPurchasedValueDuration: string;
  hasAntiCorruptionViolation: boolean;
  qualityAccuracyScore: number;
  timelinessDocumentationScore: number;
  understandingNeedsScore: number;
  cooperationResponsivenessScore: number;
  timelinessDeliveryScore: number;
  qualityProductsScore: number;
  meetEmsOhsmsScore: number;
  othersScore: number;
  averageRating: number;
  qualityAccuracyComment?: string;
  timelinessDocumentationComment?: string;
  understandingNeedsComment?: string;
  cooperationResponsivenessComment?: string;
  timelinessDeliveryComment?: string;
  qualityProductsComment?: string;
  meetEmsOhsmsComment?: string;
  othersComment?: string;
  decision?: 'maintain' | 'remove';
  decisionReason?: string;
  evaluatedBy: string;
  evaluatedDate: Date;
  approvedBy?: string;
  approvedDate?: Date;
  approvalReason?: string;
  acknowledgedBy?: string;
  acknowledgedDate?: Date;
  status: 'draft' | 'evaluated' | 'approved' | 'acknowledged' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

// Interface for list items (simplified for list view)
export interface SupplierEvaluationListItem {
  id: string;
  supplierName: string;
  projectName: string;
  projectNo: string;
  departmentValueDuration: string;
  averageRating: number;
  decision: 'maintain' | 'remove';
  createBy: string | null;
  updateBy: string | null;
  createdAt: string;
  updatedAt: string;
  No: number;
  // Workflow fields
  evaluatedBy?: string | null;
  evaluatedByDate?: string | null;
  evaluatedByStatus?: 'pending' | 'reject' | 'approve' | null;
  approvedBy?: string | null;
  approvedByDate?: string | null;
  approvedByStatus?: 'pending' | 'reject' | 'approve' | null;
  acknowledgedBy?: string | null;
  acknowledgedByDate?: string | null;
  acknowledgedByStatus?: 'pending' | 'reject' | 'approve' | null;
}

export interface CreateSupplierEvaluationRequest {
  supplierName: string;
  projectName: string;
  projectNo: string;
  departmentPurchasedValueDuration: string;
  hasAntiCorruptionViolation: boolean;
  qualityAccuracyScore: number;
  timelinessDocumentationScore: number;
  understandingNeedsScore: number;
  cooperationResponsivenessScore: number;
  timelinessDeliveryScore: number;
  qualityProductsScore: number;
  meetEmsOhsmsScore: number;
  othersScore: number;
  qualityAccuracyComment?: string;
  timelinessDocumentationComment?: string;
  understandingNeedsComment?: string;
  cooperationResponsivenessComment?: string;
  timelinessDeliveryComment?: string;
  qualityProductsComment?: string;
  meetEmsOhsmsComment?: string;
  othersComment?: string;
  decision?: 'maintain' | 'remove';
  decisionReason?: string;
  evaluatedBy: string;
  evaluatedDate: string;
  approvedBy?: string;
  approvedDate?: string;
  approvalReason?: string;
  acknowledgedBy?: string;
  acknowledgedDate?: string;
}

export interface UpdateSupplierEvaluationRequest extends Partial<CreateSupplierEvaluationRequest> {}

export interface UpdateStatusDto {
  table: string;
  field: 'evaluated_by_status' | 'approved_by_status' | 'acknowledged_by_status';
  status: 'PENDING' | 'REJECT' | 'APPROVED';
}

export interface SupplierEvaluationStats {
  total: number;
  maintained: number;
  removed: number;
  pending: number;
}

@Injectable({
  providedIn: 'root'
})
export class SupplierEvaluationService {
  constructor(
    private http: HttpClient,
    private apiConfig: ApiConfig
  ) {}

  create(data: any): Observable<any> {
    return this.http.post<any>(this.apiConfig.buildUrl('api/supplier_evaluation'), data);
  }

  findAll(): Observable<SupplierEvaluation[]> {
    return this.http.get<SupplierEvaluation[]>(this.apiConfig.buildUrl('api/supplier-evaluations'));
  }

  /**
   * Get paginated supplier evaluations list using POST /api/supplier_evaluation_page
   */
  findAllPaginated(request: SupplierEvaluationsPageRequest): Observable<SupplierEvaluationListItem[]> {
    return this.http.post<SupplierEvaluationsPageApiResponse>(this.apiConfig.buildUrl('api/supplier_evaluation_page'), request).pipe(
      map(response => {
        // Handle paginated response structure
        let items: any[] = [];
        if (Array.isArray(response.data)) {
          items = response.data;
        } else if (response.data && typeof response.data === 'object' && 'data' in response.data) {
          items = response.data.data || [];
        }
        return items.map((item: any) => this.transformSupplierEvaluationItem(item));
      })
    );
  }

  findOne(id: number | string): Observable<any> {
    return this.http.get<SupplierEvaluationApiResponse>(this.apiConfig.buildUrl(`api/supplier_evaluation/${id}`)).pipe(
      map(response => this.transformSupplierEvaluationApiResponse(response))
    );
  }

  /**
   * Transform supplier evaluation API response from snake_case to camelCase
   */
  private transformSupplierEvaluationApiResponse(response: SupplierEvaluationApiResponse): any {
    const item: any = response.data;
    return {
      id: String(item.id),
      supplierName: item.supplier_name || '',
      projectName: item.project_name || '',
      projectNo: item.project_no || '',
      departmentValueDuration: item.department_value_duration || '',
      antiCorruptionFlag: item.anti_corruption_flag === 1,
      averageRating: typeof item.average_rating === 'string' ? parseFloat(item.average_rating) : (item.average_rating || 0),
      decision: item.decision as 'maintain' | 'remove',
      evaluatedBy: item.evaluated_by || '',
      evaluatedDate: item.evaluated_date || '',
      evaluatedByStatus: (item as any).evaluated_by_status || null,
      evaluatedByDate: (item as any).evaluated_by_date || null,
      approvedBy: item.approved_by || '',
      approvedDate: item.approved_date || '',
      approvedByStatus: (item as any).approved_by_status || null,
      approvedByDate: (item as any).approved_by_date || null,
      acknowledgedBy: item.acknowledged_by || '',
      acknowledgedDate: item.acknowledged_date || '',
      acknowledgedByStatus: (item as any).acknowledged_by_status || null,
      acknowledgedByDate: (item as any).acknowledged_by_date || null,
      createBy: item.create_by || null,
      updateBy: item.update_by || null,
      createdAt: item.created_at || '',
      updatedAt: item.updated_at || '',
      items: item.items || [],
      attachments: Array.isArray(item.attachments) ? item.attachments : []
    };
  }

  update(id: number | string, data: any): Observable<any> {
    return this.http.put<any>(this.apiConfig.buildUrl(`api/supplier_evaluation/${id}`), data);
  }

  remove(id: number | string): Observable<void> {
    return this.http.delete<void>(this.apiConfig.buildUrl(`api/supplier_evaluation/${id}`));
  }

  getStats(): Observable<SupplierEvaluationStats> {
    return this.http.get<SupplierEvaluationStats>(this.apiConfig.buildUrl('api/supplier-evaluations/stats'));
  }

  updateStatus(id: string, updateStatusDto: UpdateStatusDto): Observable<any> {
    return this.http.put(this.apiConfig.buildUrl(`api/update_status/${id}`), updateStatusDto);
  }

  /**
   * Transform supplier evaluation item from snake_case to camelCase
   */
  private transformSupplierEvaluationItem(item: any): SupplierEvaluationListItem {
    return {
      id: String(item.id),
      supplierName: item.supplier_name || '',
      projectName: item.project_name || '',
      projectNo: item.project_no || '',
      departmentValueDuration: item.department_value_duration || '',
      averageRating: typeof item.average_rating === 'string' ? parseFloat(item.average_rating) : (item.average_rating || 0),
      decision: item.decision as 'maintain' | 'remove',
      createBy: item.create_by || null,
      updateBy: item.update_by || null,
      createdAt: item.created_at || '',
      updatedAt: item.updated_at || '',
      No: item.No || 0,
      // Workflow fields
      evaluatedBy: item.evaluated_by || null,
      evaluatedByDate: item.evaluated_by_date || null,
      evaluatedByStatus: item.evaluated_by_status as any || null,
      approvedBy: item.approved_by || null,
      approvedByDate: item.approved_by_date || null,
      approvedByStatus: item.approved_by_status as any || null,
      acknowledgedBy: item.acknowledged_by || null,
      acknowledgedByDate: item.acknowledged_by_date || null,
      acknowledgedByStatus: item.acknowledged_by_status as any || null,
    };
  }
}

// Interfaces for supplier evaluations page API
export interface SupplierEvaluationsPageRequest {
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

interface SupplierEvaluationsPageApiResponse {
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

interface SupplierEvaluationApiResponse {
  code: string;
  status: boolean;
  message: string;
  data: {
    id: number;
    supplier_name: string;
    project_name: string;
    project_no: string;
    department_value_duration: string;
    anti_corruption_flag: number;
    average_rating: string | number;
    decision: 'maintain' | 'remove';
    evaluated_by: string;
    evaluated_by_date?: string | null;
    evaluated_by_status?: 'pending' | 'reject' | 'approve' | null;
    approved_by: string;
    approved_by_date?: string | null;
    approved_by_status?: 'pending' | 'reject' | 'approve' | null;
    acknowledged_by: string;
    acknowledged_by_date?: string | null;
    acknowledged_by_status?: 'pending' | 'reject' | 'approve' | null;
    evaluated_date: string;
    approved_date: string;
    acknowledged_date: string;
    create_by: string | null;
    update_by: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    items: Array<{
      item_name: string;
      rating: number;
      comment: string;
    }> | null;
  };
}
