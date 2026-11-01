import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import {
  LegacyDesignReviewApiService,
  LegacyDesignReviewStage,
  LegacyDesignReviewStageCount,
  LegacyDesignReviewSummaryItem,
} from 'app/core/services/legacy-design-review-api.service';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { catchError, finalize, forkJoin, of } from 'rxjs';

interface LegacyDesignReviewAggregateItem extends LegacyDesignReviewSummaryItem {
  No: number;
}

@Component({
  selector: 'app-legacy-design-review-completed-records',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    FuseAlertComponent,
  ],
  templateUrl: './legacy-design-review-completed-records.component.html',
  styleUrls: ['./legacy-design-review-completed-records.component.scss'],
})
export class LegacyDesignReviewCompletedRecordsComponent implements OnInit {
  displayedColumns: string[] = [
    'No',
    'stage',
    'projectNo',
    'projectName',
    'discipline',
    'createdDate',
    'teamEngineer',
    'reviewer',
    'teamlead',
    'director',
    'status',
    'action',
  ];

  stages: LegacyDesignReviewStage[] = [];
  counts: LegacyDesignReviewStageCount[] = [];
  records: LegacyDesignReviewSummaryItem[] = [];
  filteredRecordsData: LegacyDesignReviewAggregateItem[] = [];
  pagedRecords: LegacyDesignReviewAggregateItem[] = [];

  isLoading = false;
  isLoadingTypes = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  searchTerm = '';
  typeFilter = '';
  pageIndex = 0;
  pageSize = 25;
  totalRecords = 0;
  filteredRecords = 0;

  constructor(
    private legacyDesignReviewApi: LegacyDesignReviewApiService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadRecords();
  }

  loadRecords(): void {
    this.isLoading = true;
    this.isLoadingTypes = true;
    this.alert = null;

    this.legacyDesignReviewApi.getStages().subscribe({
      next: ({ stages, counts }) => {
        this.stages = stages ?? [];
        this.counts = counts ?? [];
        this.isLoadingTypes = false;

        if (this.stages.length === 0) {
          this.records = [];
          this.applyFilters(false);
          this.isLoading = false;
          return;
        }

        const requests = this.stages.map((stage) =>
          this.legacyDesignReviewApi.getStageSummary(stage.key, { limit: 5000, status: 'all' }).pipe(
            catchError((error) => {
              console.error(`Error loading legacy Design Review stage ${stage.key}:`, error);
              return of([]);
            })
          )
        );

        forkJoin(requests)
          .pipe(finalize(() => (this.isLoading = false)))
          .subscribe({
            next: (result) => {
              this.records = result.flat().sort((a, b) => {
                const dateA = a.createdDate ?? '';
                const dateB = b.createdDate ?? '';
                return dateB.localeCompare(dateA);
              });
              this.applyFilters(false);
            },
            error: (error) => {
              console.error('Error loading legacy Design Review records:', error);
              this.records = [];
              this.applyFilters(false);
              this.showAlert('error', error?.error?.message || 'Unable to load legacy Design Review records.');
            },
          });
      },
      error: (error) => {
        console.error('Error loading legacy Design Review stages:', error);
        this.stages = [];
        this.counts = [];
        this.records = [];
        this.isLoading = false;
        this.isLoadingTypes = false;
        this.applyFilters(false);
        this.showAlert('error', error?.error?.message || 'Unable to load legacy Design Review stages.');
      },
    });
  }

  onSearch(): void {
    this.applyFilters(true);
  }

  onTypeChange(): void {
    this.applyFilters(true);
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.typeFilter = '';
    this.applyFilters(true);
  }

  refresh(): void {
    this.loadRecords();
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.updatePagedRecords();
  }

  formatDate(value: string | null | undefined): string {
    return formatDateDisplay(value);
  }

  openDetail(row: LegacyDesignReviewSummaryItem): void {
    if (!this.canOpenDetail(row)) {
      return;
    }

    this.router.navigate(['/legacy-design-review', row.stage.key, row.id], {
      queryParams: { returnUrl: '/legacy-design-review/completed-records' },
    });
  }

  canOpenDetail(row: LegacyDesignReviewSummaryItem): boolean {
    return Boolean(row?.stage?.key && row?.id);
  }

  statusClass(value: string | null | undefined): string {
    const normalized = (value ?? '').toLowerCase();

    if (normalized.includes('response')) {
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    }

    if (normalized.includes('review')) {
      return 'bg-blue-50 text-blue-700 ring-blue-200';
    }

    if (normalized.includes('approve') || normalized.includes('acknowledge') || normalized.includes('complete')) {
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    }

    return 'bg-slate-50 text-slate-700 ring-slate-200';
  }

  activeCount(stageKey: string): number {
    return this.counts.find((count) => count.key === stageKey)?.active ?? 0;
  }

  totalCount(stageKey: string): number {
    return this.counts.find((count) => count.key === stageKey)?.total ?? 0;
  }

  get selectedTypeLabel(): string {
    if (!this.typeFilter) {
      return 'All Types';
    }

    return this.stages.find((stage) => stage.key === this.typeFilter)?.label ?? this.typeFilter;
  }

  private applyFilters(resetPage: boolean): void {
    const search = this.searchTerm.trim().toLowerCase();

    this.filteredRecordsData = this.records.filter((record) => {
      if (this.typeFilter && record.stage.key !== this.typeFilter) {
        return false;
      }

      if (!search) {
        return true;
      }

      return [
        record.stage.label,
        record.projectId,
        record.projectName,
        record.discipline,
        record.createdDate,
        record.teamEngineer,
        record.reviewer,
        record.teamlead,
        record.director,
        record.status.label,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    }).map((record, index) => ({
      ...record,
      No: index + 1,
    }));

    this.totalRecords = this.records.length;
    this.filteredRecords = this.filteredRecordsData.length;

    if (resetPage) {
      this.pageIndex = 0;
    }

    this.updatePagedRecords();
  }

  private updatePagedRecords(): void {
    const start = this.pageIndex * this.pageSize;
    this.pagedRecords = this.filteredRecordsData.slice(start, start + this.pageSize);
  }

  private showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
  }
}
