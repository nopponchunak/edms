import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import {
  DesignWorkflowApiService,
  DesignWorkflowDetail,
  DesignWorkflowDocument,
  DesignWorkflowDocumentType,
  DesignWorkflowReport,
  DesignWorkflowReportRequestFilters,
  DesignWorkflowReportRow,
  DesignWorkflowStep,
} from 'app/core/services/design-workflow-api.service';
import { formatDateTimeNoSecondsDisplay } from 'app/core/utils/date-format.util';
import { finalize } from 'rxjs';

interface DesignWorkflowRow {
  steps: DesignWorkflowStep[];
  reversed: boolean;
}

interface DesignWorkflowReportGroup {
  responsiblePerson: string;
  rows: DesignWorkflowReportRow[];
}

interface DesignWorkflowPrintReportRow extends DesignWorkflowReportRow {
  responsiblePersonDisplay: string;
  responsibleCellClass: string;
}

@Component({
  selector: 'app-design-workflow',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTabsModule,
  ],
  templateUrl: './design-workflow.component.html',
  styleUrls: ['./design-workflow.component.scss'],
})
export class DesignWorkflowComponent implements OnInit, OnDestroy {
  documentTypes: DesignWorkflowDocumentType[] = [];
  documents: DesignWorkflowDocument[] = [];
  workflow: DesignWorkflowDetail | null = null;
  selectedType = '';
  selectedDocumentId: string | number | null = null;
  documentSearch = '';
  loadingTypes = false;
  loadingDocuments = false;
  loadingWorkflow = false;
  loadingReport = false;
  report: DesignWorkflowReport | null = null;
  selectedTabIndex = 0;
  readonly allReportFilterValue = 'all';
  readonly reportDisciplineDefaultOptions = ['MEP', 'CSA'];
  reportResponsibleFilter: string[] = [this.allReportFilterValue];
  reportDisciplineFilter: string[] = [this.allReportFilterValue];
  reportStageFilter = 'all';
  reportStatusFilter = 'all';
  reportDateStart: Date | null = null;
  reportDateEnd: Date | null = null;
  private reportResponsibleSelectionWasAll = true;
  private reportDisciplineSelectionWasAll = true;
  private readonly printBodyClass = 'design-workflow-printing';
  private printFallbackCleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private designWorkflowApi: DesignWorkflowApiService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit(): void {
    window.addEventListener('beforeprint', this.enableDesignWorkflowPrintMode);
    window.addEventListener('afterprint', this.disableDesignWorkflowPrintMode);
    this.loadDocumentTypes();
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeprint', this.enableDesignWorkflowPrintMode);
    window.removeEventListener('afterprint', this.disableDesignWorkflowPrintMode);
    this.disableDesignWorkflowPrintMode();
  }

  onTabChange(index: number): void {
    this.selectedTabIndex = index;

    if (index === 1 && !this.report) {
      this.loadReport();
    }
  }

  loadDocumentTypes(): void {
    this.loadingTypes = true;
    this.designWorkflowApi
      .getDocumentTypes()
      .pipe(finalize(() => (this.loadingTypes = false)))
      .subscribe({
        next: (types) => {
          this.documentTypes = types.filter(t => t.type !== 'tender_review' && t.label !== 'Tender Review');

          if (!this.selectedType && this.documentTypes.length > 0) {
            this.selectedType = this.documentTypes[0].type;
            this.loadDocuments();
          }
        },
        error: (error) => {
          console.error('Error loading design workflow document types:', error);
          this.snackBar.open('Failed to load design workflow document types.', 'Close', { duration: 3000 });
        },
      });
  }

  loadDocuments(): void {
    this.selectedDocumentId = null;
    this.workflow = null;
    this.documents = [];

    if (!this.selectedType) {
      return;
    }

    this.loadingDocuments = true;
    this.designWorkflowApi
      .getDocuments(this.selectedType, this.documentSearch)
      .pipe(finalize(() => (this.loadingDocuments = false)))
      .subscribe({
        next: (documents) => {
          this.documents = documents;

          if (documents.length > 0) {
            this.selectedDocumentId = documents[0].id;
          }
        },
        error: (error) => {
          console.error('Error loading design workflow documents:', error);
          this.snackBar.open('Failed to load design workflow documents.', 'Close', { duration: 3000 });
        },
      });
  }

