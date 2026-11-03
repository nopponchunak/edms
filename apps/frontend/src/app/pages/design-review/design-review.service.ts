import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export type ChecklistValue = 'yes' | 'no' | 'na';

export interface ChecklistAnswer {
  id: string;
  answer: ChecklistValue | null;
}

export interface DesignReviewFormConfig {
  code: string;
  title: string;
  voucherPrefix: string;
  documentTypes: string[];
  checklist: { id: string; question: string }[];
}

export interface DesignReviewConfig {
  forms: Record<string, DesignReviewFormConfig>;
  disciplines: string[];
}

export interface DesignReview {
  id: number;
  formType: string;
  voucherNo: string | null;
  projectId: number | null;
  projectNo: string | null;
  projectName: string | null;
  preparedBy: string;
  discipline: string | null;
  disciplineOther: string | null;
  stage: string | null;
  documentTypes: string[];
  documentTypesOther: string | null;
  documentLocation: string | null;
  checklist: ChecklistAnswer[];
  comments: string | null;
  recommendedActions: string | null;
  actionsTaken: boolean | null;
  actionNote: string | null;
  attachments: unknown[] | null;
  reviewBy: string | null;
  reviewByStatus: string | null;
  reviewByDate: string | null;
  reviewComment: string | null;
  respondBy: string | null;
  respondByStatus: string | null;
  respondByDate: string | null;
  respondComment: string | null;
  tlBy: string | null;
  tlByStatus: string | null;
  tlByDate: string | null;
  tlComment: string | null;
  tl2By: string | null;
  tl2ByStatus: string | null;
  tl2ByDate: string | null;
  tl2Comment: string | null;
  ackBy: string | null;
  ackByStatus: string | null;
  ackByDate: string | null;
  ackComment: string | null;
  version: number;
  status: 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected';
  /** The layout / flow the document was filed under. */
  formVersion: number;
  /** Name and code of each signer as they were when they signed. */
  signers: Record<string, { name: string; code: string | null }>;
  createBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DesignReviewEvent {
  id: number;
  version: number;
  action: 'submitted' | 'revised' | 'approved' | 'rejected' | 'reassigned';
  step: 'review' | 'respond' | 'tl' | 'tl2' | 'ack' | null;
  actor: string;
  comment: string | null;
  createdAt: string;
}

export interface SaveDesignReviewPayload {
  formType: string;
  projectId: number | null;
  preparedBy: string;
  discipline: string | null;
  disciplineOther: string | null;
  stage: string | null;
  documentTypes: string[];
  documentTypesOther: string | null;
  documentLocation: string | null;
  checklist: ChecklistAnswer[];
  comments: string | null;
  recommendedActions: string | null;
  actionsTaken: boolean | null;
  actionNote: string | null;
  reviewBy: string | null;
  respondBy: string | null;
  tlBy: string | null;
  tl2By: string | null;
  ackBy: string | null;
  attachments: unknown[] | null;
  action: 'draft' | 'submitted';
}

export interface DesignReviewListQuery {
  q?: string;
  status?: string;
  formType?: string;
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
export class DesignReviewService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/design-reviews`;

  config() {
    return this.http.get<DesignReviewConfig>(`${this.base}/config`);
  }

  list(query: DesignReviewListQuery = {}) {
    const params: Record<string, string> = {
      page: String(query.page ?? 1),
      limit: String(query.limit ?? 25),
      sort: query.sort ?? 'created_at',
      dir: query.dir ?? 'desc',
    };
    for (const key of ['q', 'status', 'formType', 'approver', 'dateFrom', 'dateTo'] as const) {
      if (query[key]) params[key] = query[key]!;
    }
    if (query.waiting) params['waiting'] = 'me';
    return this.http.get<PagedResult<DesignReview>>(this.base, { params });
  }

  get(id: number) {
    return this.http.get<DesignReview>(`${this.base}/${id}`);
  }

  create(payload: SaveDesignReviewPayload) {
    return this.http.post<DesignReview>(this.base, payload);
  }

  update(id: number, payload: SaveDesignReviewPayload) {
    return this.http.put<DesignReview>(`${this.base}/${id}`, payload);
  }

  approve(id: number, action: 'approved' | 'rejected', comment: string) {
    return this.http.post<DesignReview>(`${this.base}/${id}/approve`, { action, comment: comment.trim() || undefined });
  }

  events(id: number) {
    return this.http.get<DesignReviewEvent[]>(`${this.base}/${id}/events`);
  }

  remove(id: number) {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
