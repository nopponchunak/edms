import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  LegacyDesignReviewAction,
  LegacyDesignReviewApiService,
  LegacyPeerReviewDetail,
} from 'app/core/services/legacy-design-review-api.service';
import { finalize } from 'rxjs';

interface ChecklistItem {
  key: string;
  question: string;
}

@Component({
  selector: 'app-legacy-peer-review-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatChipsModule,
    MatDividerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './legacy-peer-review-detail.component.html',
  styleUrls: ['./legacy-peer-review-detail.component.scss'],
})
export class LegacyPeerReviewDetailComponent implements OnInit {
  detail: LegacyPeerReviewDetail | null = null;
  loading = false;
  private returnUrl = '/legacy-design-review';

  private readonly peerChecklist: ChecklistItem[] = [
    { key: 'score1', question: 'Is design concept sound?' },
    { key: 'score2', question: 'Do they satisfy all client requirements?' },
    { key: 'score3', question: 'Are proposed design assumptions and parameters valid?' },
    { key: 'score4', question: 'Are proposed loadings/capacities of equipment appropriate?' },
    { key: 'score5', question: 'Are proposed analysis and design methods appropriate?' },
    { key: 'score6', question: 'Are utility supplies available?' },
    { key: 'score7', question: 'Do they satisfy related legal and statutory requirements?' },
    { key: 'score8', question: 'Do they satisfy health, safety and environmental requirements?' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private legacyDesignReviewApi: LegacyDesignReviewApiService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const stage = this.route.snapshot.paramMap.get('stage') ?? 'peer-review';
    const id = this.route.snapshot.paramMap.get('id');
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

    if (returnUrl?.startsWith('/legacy-design-review')) {
      this.returnUrl = returnUrl;
    }

    if (!id) {
      this.goBack();
      return;
    }

    this.loadDetail(stage, id);
  }

  loadDetail(stage: string, id: string): void {
    this.loading = true;
    this.legacyDesignReviewApi
      .getItem(stage, id)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (detail) => {
          this.detail = detail;
        },
        error: (error) => {
          console.error('Error loading legacy peer review detail:', error);
          this.detail = null;
          this.snackBar.open('Failed to load legacy Design Review detail.', 'Close', { duration: 3000 });
        },
      });
  }

  get reviewChecklist(): ChecklistItem[] {
    const scoreKeys = Object.keys(this.detail?.scores ?? {});

    if (this.detail?.stageKey === 'peer-review') {
      return this.peerChecklist;
    }

    return scoreKeys.map((key) => ({
      key,
      question: `Checklist item ${key.replace('score', '')}`,
    }));
  }

  goBack(): void {
    this.router.navigateByUrl(this.returnUrl);
  }

  scoreLabel(key: string): string {
    const value = this.detail?.scores?.[key];

    if (value === true) {
      return 'Yes';
    }

    if (value === false) {
      return 'No';
    }

    return '-';
  }

  scoreClass(key: string): string {
    const value = this.detail?.scores?.[key];

    if (value === true) {
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    }

    if (value === false) {
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    }

    return 'bg-slate-50 text-slate-600 ring-slate-200';
  }

  actionStatusClass(action: LegacyDesignReviewAction): string {
    const label = action.status.label.toLowerCase();

    if (label.includes('process')) {
      return 'bg-blue-50 text-blue-700 ring-blue-200';
    }

    if (label.includes('complete') || label.includes('closed')) {
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    }

    return 'bg-slate-50 text-slate-700 ring-slate-200';
  }
}