  apply(): void {
    if (!this.selectedType || !this.selectedDocumentId) {
      this.snackBar.open('Please select document type and document.', 'Close', { duration: 2500 });
      return;
    }

    this.loadingWorkflow = true;
    this.designWorkflowApi
      .getWorkflow(this.selectedType, this.selectedDocumentId)
      .pipe(finalize(() => (this.loadingWorkflow = false)))
      .subscribe({
        next: (workflow) => {
          this.workflow = workflow;
        },
        error: (error) => {
          console.error('Error loading design workflow:', error);
          this.workflow = null;
          this.snackBar.open('Failed to load design workflow.', 'Close', { duration: 3000 });
        },
      });
  }

  openDocument(): void {
    const route = this.workflow?.document?.viewRoute;

    if (route) {
      this.router.navigateByUrl(route);
    }
  }

  loadReport(): void {
    this.loadingReport = true;
    this.designWorkflowApi
      .getReport(this.reportApiFilters())
      .pipe(finalize(() => (this.loadingReport = false)))
      .subscribe({
        next: (report) => {
          this.report = report;
        },
        error: (error) => {
          console.error('Error loading design workflow report:', error);
          this.report = null;
          this.snackBar.open('Failed to load design workflow report.', 'Close', { duration: 3000 });
        },
      });
  }

  onReportFilterChange(): void {
    this.loadReport();
  }

  onReportResponsibleFilterChange(values: string[]): void {
    this.reportResponsibleFilter = this.normalizeReportMultiFilter(values, this.reportResponsibleSelectionWasAll);
    this.reportResponsibleSelectionWasAll = this.isAllReportFilter(this.reportResponsibleFilter);
    this.loadReport();
  }

  onReportDisciplineFilterChange(values: string[]): void {
    this.reportDisciplineFilter = this.normalizeReportMultiFilter(values, this.reportDisciplineSelectionWasAll);
    this.reportDisciplineSelectionWasAll = this.isAllReportFilter(this.reportDisciplineFilter);
    this.loadReport();
  }

  printReport(): void {
    if (!this.report) {
      this.loadReport();
      return;
    }

    this.enableDesignWorkflowPrintMode();
    this.schedulePrintModeFallbackCleanup();
    window.print();
  }

  private enableDesignWorkflowPrintMode = (): void => {
    document.body.classList.add(this.printBodyClass);
  };

  private disableDesignWorkflowPrintMode = (): void => {
    if (this.printFallbackCleanupTimer) {
      clearTimeout(this.printFallbackCleanupTimer);
      this.printFallbackCleanupTimer = null;
    }

    document.body.classList.remove(this.printBodyClass);
  };

  private schedulePrintModeFallbackCleanup(): void {
    if (this.printFallbackCleanupTimer) {
      clearTimeout(this.printFallbackCleanupTimer);
    }

    this.printFallbackCleanupTimer = setTimeout(this.disableDesignWorkflowPrintMode, 120000);
  }

  get selectedDocument(): DesignWorkflowDocument | null {
    return this.documents.find((document) => String(document.id) === String(this.selectedDocumentId)) ?? null;
  }

  get completedSteps(): number {
    return this.workflow?.summary?.completedSteps ?? 0;
  }

  get totalSteps(): number {
    return this.workflow?.summary?.totalSteps ?? 0;
  }

  get workflowRows(): DesignWorkflowRow[] {
    const steps = this.workflow?.steps ?? [];
    const rows: DesignWorkflowRow[] = [];

    for (let index = 0; index < steps.length; index += 3) {
      rows.push({
        steps: steps.slice(index, index + 3),
        reversed: rows.length % 2 === 1,
      });
    }

    return rows;
  }

  get reportRows(): DesignWorkflowReportRow[] {
    return (this.report?.rows ?? []).filter(row => row.type !== 'tender_review' && row.typeLabel !== 'Tender Review');
  }

  get filteredReportRows(): DesignWorkflowReportRow[] {
    return this.reportRows;
  }

  get reportResultCount(): number {
    return this.report?.filteredRows ?? this.filteredReportRows.length;
  }

  get reportTotalCount(): number {
    return this.report?.totalRows ?? this.reportRows.length;
  }

  get reportGroups(): DesignWorkflowReportGroup[] {
    const groups = new Map<string, DesignWorkflowReportRow[]>();

    this.filteredReportRows.forEach((row) => {
      const responsiblePerson = this.displayResponsiblePerson(row.responsiblePerson);
      const rows = groups.get(responsiblePerson) ?? [];

      rows.push(row);
      groups.set(responsiblePerson, rows);
    });

    return Array.from(groups.entries()).map(([responsiblePerson, rows]) => ({ responsiblePerson, rows }));
  }

