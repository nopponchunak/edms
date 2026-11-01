import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export type OfferingRequestType = 'gift' | 'hospitality';

export const OFFERING_TYPE_LABELS: Record<OfferingRequestType, string> = {
  gift: 'Gift',
  hospitality: 'Hospitality',
};

/** Offering requests start above this amount (THB, including VAT). */
export const MIN_OFFERING_VALUE = 5000;
export const OFFERING_TIER_2 = 10000;
export const OFFERING_TIER_3 = 30000;

export interface GiftOffering {
  id: number;
  voucherNo: string | null;
  requestType: OfferingRequestType;
  requesterName: string;
  description: string | null;
  purpose: string | null;
  valueAmount: string;
  currency: string;
  receiverNameCompany: string;
  proposedDate: string;
  attachments: unknown[] | null;
  verifyBy: string | null;
  verifyByStatus: string | null;
  verifyByDate: string | null;
  verifyComment: string | null;
  ack1By: string | null;
  ack1ByStatus: string | null;
  ack1ByDate: string | null;
  ack1Comment: string | null;
  approverBy: string | null;
  approverByStatus: string | null;
  approverByDate: string | null;
  approverComment: string | null;
  approver2By: string | null;
  approver2ByStatus: string | null;
  approver2ByDate: string | null;
  approver2Comment: string | null;
  ack2By: string | null;
  ack2ByStatus: string | null;
  ack2ByDate: string | null;
  ack2Comment: string | null;
  version: number;
  status: 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';
  createBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GiftOfferingEvent {
  id: number;
  version: number;
  action: 'submitted' | 'revised' | 'approved' | 'rejected';
  step: 'verify' | 'ack1' | 'approver' | 'approver2' | 'ack2' | null;
  actor: string;
  comment: string | null;
  createdAt: string;
}

export interface SaveGiftOfferingPayload {
  requestType: OfferingRequestType;
  requesterName: string;
  description: string | null;
  purpose: string | null;
  valueAmount: number;
  currency: string;
  receiverNameCompany: string;
  proposedDate: string;
  verifyBy: string | null;
  ack1By: string | null;
  approverBy: string | null;
  approver2By: string | null;
  ack2By: string | null;
  attachments: unknown[] | null;
  action: 'draft' | 'submitted';
}

export interface OfferingListQuery {
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
export class GiftOfferingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/gift-hospitality-offerings`;

  list(query: OfferingListQuery = {}) {
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
    return this.http.get<PagedResult<GiftOffering>>(this.base, { params });
  }

  get(id: number) {
    return this.http.get<GiftOffering>(`${this.base}/${id}`);
  }

  create(payload: SaveGiftOfferingPayload) {
    return this.http.post<GiftOffering>(this.base, payload);
  }

  update(id: number, payload: SaveGiftOfferingPayload) {
    return this.http.put<GiftOffering>(`${this.base}/${id}`, payload);
  }

  approve(id: number, action: 'approved' | 'rejected', comment: string) {
    return this.http.post<GiftOffering>(`${this.base}/${id}/approve`, { action, comment: comment.trim() || undefined });
  }

  events(id: number) {
    return this.http.get<GiftOfferingEvent[]>(`${this.base}/${id}/events`);
  }

  remove(id: number) {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
