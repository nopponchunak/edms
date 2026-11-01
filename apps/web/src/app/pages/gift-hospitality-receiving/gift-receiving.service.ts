import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export type GiftRequestType = 'gift' | 'hospitality';

export const GIFT_TYPE_LABELS: Record<GiftRequestType, string> = {
  gift: 'Gift',
  hospitality: 'Hospitality',
};

/** Receiving a gift or hospitality worth this much (THB, including VAT) or more must be requested. */
export const MIN_GIFT_VALUE = 3000;

export interface GiftReceiving {
  id: number;
  voucherNo: string | null;
  requestType: GiftRequestType;
  requesterName: string;
  description: string | null;
  purpose: string | null;
  valueAmount: string;
  companyOfGiver: string;
  receivingStaff: string;
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

export interface GiftReceivingEvent {
  id: number;
  version: number;
  action: 'submitted' | 'revised' | 'approved' | 'rejected';
  step: 'verify' | 'ack1' | 'approver' | 'ack2' | null;
  actor: string;
  comment: string | null;
  createdAt: string;
}

export interface SaveGiftReceivingPayload {
  requestType: GiftRequestType;
  requesterName: string;
  description: string | null;
  purpose: string | null;
  valueAmount: number;
  companyOfGiver: string;
  receivingStaff: string;
  proposedDate: string;
  verifyBy: string | null;
  ack1By: string | null;
  approverBy: string | null;
  ack2By: string | null;
  attachments: unknown[] | null;
  action: 'draft' | 'submitted';
}

export interface GiftListQuery {
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
export class GiftReceivingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/gift-hospitality-receivings`;

  list(query: GiftListQuery = {}) {
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
    return this.http.get<PagedResult<GiftReceiving>>(this.base, { params });
  }

  get(id: number) {
    return this.http.get<GiftReceiving>(`${this.base}/${id}`);
  }

  create(payload: SaveGiftReceivingPayload) {
    return this.http.post<GiftReceiving>(this.base, payload);
  }

  update(id: number, payload: SaveGiftReceivingPayload) {
    return this.http.put<GiftReceiving>(`${this.base}/${id}`, payload);
  }

  approve(id: number, action: 'approved' | 'rejected', comment: string) {
    return this.http.post<GiftReceiving>(`${this.base}/${id}/approve`, { action, comment: comment.trim() || undefined });
  }

  events(id: number) {
    return this.http.get<GiftReceivingEvent[]>(`${this.base}/${id}/events`);
  }

  remove(id: number) {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
