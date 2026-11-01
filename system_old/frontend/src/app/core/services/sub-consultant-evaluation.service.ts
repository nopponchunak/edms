import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiConfig } from '../config/api.config';

export interface SubConsultantEvaluation {
  id: number;
  to: string;
  circ: string;
  sub_consultant_name: string;
  // Project information
  project_name: string;
  project_no: string;
  department_value_duration: string;
  scope_of_services?: string;
  // Compliance flags
  anti_corruption_is_violation: number;
  cad_software_confirmed: number;
  is_maintained: number;
  is_removed: number;
  // Workflow users & dates
  evaluated_by?: string;
  evaluated_date?: string | null;
  evaluated_by_status?: 'pending' | 'reject' | 'approve' | null;
  approved_by?: string;
  approved_date?: string | null;
  approved_by_status?: 'pending' | 'reject' | 'approve' | null;
  acknowledged_by?: string;
  acknowledged_date?: string | null;
  acknowledged_by_status?: 'pending' | 'reject' | 'approve' | null;
  // Audit
  create_by?: string;
  update_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  No?: number;
  items?: SubConsultantEvaluationItem[];
  files?: SubConsultantEvaluationFile[];
}

export interface SubConsultantEvaluationItem {
  id?: number;
  sub_consultant_eva_id?: number;
  item_no: number;
  item_name: string;
  rating: number | string;
  comment?: string | null;
  create_by?: string;
  update_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface SubConsultantEvaluationFile {
  id?: number;
  sub_consultant_eva_id?: number;
  name: string;
  path: string;
  create_by?: string;
  update_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface CreateSubConsultantEvaluationRequest {
  to: string;
  circ: string;
  sub_consultant_name: string;
  project_name: string;
  // Optional project info
  project_no: string;
  department_value_duration: string;
  scope_of_services?: string;
  // Compliance / decision flags
  anti_corruption_is_violation: boolean;
  cad_software_confirmed: boolean;
  is_maintained: boolean;
  is_removed: boolean;
  // Workflow users & dates
  evaluated_by?: string;
  evaluated_date?: string | null;
  evaluated_by_status?: 'pending' | 'reject' | 'approve' | null;
  approved_by?: string;
  approved_date?: string | null;
  approved_by_status?: 'pending' | 'reject' | 'approve' | null;
  acknowledged_by?: string;
  acknowledged_date?: string | null;
  acknowledged_by_status?: 'pending' | 'reject' | 'approve' | null;
  items: Array<{
    item_no: number;
    item_name: string;
    rating: number;
    comment?: string;
  }>;
  files?: Array<{
    name: string;
    path: string;
  }>;
  /** Paths from upload_multiple_files response, e.g. ["uploads/files/a.pdf"] */
  attachments?: string[];
}

export interface UpdateSubConsultantEvaluationRequest extends Partial<CreateSubConsultantEvaluationRequest> {}

export interface SubConsultantEvaluationsPageRequest {
  draw: number;
  columns: Array<{ data: string }>;
  order: Array<{ column: number; dir: 'asc' | 'desc' }>;
  start: number;
  length: number;
  search: {
    value: string;
    regex: boolean;
  };
}

interface SubConsultantEvaluationApiResponse {
  code: string;
  status: boolean;
  message: string;
  data: SubConsultantEvaluation;
}

interface SubConsultantEvaluationsPageApiResponse {
  code: string;
  status: boolean;
  message: string;
  data: {
    current_page: number;
    data: any[];
    first_page_url: string;
    from: number;
    last_page: number;
    last_page_url: string;
    links: Array<{ url: string | null; label: string; active: boolean }>;
    next_page_url: string | null;
    path: string;
    per_page: number;
    prev_page_url: string | null;
    to: number;
    total: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class SubConsultantEvaluationService {
  constructor(
    private http: HttpClient,
    private apiConfig: ApiConfig
  ) {}

  /**
   * Get paginated sub-consultant evaluations list using POST /api/sub_consultant_evaluations_page
   */
  findAllPaginated(request: SubConsultantEvaluationsPageRequest): Observable<{ data: SubConsultantEvaluation[]; total: number; currentPage: number; perPage: number; lastPage: number }> {
    return this.http.post<SubConsultantEvaluationsPageApiResponse>(
      this.apiConfig.buildUrl('api/sub_consultant_evaluations_page'),
      request
    ).pipe(
      map(response => {
        const items = response.data.data || [];
        return {
          data: items.map((item: any) => this.transformEvaluationItem(item)),
          total: response.data.total || 0,
          currentPage: response.data.current_page || 1,
          perPage: response.data.per_page || 10,
          lastPage: response.data.last_page || 1
        };
      })
    );
  }

  /**
   * Get a single evaluation by ID
   */
  findOne(id: number): Observable<SubConsultantEvaluation> {
    return this.http.get<SubConsultantEvaluationApiResponse>(
      this.apiConfig.buildUrl(`api/sub_consultant_evaluations/${id}`)
    ).pipe(
      map(response => this.transformEvaluationResponse(response))
    );
  }

  /**
   * Create a new evaluation
   */
  create(data: CreateSubConsultantEvaluationRequest): Observable<SubConsultantEvaluation> {
    // Transform boolean to number for API
    const payload = {
      ...data,
      anti_corruption_is_violation: data.anti_corruption_is_violation ? 1 : 0,
      cad_software_confirmed: data.cad_software_confirmed ? 1 : 0,
      is_maintained: data.is_maintained ? 1 : 0,
      is_removed: data.is_removed ? 1 : 0
    };
    return this.http.post<SubConsultantEvaluationApiResponse>(
      this.apiConfig.buildUrl('api/sub_consultant_evaluations'),
      payload
    ).pipe(
      map(response => this.transformEvaluationResponse(response))
    );
  }

  /**
   * Update an existing evaluation
   */
  update(id: number, data: UpdateSubConsultantEvaluationRequest): Observable<SubConsultantEvaluation> {
    // Transform boolean to number if present
    const payload: any = { ...data };
    if (typeof data.anti_corruption_is_violation === 'boolean') {
      payload.anti_corruption_is_violation = data.anti_corruption_is_violation ? 1 : 0;
    }
    if (typeof data.cad_software_confirmed === 'boolean') {
      payload.cad_software_confirmed = data.cad_software_confirmed ? 1 : 0;
    }
    if (typeof data.is_maintained === 'boolean') {
      payload.is_maintained = data.is_maintained ? 1 : 0;
    }
    if (typeof data.is_removed === 'boolean') {
      payload.is_removed = data.is_removed ? 1 : 0;
    }

    return this.http.put<SubConsultantEvaluationApiResponse>(
      this.apiConfig.buildUrl(`api/sub_consultant_evaluations/${id}`),
      payload
    ).pipe(
      map(response => this.transformEvaluationResponse(response))
    );
  }

  /**
   * Delete an evaluation
   */
  remove(id: number): Observable<void> {
    return this.http.delete<void>(
      this.apiConfig.buildUrl(`api/sub_consultant_evaluations/${id}`)
    );
  }

  /**
   * Update status for workflow fields
   */
  updateStatus(id: number, updateStatusDto: { table: string; field: string; status: string }): Observable<any> {
    return this.http.put<any>(
      this.apiConfig.buildUrl(`api/update_status/${id}`),
      updateStatusDto
    );
  }

  /**
   * Transform evaluation item from API response
   */
  private transformEvaluationItem(item: any): SubConsultantEvaluation {
    return {
      id: item.id,
      to: item.to || '',
      circ: item.circ || '',
      // Project information
      sub_consultant_name: item.sub_consultant_name || '',
      project_name: item.project_name || '',
      project_no: item.project_no || '',
      department_value_duration: item.department_value_duration || '',
      scope_of_services: item.scope_of_services,
      // Compliance flags
      anti_corruption_is_violation: item.anti_corruption_is_violation || 0,
      cad_software_confirmed: item.cad_software_confirmed || 0,
      is_maintained: item.is_maintained || 0,
      is_removed: item.is_removed || 0,
      // Workflow users & dates + statuses
      evaluated_by: item.evaluated_by,
      evaluated_date: item.evaluated_date,
      evaluated_by_status: item.evaluated_by_status ?? null,
      approved_by: item.approved_by,
      approved_date: item.approved_date,
      approved_by_status: item.approved_by_status ?? null,
      acknowledged_by: item.acknowledged_by,
      acknowledged_date: item.acknowledged_date,
      acknowledged_by_status: item.acknowledged_by_status ?? null,
      // Audit
      create_by: item.create_by,
      update_by: item.update_by,
      created_at: item.created_at,
      updated_at: item.updated_at,
      deleted_at: item.deleted_at,
      No: item.No
    };
  }

  /**
   * Transform single evaluation API response
   */
  private transformEvaluationResponse(response: SubConsultantEvaluationApiResponse): SubConsultantEvaluation {
    const item = response.data;
    const evaluation: SubConsultantEvaluation = this.transformEvaluationItem(item);

    // Include items if present
    if (item.items && Array.isArray(item.items)) {
      evaluation.items = item.items.map((i: any) => ({
        id: i.id,
        sub_consultant_eva_id: i.sub_consultant_eva_id,
        item_no: i.item_no,
        item_name: i.item_name,
        rating: typeof i.rating === 'string' ? parseFloat(i.rating) : i.rating,
        comment: i.comment,
        create_by: i.create_by,
        update_by: i.update_by,
        created_at: i.created_at,
        updated_at: i.updated_at,
        deleted_at: i.deleted_at
      }));
    }

    // Include files if present
    if (item.files && Array.isArray(item.files)) {
      evaluation.files = item.files.map((f: any) => ({
        id: f.id,
        sub_consultant_eva_id: f.sub_consultant_eva_id,
        name: f.name,
        path: f.path,
        create_by: f.create_by,
        update_by: f.update_by,
        created_at: f.created_at,
        updated_at: f.updated_at,
        deleted_at: f.deleted_at
      }));
    }

    return evaluation;
  }
}
