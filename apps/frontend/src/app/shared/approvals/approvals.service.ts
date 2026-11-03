import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface PendingItem {
  form: 'expenses' | 'allowance' | 'charitable' | 'gift-receiving' | 'gift-offering' | 'purchase-requisition' | 'design-review';
  id: number;
  voucherNo: string | null;
  claimantName: string;
  totalBaht: string;
  currency: string;
  stage: 'verify' | 'approve' | 'acknowledge';
  submittedAt: string;
}

interface PendingSummary {
  total: number;
  expenses: { count: number; items: PendingItem[] };
  allowances: { count: number; items: PendingItem[] };
  charitable: { count: number; items: PendingItem[] };
  giftReceiving: { count: number; items: PendingItem[] };
  giftOffering: { count: number; items: PendingItem[] };
  purchaseRequisition: { count: number; items: PendingItem[] };
  designReview: { count: number; items: PendingItem[] };
}

@Injectable({ providedIn: 'root' })
export class ApprovalsService {
  private readonly http = inject(HttpClient);
  private readonly summary = signal<PendingSummary | null>(null);

  readonly total = computed(() => this.summary()?.total ?? 0);
  readonly expensesCount = computed(() => this.summary()?.expenses.count ?? 0);
  readonly allowancesCount = computed(() => this.summary()?.allowances.count ?? 0);
  readonly charitableCount = computed(() => this.summary()?.charitable?.count ?? 0);
  readonly giftReceivingCount = computed(() => this.summary()?.giftReceiving?.count ?? 0);
  readonly giftOfferingCount = computed(() => this.summary()?.giftOffering?.count ?? 0);
  readonly purchaseRequisitionCount = computed(() => this.summary()?.purchaseRequisition?.count ?? 0);
  readonly designReviewCount = computed(() => this.summary()?.designReview?.count ?? 0);
  readonly items = computed(() => {
    const s = this.summary();
    if (!s) return [];
    return [...s.expenses.items, ...s.allowances.items, ...(s.charitable?.items ?? []), ...(s.giftReceiving?.items ?? []), ...(s.giftOffering?.items ?? []), ...(s.purchaseRequisition?.items ?? []), ...(s.designReview?.items ?? [])]
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  });

  refresh(): void {
    this.http.get<PendingSummary>(`${environment.apiBaseUrl}/approvals/pending`).subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => undefined,
    });
  }

  clear(): void {
    this.summary.set(null);
  }

  routeFor(item: PendingItem): string[] {
    const base = { expenses: '/general/expenses', allowance: '/general/allowances', charitable: '/anti-corruption/charitable-contribution', 'gift-receiving': '/anti-corruption/gift-hospitality-receiving', 'gift-offering': '/anti-corruption/gift-hospitality-offering', 'purchase-requisition': '/procurement/requisitions', 'design-review': '/design-review/concept' }[item.form];
    return [base, String(item.id)];
  }

  formLabel(item: PendingItem): string {
    return { expenses: 'Expenses Claim', allowance: 'Allowance After 10 PM', charitable: 'Charitable Contribution', 'gift-receiving': 'Gift/Hospitality Receiving', 'gift-offering': 'Gift/Hospitality Offering', 'purchase-requisition': 'Purchase Requisition', 'design-review': 'Concept Design Review' }[item.form];
  }

  stageLabel(item: PendingItem): string {
    return { verify: 'Verify', approve: 'Approve', acknowledge: 'Acknowledge' }[item.stage];
  }
}