  get printReportRows(): DesignWorkflowPrintReportRow[] {
    return this.reportGroups.flatMap((group) => {
      const middleIndex = Math.floor((group.rows.length - 1) / 2);

      return group.rows.map((row, rowIndex) => {
        let responsibleGroupPosition = 'middle';

        if (group.rows.length === 1) {
          responsibleGroupPosition = 'single';
        } else if (rowIndex === 0) {
          responsibleGroupPosition = 'start';
        } else if (rowIndex === group.rows.length - 1) {
          responsibleGroupPosition = 'end';
        }

        return {
          ...row,
          responsiblePersonDisplay: rowIndex === middleIndex ? group.responsiblePerson : '',
          responsibleCellClass: `responsible-cell print-responsible-cell print-responsible-cell--${responsibleGroupPosition}`,
        };
      });
    });
  }

  get reportResponsibleOptions(): string[] {
    return this.mergeReportOptions([], [
      ...this.selectedReportFilterValues(this.reportResponsibleFilter),
      ...(this.report?.filters?.responsiblePersons ?? []),
      ...this.reportRows.map((row) => this.displayResponsiblePerson(row.responsiblePerson)),
    ]);
  }

  get reportDisciplineOptions(): string[] {
    return this.mergeReportOptions(this.reportDisciplineDefaultOptions, [
      ...this.selectedReportFilterValues(this.reportDisciplineFilter),
      ...(this.report?.filters?.disciplines ?? []),
      ...this.reportRows.map((row) => row.discipline || '-'),
    ]);
  }

  get reportStageOptions(): string[] {
    return this.report?.filters?.stages?.length
      ? this.report.filters.stages
      : this.uniqueSorted([
          ...this.documentTypes.map((type) => type.label.toUpperCase()),
          ...this.reportRows.map((row) => row.stage || '-'),
        ]);
  }

  get reportStatusOptions(): string[] {
    return this.report?.filters?.statuses?.length
      ? this.report.filters.statuses
      : this.uniqueSorted(this.reportRows.map((row) => row.statusLabel || '-'));
  }

  get reportResponsibleFilterLabel(): string {
    return this.reportMultiFilterLabel(this.reportResponsibleFilter, 'All');
  }

  get reportDisciplineFilterLabel(): string {
    return this.reportMultiFilterLabel(this.reportDisciplineFilter, 'All');
  }

  get reportTitleDisciplineLabel(): string {
    const selectedDisciplines = this.selectedReportFilterValues(this.reportDisciplineFilter);

    return selectedDisciplines.length
      ? selectedDisciplines.join(' / ')
      : this.reportDisciplineDefaultOptions.join(' / ');
  }

  resetReportFilters(): void {
    this.reportResponsibleFilter = [this.allReportFilterValue];
    this.reportDisciplineFilter = [this.allReportFilterValue];
    this.reportResponsibleSelectionWasAll = true;
    this.reportDisciplineSelectionWasAll = true;
    this.reportStageFilter = 'all';
    this.reportStatusFilter = 'all';
    this.reportDateStart = null;
    this.reportDateEnd = null;
    this.loadReport();
  }

  getStepClass(step: DesignWorkflowStep): string {
    const status = step.isOverdue ? 'overdue' : step.status;

    return `workflow-node workflow-node--${status}`;
  }

  getWorkflowRowClass(row: DesignWorkflowRow): string {
    return row.reversed ? 'workflow-row workflow-row--reverse' : 'workflow-row';
  }

  getConnectorClass(index: number): string {
    const steps = this.workflow?.steps ?? [];
    const current = steps[index];
    const next = steps[index + 1];
    const isDone = current?.status === 'complete' && next?.status !== 'pending';

    return isDone ? 'workflow-connector workflow-connector--active' : 'workflow-connector';
  }

  getRowConnectorClass(row: DesignWorkflowRow, index: number): string {
    const current = row.steps[index];
    const next = row.steps[index + 1];
    const isDone = current?.status === 'complete' && next?.status !== 'pending';

    return isDone ? 'workflow-connector workflow-connector--active' : 'workflow-connector';
  }

  getRowBridgeClass(row: DesignWorkflowRow, rowIndex: number): string {
    const rows = this.workflowRows;
    const currentRow = rows[rowIndex];
    const nextRow = rows[rowIndex + 1];
    const current = currentRow?.steps[currentRow.steps.length - 1];
    const next = nextRow?.steps[0];
    const side = row.reversed ? 'left' : 'right';
    const active = current?.status === 'complete' && next?.status !== 'pending';

    return `workflow-row-bridge workflow-row-bridge--${side}${active ? ' workflow-row-bridge--active' : ''}`;
  }

