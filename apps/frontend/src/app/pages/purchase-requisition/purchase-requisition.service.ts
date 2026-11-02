import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Above this grand total (in the chosen currency) a second approver is required. */
export const PR_SECOND_APPROVER_ABOVE = 50000;
export const PR_VAT_RATE = 0.07;
export const PR_DEFAULT_PAYMENT_TERM =
  'Accept invoices only at the end of each month. Payment will be made at the end of the following month after the invoice is received.';

export interface PrItem {
  item: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  needAsset?: boolean;
}

export interface PurchaseRequisition {
  id: number;
  prNo: string | null;
  subject: string;
  toName: string | null;
  requestDate: string;
  requestedBy: string;
  recommendedBy: string | null;
  deadline: string | null;
  receivedFrom: string | null;
  reasonsForPurchase: string | null;
  currency: string;
  items: PrItem[];
  discount: string;
  vat: boolean;
  subTotal: string;
  vatValue: string;
  grandTotal: string;
  paymentTerm: string | null;
  otherConditions: string | null;
  quotationAttached: boolean;
  notItEquipment: boolean;
  needAssetCodeRegistration: boolean | null;
  attachments: unknown[] | null;
  verifyIsBy: string | null;
  verifyIsByStatus: string | null;
  verifyIsByDate: string | null;
  verifyIsComment: string | null;
  verifyBy: string | null;
  verifyByStatus: string | null;
  verifyByDate: string | null;
  verifyComment: string | null;
  approverBy: string | null;
  approverByStatus: string | null;
  approverByDate: string | null;
  approverComment: string | null;
  approver2By: string | null;
  approver2ByStatus: string | null;
  approver2ByDate: string | null;
  approver2Comment: string | null;
  ackBy: string | null;
  ackByStatus: string | null;
  ackByDate: string | null;
  ackComment: string | null;
  actionBy: string | null;
  actionByStatus: string | null;
  actionByDate: string | null;
  actionComment: string | null;
  version: number;
  status: 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';
  createBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRequisitionEvent {
  id: number;
  version: number;
  action: 'submitted' | 'revised' | 'approved' | 'rejected';
  step: 'verifyIs' | 'verify' | 'approver' | 'approver2' | 'ack' | 'action' | null;
  actor: string;
  comment: string | null;
  createdAt: string;
}

export interface SavePurchaseRequisitionPayload {
  subject: string;
  toName: string | null;
  requestDate: string;
  requestedBy: string;
  recommendedBy: string | null;
  deadline: string | null;
  receivedFrom: string | null;
  reasonsForPurchase: string | null;
  currency: string;
  items: { item: string; description: string; quantity: number; unitPrice: number }[];
  discount: number;
  vat: boolean;
  paymentTerm: string | null;
  otherConditions: string | null;
  quotationAttached: boolean;
  notItEquipment: boolean;
  verifyIsBy: string | null;
  verifyBy: string | null;
  approverBy: string | null;
  approver2By: string | null;
  ackBy: string | null;
  actionBy: string | null;
  attachments: unknown[] | null;
  action: 'draft' | 'submitted';
}

export interface PrListQuery {
  q?: string;
  status?: string;
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

/** The decision a person makes at the Acknowledge (CA) step may carry the asset-code flags. */
export interface PrDecisionExtras {
  needAssetCodeRegistration?: boolean;
  itemAssetFlags?: boolean[];
}

@Injectable({ providedIn: 'root' })
export class PurchaseRequisitionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/purchase-requisitions`;

  list(query: PrListQuery = {}) {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      limit: String(query.limit ?? 25),
      sort: query.sort ?? 'created_at',
      dir: query.dir ?? 'desc',
    };
    for (const key of ['q', 'status', 'approver', 'dateFrom', 'dateTo'] as const) {
      if (query[key]) params[key] = query[key]!;
    }
    if (query.waiting) params['waiting'] = 'me';
    return this.http.get<PagedResult<PurchaseRequisition>>(this.base, { params });
  }

  get(id: number) {
    return this.http.get<PurchaseRequisition>(`${this.base}/${id}`);
  }

  create(payload: SavePurchaseRequisitionPayload) {
    return this.http.post<PurchaseRequisition>(this.base, payload);
  }

  update(id: number, payload: SavePurchaseRequisitionPayload) {
    return this.http.put<PurchaseRequisition>(`${this.base}/${id}`, payload);
  }

  approve(id: number, action: 'approved' | 'rejected', comment: string, extras: PrDecisionExtras = {}) {
    return this.http.post<PurchaseRequisition>(`${this.base}/${id}/approve`, { action, comment: comment.trim() || undefined, ...extras });
  }

  events(id: number) {
    return this.http.get<PurchaseRequisitionEvent[]>(`${this.base}/${id}/events`);
  }

  remove(id: number) {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
