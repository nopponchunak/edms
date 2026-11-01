import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiConfig } from '../config/api.config';

export interface ControlledDocumentRequest {
  id: number;
  cdrNo?: string;
  documentName: string;
  requestedBy?: string | null;
  requestedDate?: string | null;
  reviewedBy?: string | null;
  reviewedByDate?: string | null;
  reviewedByStatus?: 'pending' | 'reject' | 'approve' | null;
  approvedBy?: string | null;
  approvedByDate?: string | null;
  approvedByStatus?: 'pending' | 'reject' | 'approve' | null;
  acknowledgedBy?: string | null;
  acknowledgedByDate?: string | null;
  acknowledgedByStatus?: 'pending' | 'reject' | 'approve' | null;
  acknowledgedByDate2?: string | null;
  acknowledgedByStatus2?: 'pending' | 'reject' | 'approve' | null;
  status: 'draft' | 'review' | 'approved' | 'actioned' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

export interface ControlledDocumentRequestListItem {
  id: string;
  cdrNo?: string;
  documentName: string;
  requestedBy?: string | null;
  requestedDate?: string | null;
  reviewedBy?: string | null;
  reviewedByDate?: string | null;
  reviewedByStatus?: 'pending' | 'reject' | 'approve' | null;
  approvedBy?: string | null;
  approvedByDate?: string | null;
  approvedByStatus?: 'pending' | 'reject' | 'approve' | null;
  acknowledgedBy?: string | null;
  acknowledgedByDate?: string | null;
  acknowledgedByStatus?: 'pending' | 'reject' | 'approve' | null;
  acknowledgedByDate2?: string | null;
  acknowledgedByStatus2?: 'pending' | 'reject' | 'approve' | null;
  status: 'draft' | 'review' | 'approved' | 'actioned' | 'rejected';
  createdAt: string;
}

export interface UpdateStatusDto {
  table: string;
  field: 'reviewed_by' | 'approved_by' | 'acknowledged_by';
  status: 'pending' | 'reject' | 'approved';
}

export interface ControlledDocumentRequestsPageRequest {
  draw: number;
  type: string;
  columns: Array<{ data: string }>;
  order: Array<{ column: number; dir: string }>;
  start: number;
  length: number;
  search: { value: string; regex: boolean };
}

export interface ControlledDocumentRequestsPageResponse {
  currentPage: number;
  data: ControlledDocumentRequestListItem[];
  total: number;
  perPage: number;
}

interface ControlledDocumentRequestsPageApiResponse {
  code: string;
  status: boolean;
  message: string;
  data: {
    current_page: number;
    data: any[];
    total: number;
    per_page: number;
  };
}

interface ControlledDocumentRequestNextNumberResponse {
  success?: boolean;
  data?: {
    next_cdr_no?: string | number;
    next_number?: string | number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ControlledDocumentRequestService {
  constructor(
    private http: HttpClient,
    private apiConfig: ApiConfig
  ) {}

  create(data: any): Observable<ControlledDocumentRequest> {
    return this.http.post<ControlledDocumentRequest>(this.apiConfig.buildUrl('api/controlled_document_requests'), data);
  }

  findAll(): Observable<ControlledDocumentRequest[]> {
    return this.http.get<ControlledDocumentRequest[]>(this.apiConfig.buildUrl('api/controlled_document_requests'));
  }

  getNextNumber(date?: Date | string | null): Observable<string> {
    const fallbackNumber = this.fallbackNextNumber(date);
    let params = new HttpParams();

    if (date) {
      params = params.set('date', this.formatDateParam(date));
    }

    return this.http.get<ControlledDocumentRequestNextNumberResponse>(
      this.apiConfig.buildUrl('api/controlled_document_requests/next-number'),
      { params }
    ).pipe(
      map(response => String(response?.data?.next_cdr_no ?? response?.data?.next_number ?? fallbackNumber))
    );
  }

  private fallbackNextNumber(date?: Date | string | null): string {
    const year = this.yearFromDate(date);
    const sequence = year === 2026 ? 3 : 1;

    return `${String(sequence).padStart(3, '0')}/${year}`;
  }

  private yearFromDate(date?: Date | string | null): number {
    if (date instanceof Date && !isNaN(date.getTime())) {
      return date.getFullYear();
    }

    const value = String(date || '').trim();
    if (/^\d{4}$/.test(value)) {
      return Number(value);
    }

    const parsed = value ? new Date(value) : new Date();
    if (!isNaN(parsed.getTime())) {
      return parsed.getFullYear();
    }

    return new Date().getFullYear();
  }

  private formatDateParam(date: Date | string): string {
    if (!(date instanceof Date)) {
      return String(date);
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  findAllPaginated(request: ControlledDocumentRequestsPageRequest): Observable<ControlledDocumentRequestsPageResponse> {
    return this.http.post<ControlledDocumentRequestsPageApiResponse>(
      this.apiConfig.buildUrl('api/controlled_document_requests_page'),
      request
    ).pipe(
      map(response => this.transformPageResponse(response))
    );
  }

  findOne(id: string): Observable<ControlledDocumentRequest> {
    return this.http.get<ControlledDocumentRequest>(this.apiConfig.buildUrl(`api/controlled_document_requests/${id}`));
  }

  update(id: string, data: any): Observable<ControlledDocumentRequest> {
    return this.http.put<ControlledDocumentRequest>(this.apiConfig.buildUrl(`api/controlled_document_requests/${id}`), data);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(this.apiConfig.buildUrl(`api/controlled_document_requests/${id}`));
  }

  updateStatus(id: string, updateStatusDto: UpdateStatusDto): Observable<any> {
    return this.http.put(this.apiConfig.buildUrl(`api/update_status/${id}`), updateStatusDto);
  }

  private transformPageResponse(response: ControlledDocumentRequestsPageApiResponse): ControlledDocumentRequestsPageResponse {
    return {
      currentPage: response.data.current_page,
      data: response.data.data.map(item => this.transformListItem(item)),
      total: response.data.total,
      perPage: response.data.per_page
    };
  }

  private transformListItem(item: any): ControlledDocumentRequestListItem {
    return {
      id: String(item.id),
      cdrNo: item.cdr_no || null,
      documentName: item.document_name || '',
      requestedBy: item.requested_by || null,
      requestedDate: item.requested_date || null,
      reviewedBy: item.reviewed_by || null,
      reviewedByDate: item.reviewed_by_date || null,
      reviewedByStatus: item.reviewed_by_status as any || null,
      approvedBy: item.approved_by || null,
      approvedByDate: item.approved_by_date || null,
      approvedByStatus: item.approved_by_status as any || null,
      acknowledgedBy: item.acknowledged_by || null,
      acknowledgedByDate: item.acknowledged_by_date || null,
      acknowledgedByStatus: item.acknowledged_by_status as any || null,
      acknowledgedByStatus2: item.acknowledged_by_status_2 as any || null,
      status: (item.status?.toLowerCase() || 'draft') as any,
      createdAt: item.created_at || ''
    };
  }
}
