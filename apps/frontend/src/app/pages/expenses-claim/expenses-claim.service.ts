import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface ExpensesClaimItem {
  id?: number;
  seq?: number;
  itemDate: string;
  projectDetailId?: number | null;
  projectCode?: string | null;
  projectName?: string | null;
  details: string;
  baht: number;
}

export interface ExpensesClaim {
  id: number;
  voucherNo: string | null;
  claimantName: string;
  claimDate: string;
  currency: string;
  totalBaht: string;
  attachments: unknown[];
  verifiedBy: string | null;
  verifiedByStatus: string | null;
  verifiedByDate: string | null;
  approvedBy: string | null;
  approvedByStatus: string | null;
  approvedByDate: string | null;
  status: 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';
  createBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: ExpensesClaimItem[];
}

export interface SaveExpensesClaimPayload {
  claimantName: string;
  claimDate: string;
  currency?: string;
  verifiedBy?: string | null;
  approvedBy?: string | null;
  attachments?: unknown[] | null;
  items: ExpensesClaimItem[];
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
export class ExpensesClaimService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/expenses-claims`;

  list(query: ListQuery = {}) {
    const params: Record<string, string> = { page: String(query.page ?? 1), limit: String(query.limit ?? 25), sort: 'claim_date', dir: 'desc' };
    if (query.q) params['q'] = query.q;
    if (query.status) params['status'] = query.status;
    if (query.waiting) params['waiting'] = 'me';
    if (query.approver) params['approver'] = query.approver;
    if (query.dateFrom) params['dateFrom'] = query.dateFrom;
    if (query.dateTo) params['dateTo'] = query.dateTo;
    return this.http.get<PagedResult<ExpensesClaim>>(this.base, { params });
  }

  get(id: number) {
    return this.http.get<ExpensesClaim>(`${this.base}/${id}`);
  }

  create(payload: SaveExpensesClaimPayload) {
    return this.http.post<ExpensesClaim>(this.base, payload);
  }

  update(id: number, payload: SaveExpensesClaimPayload) {
    return this.http.put<ExpensesClaim>(`${this.base}/${id}`, payload);
  }

  approve(id: number, action: 'approved' | 'rejected') {
    return this.http.post<ExpensesClaim>(`${this.base}/${id}/approve`, { action });
  }

  remove(id: number) {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
