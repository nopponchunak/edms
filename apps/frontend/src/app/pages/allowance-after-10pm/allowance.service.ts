import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface AllowanceItem {
  id?: number;
  seq?: number;
  workDate: string;
  projectDetailId?: number | null;
  projectCode?: string | null;
  projectName?: string | null;
  description?: string | null;
  timeFrom?: string | null;
  timeTo?: string | null;
  baht: number;
}

export interface Allowance {
  id: number;
  voucherNo: string | null;
  claimantName: string;
  discipline: string | null;
  requestDate: string;
  attachments: unknown[] | null;
  totalBaht: string;
  tlBy: string | null;
  tlByStatus: string | null;
  tlByDate: string | null;
  diBy: string | null;
  diByStatus: string | null;
  diByDate: string | null;
  notifiedUser: string | null;
  notifiedUserStatus: string | null;
  status: 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';
  createBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: AllowanceItem[];
}

export interface SaveAllowancePayload {
  claimantName: string;
  discipline?: string | null;
  requestDate: string;
  tlBy?: string | null;
  diBy?: string | null;
  notifiedUser?: string | null;
  attachments?: unknown[] | null;
  items: AllowanceItem[];
  action?: 'draft' | 'submitted';
}

export interface ListQuery {
  q?: string;
  status?: string;
  page?: number;
  limit?: number;
  waiting?: boolean;
  approver?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PagedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; pages: number };
}

@Injectable({ providedIn: 'root' })
export class AllowanceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/allowances`;

  list(query: ListQuery = {}) {
    const params: Record<string, string> = { page: String(query.page ?? 1), limit: String(query.limit ?? 25), sort: 'request_date', dir: 'desc' };
    if (query.q) params['q'] = query.q;
    if (query.status) params['status'] = query.status;
    if (query.waiting) params['waiting'] = 'me';
    if (query.approver) params['approver'] = query.approver;
    if (query.dateFrom) params['dateFrom'] = query.dateFrom;
    if (query.dateTo) params['dateTo'] = query.dateTo;
    return this.http.get<PagedResult<Allowance>>(this.base, { params });
  }

  get(id: number) {
    return this.http.get<Allowance>(`${this.base}/${id}`);
  }

  create(payload: SaveAllowancePayload) {
    return this.http.post<Allowance>(this.base, payload);
  }

  update(id: number, payload: SaveAllowancePayload) {
    return this.http.put<Allowance>(`${this.base}/${id}`, payload);
  }

  approve(id: number, action: 'approved' | 'rejected') {
    return this.http.post<Allowance>(`${this.base}/${id}/approve`, { action });
  }

  remove(id: number) {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