  getRowConnectorIcon(row: DesignWorkflowRow): string {
    return row.reversed ? 'chevron_left' : 'chevron_right';
  }

  getStatusLabel(step: DesignWorkflowStep): string {
    if (step.isOverdue || step.status === 'overdue') {
      return 'Overdue';
    }

    switch (step.status) {
      case 'complete':
        return 'Complete';
      case 'in_process':
        return 'On process';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Pending';
    }
  }

  getStatusIcon(step: DesignWorkflowStep): string {
    if (step.isOverdue || step.status === 'overdue') {
      return 'error';
    }

    switch (step.status) {
      case 'complete':
        return 'check_circle';
      case 'in_process':
        return 'pending';
      case 'rejected':
        return 'cancel';
      default:
        return 'radio_button_unchecked';
    }
  }

  getOverdueText(step: DesignWorkflowStep | null | undefined): string {
    const overdueDays = Number(step?.overdueDays ?? 0);

    if (overdueDays <= 0) {
      return '';
    }

    return overdueDays === 1 ? 'Overdue 1 day' : `Overdue ${overdueDays} days`;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    return formatDateTimeNoSecondsDisplay(value);
  }

  displayAssignee(value: string | null | undefined): string {
    if (!value || value === '-') {
      return '-';
    }

    const raw = String(value).trim();
    return raw;
  }

  displayResponsiblePerson(value: string | null | undefined): string {
    if (!value || value === '-') {
      return '-';
    }

    const raw = String(value).trim();
    if (/^[A-Z]{2,8}(,\s*[A-Z]{2,8})+$/.test(raw)) {
      return raw;
    }

    const firstSegment = raw.split(',')[0]?.trim();
    if (firstSegment && /^[A-Z]{2,8}$/.test(firstSegment)) {
      return firstSegment;
    }

    return raw;
  }

  formatReportDate(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date
      .toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
      .toUpperCase();
  }

  private uniqueSorted(values: string[]): string[] {
    return Array.from(new Set(values.filter((value) => value && value !== '-'))).sort((a, b) => a.localeCompare(b));
  }

  private mergeReportOptions(pinnedOptions: string[], values: string[]): string[] {
    const seen = new Set<string>();
    const normalizedPinned = pinnedOptions
      .map((value) => value.trim())
      .filter(Boolean);
    const sortedValues = this.uniqueSorted(values);

    return [...normalizedPinned, ...sortedValues].filter((value) => {
      if (seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
  }

  private normalizeReportMultiFilter(values: string[] | null | undefined, previousWasAll: boolean): string[] {
    const selectedValues = (values ?? []).filter(Boolean);
    const hasAllValue = selectedValues.includes(this.allReportFilterValue);
    const valuesWithoutAll = selectedValues.filter((value) => value !== this.allReportFilterValue);

    if (!selectedValues.length) {
      return [this.allReportFilterValue];
    }

    if (hasAllValue && !previousWasAll) {
      return [this.allReportFilterValue];
    }

    if (hasAllValue && valuesWithoutAll.length) {
      return valuesWithoutAll;
    }

    return hasAllValue ? [this.allReportFilterValue] : valuesWithoutAll;
  }

  private isAllReportFilter(values: string[]): boolean {
    return !this.selectedReportFilterValues(values).length;
  }

  private selectedReportFilterValues(values: string[]): string[] {
    return (values ?? []).filter((value) => value && value !== this.allReportFilterValue);
  }

  private reportMultiFilterLabel(values: string[], allLabel: string): string {
    const selectedValues = this.selectedReportFilterValues(values);

    if (!selectedValues.length) {
      return allLabel;
    }

    if (selectedValues.length <= 2) {
      return selectedValues.join(', ');
    }

    return `${selectedValues.length} selected`;
  }

  private reportApiFilters(): DesignWorkflowReportRequestFilters {
    return {
      responsiblePersons: this.selectedReportFilterValues(this.reportResponsibleFilter),
      disciplines: this.selectedReportFilterValues(this.reportDisciplineFilter),
      stage: this.reportStageFilter,
      status: this.reportStatusFilter,
      dateStart: this.reportDateStart,
      dateEnd: this.reportDateEnd,
      excludeTypes: ['tender_review'],
    };
  }
}
