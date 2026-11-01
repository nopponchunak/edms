import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  LegacyDesignReviewApiService,
  LegacyDesignReviewMigrationSummary,
  LegacyDesignReviewStage,
  LegacyDesignReviewStageCount,
  LegacyDesignReviewSummaryItem,
} from 'app/core/services/legacy-design-review-api.service';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-legacy-design-review-summary',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './legacy-design-review-summary.component.html',
  styleUrls: ['./legacy-design-review-summary.component.scss'],
})
export class LegacyDesignReviewSummaryComponent implements OnInit {
  stages: LegacyDesignReviewStage[] = [];
  counts: LegacyDesignReviewStageCount[] = [];
  rows: LegacyDesignReviewSummaryItem[] = [];
  selectedStage = 'peer-review';
  search = '';
  loadingStages = false;
  loadingRows = false;
  loadingMigrationSummary = false;
  syncing = false;
  mappingUsers = false;
  generating = false;
  migrationSummary: LegacyDesignReviewMigrationSummary | null = null;
  lastMigrationResult: LegacyDesignReviewMigrationSummary | null = null;
  lastMigrationAction = '';

  constructor(
    private legacyDesignReviewApi: LegacyDesignReviewApiService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadStages();
    this.loadMigrationSummary();
  }

  loadStages(): void {
    this.loadingStages = true;
    this.legacyDesignReviewApi
      .getStages()
      .pipe(finalize(() => (this.loadingStages = false)))
      .subscribe({
        next: (result) => {
          this.stages = result.stages ?? [];
          this.counts = result.counts ?? [];

          if (!this.stages.some((stage) => stage.key === this.selectedStage) && this.stages.length > 0) {
            this.selectedStage = this.stages[0].key;
          }

          this.loadSummary();
        },
        error: (error) => {
          console.error('Error loading legacy design review stages:', error);
          this.snackBar.open('Failed to load legacy Design Review stages.', 'Close', { duration: 3000 });
        },
      });
  }

  loadSummary(): void {
    if (!this.selectedStage) {
      this.rows = [];
      return;
    }

    this.loadingRows = true;
    this.legacyDesignReviewApi
      .getStageSummary(this.selectedStage, { limit: 500, search: this.search })
      .pipe(finalize(() => (this.loadingRows = false)))
      .subscribe({
        next: (rows) => {
          this.rows = rows;
        },
        error: (error) => {
          console.error('Error loading legacy design review summary:', error);
          this.rows = [];
          this.snackBar.open('Failed to load legacy Design Review summary.', 'Close', { duration: 3000 });
        },
      });
  }

  loadMigrationSummary(): void {
    this.loadingMigrationSummary = true;
    this.legacyDesignReviewApi
      .getMigrationSummary()
      .pipe(finalize(() => (this.loadingMigrationSummary = false)))
      .subscribe({
        next: (summary) => {
          this.migrationSummary = summary;
        },
        error: (error) => {
          console.error('Error loading legacy migration summary:', error);
          this.migrationSummary = null;
        },
      });
  }

  syncLegacyData(): void {
    this.syncing = true;
    this.lastMigrationAction = 'Sync Legacy Data';
    this.legacyDesignReviewApi
      .syncLegacyData({ limit: 1000, status: 'active' })
      .pipe(finalize(() => (this.syncing = false)))
      .subscribe({
        next: (result) => this.handleMigrationResult(result, 'Sync completed.'),
        error: (error) => this.handleMigrationError(error, 'Sync failed.'),
      });
  }

  mapLegacyUsers(): void {
    this.mappingUsers = true;
    this.lastMigrationAction = 'Map Users';
    this.legacyDesignReviewApi
      .mapLegacyUsers()
      .pipe(finalize(() => (this.mappingUsers = false)))
      .subscribe({
        next: (result) => this.handleMigrationResult(result, 'User mapping completed.'),
        error: (error) => this.handleMigrationError(error, 'User mapping failed.'),
      });
  }

  generateLegacyRecords(): void {
    this.generating = true;
    this.lastMigrationAction = 'Create Records';
    this.legacyDesignReviewApi
      .generateLegacyRecords({ limit: 500 })
      .pipe(finalize(() => (this.generating = false)))
      .subscribe({
        next: (result) => this.handleMigrationResult(result, 'Record creation completed.'),
        error: (error) => this.handleMigrationError(error, 'Record creation failed.'),
      });
  }

  onStageChange(): void {
    this.rows = [];
    this.loadSummary();
  }

  openDetail(row: LegacyDesignReviewSummaryItem): void {
    this.router.navigate(['/legacy-design-review', row.stage.key, row.id]);
  }

  canOpenDetail(row: LegacyDesignReviewSummaryItem): boolean {
    return Boolean(row?.stage?.key && row?.id);
  }

  get selectedStageLabel(): string {
    return this.stages.find((stage) => stage.key === this.selectedStage)?.label ?? 'Stage';
  }

  activeCount(stageKey: string): number {
    return this.counts.find((count) => count.key === stageKey)?.active ?? 0;
  }

  totalCount(stageKey: string): number {
    return this.counts.find((count) => count.key === stageKey)?.total ?? 0;
  }

  get actionBusy(): boolean {
    return this.syncing || this.mappingUsers || this.generating;
  }

  get migrationErrors(): string[] {
    return this.lastMigrationResult?.errors?.filter(Boolean) ?? [];
  }

  statusClass(label: string | null | undefined): string {
    const normalized = (label ?? '').toLowerCase();

    if (normalized.includes('response')) {
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    }

    if (normalized.includes('review')) {
      return 'bg-blue-50 text-blue-700 ring-blue-200';
    }

    if (normalized.includes('approve') || normalized.includes('acknowledge')) {
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    }

    return 'bg-slate-50 text-slate-700 ring-slate-200';
  }

  private handleMigrationResult(result: LegacyDesignReviewMigrationSummary, message: string): void {
    this.migrationSummary = result;
    this.lastMigrationResult = result;
    this.snackBar.open(message, 'Close', { duration: 3000 });
    this.loadStages();
  }

  private handleMigrationError(error: any, fallbackMessage: string): void {
    console.error('Legacy migration action failed:', error);
    this.snackBar.open(error?.error?.message ?? fallbackMessage, 'Close', { duration: 5000 });
  }
}
