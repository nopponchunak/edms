import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export type RequestType = 'charitable_contribution' | 'sponsorship';

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  charitable_contribution: 'Charitable Contribution',
  sponsorship: 'Sponsorship',
};

export interface CharitableContribution {
  id: number;
  voucherNo: string | null;
  requestType: RequestType;
  requesterName: string;
  eventDescription: string | null;
  eventPurpose: string | null;
  organizerName: string;
  contributionDescription: string | null;
  valueAmount: string;
  currency: string;
  proposedDate: string;
  attachments: unknown[] | null;
  verifyBy: string | null;
  verifyByStatus: string | null;
  verifyByDate: string | null;
  ack1By: string | null;
  ack1ByStatus: string | null;
  ack1ByDate: string | null;
  approverBy: string | null;
  approverByStatus: string | null;
  approverByDate: string | null;
  approver2By: string | null;
  approver2ByStatus: string | null;
  approver2ByDate: string | null;
  ack2By: string | null;
  ack2ByStatus: string | null;
  ack2ByDate: string | null;
  verifyComment: string | null;
  ack1Comment: string | null;
  approverComment: string | null;
  approver2Comment: string | null;
  ack2Comment: string | null;
  version: number;
  status: 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';
  createBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharitableEvent {
  id: number;
  version: number;
  action: 'submitted' | 'revised' | 'approved' | 'rejected';
  step: 'verify' | 'ack1' | 'approver' | 'approver2' | 'ack2' | null;
  actor: string;
  comment: string | null;
  createdAt: string;
}

export interface SaveCharitablePayload {
  requestType: RequestType;
  requesterName: string;
  eventDescription: string | null;
  eventPurpose: string | null;
  organizerName: string;
  contributionDescription: string | null;
  valueAmount: number;
  currency: string;
  proposedDate: string;
  verifyBy: string | null;
  ack1By: string | null;
  approverBy: string | null;
  approver2By: string | null;
  ack2By: string | null;
  attachments: unknown[] | null;
  action: 'draft' | 'submitted';
}

export interface CharitableListQuery {
  q?: string;
  status?: string;
  requestType?: string;
  waiting?: boolean;
  approver?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sort?: string;
  dir?: 'asc' | 'desc';
}

export interface PagedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; pages: number };
}

@Injectable({ providedIn: 'root' })
export class CharitableContributionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/charitable-contributions`;

  list(query: CharitableListQuery = {}) {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      limit: String(query.limit ?? 25),
      sort: query.sort ?? 'created_at',
      dir: query.dir ?? 'desc',
    };
    for (const key of ['q', 'status', 'requestType', 'approver', 'dateFrom', 'dateTo'] as const) {
      if (query[key]) params[key] = query[key]!;
    }
    if (query.waiting) params['waiting'] = 'me';
    return this.http.get<PagedResult<CharitableContribution>>(this.base, { params });
  }

  get(id: number) {
    return this.http.get<CharitableContribution>(`${this.base}/${id}`);
  }

  create(payload: SaveCharitablePayload) {
    return this.http.post<CharitableContribution>(this.base, payload);
  }

  approve(id: number, action: 'approved' | 'rejected', comment: string) {
    return this.http.post<CharitableContribution>(`${this.base}/${id}/approve`, { action, comment: comment.trim() || undefined });
  }

  events(id: number) {
    return this.http.get<CharitableEvent[]>(`${this.base}/${id}/events`);
  }

  remove(id: number) {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }

  update(id: number, payload: SaveCharitablePayload) {
    return this.http.put<CharitableContribution>(`${this.base}/${id}`, payload);
  }
}
