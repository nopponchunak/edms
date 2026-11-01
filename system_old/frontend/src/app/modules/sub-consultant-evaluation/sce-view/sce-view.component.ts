import { Component, OnInit, Inject, OnDestroy } from '@angular/core';
import { formatDateDisplay, formatDateTimeDisplay, formatDateTimeNoSecondsDisplay } from 'app/core/utils/date-format.util';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { SubConsultantEvaluationService, SubConsultantEvaluation } from 'app/core/services/sub-consultant-evaluation.service';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { ViewActionsComponent } from 'app/core/components/view-actions';

@Component({
    selector: 'app-sce-view',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        MatButtonModule,
        MatDividerModule,
        MatProgressSpinnerModule,
        MatIconModule,
        FuseAlertComponent,
        ViewActionsComponent
    ],
    template: `
<div class="h-full bg-gray-50">
  <div class="max-w-6xl mx-auto p-6 bg-white dark:bg-gray-900">
    <!-- Header -->
    <div class="mb-8 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">
          SUB-CONSULTANT EVALUATION FORM
        </h1>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          10 - FORM MTSC-02 | View evaluation information
        </p>
      </div>
      <!-- Standardized Actions -->
      <app-view-actions
        [backPath]="'/sub-consultant-evaluation/list'"
        [navId]="'sub-consultant-evaluation'"
        (edit)="onEdit()"
        (print)="onPrint()"
      ></app-view-actions>
    </div>

    <!-- Alert -->
    <fuse-alert class="mb-6" *ngIf="alert" [appearance]="'outline'" [type]="alert.type"
        [showIcon]="'true'" [dismissible]="'true'" (dismissed)="alert = null">
        {{ alert.message }}
    </fuse-alert>

    <!-- Loading State -->
    <div *ngIf="isLoading" class="flex justify-center items-center py-12">
      <mat-spinner [diameter]="40"></mat-spinner>
    </div>

    <!-- Content -->
    <div *ngIf="!isLoading && evaluation" class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <!-- Left Column: Details -->
      <div class="lg:col-span-2 space-y-6">
      <div class="document-card bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="p-6 border-b border-gray-200 dark:border-gray-700">
          <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div class="space-y-1">
              <div class="text-xs tracking-[0.2em] text-gray-500 dark:text-gray-400 uppercase">
                Meinhardt (Thailand) Ltd.
              </div>
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                Sub-Consultant Evaluation Form
              </h2>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Detail view in document format
              </p>
            </div>

            <div class="text-right text-sm text-gray-500 dark:text-gray-400">
              <div>{{ evaluation.circ || '/AM/T6SC' }}</div>
              <div>10 - FORM MTSC-02</div>
            </div>
          </div>

          <div class="mt-6 grid grid-cols-1 gap-4">
            <div class="document-field">
              <label>To</label>
              <div class="document-value">{{ evaluation.to || '-' }}</div>
            </div>
          </div>
        </div>

        <div class="p-6 space-y-8">
          <section>
            <h3 class="section-title">
              <mat-icon class="mr-2 text-blue-600" [svgIcon]="'heroicons_solid:document-text'"></mat-icon>
              Evaluation Details
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="document-field">
                <label>Sub-Consultant Name</label>
                <div class="document-value">{{ evaluation.sub_consultant_name || '-' }}</div>
              </div>
              <div class="document-field">
                <label>Project Name</label>
                <div class="document-value">{{ evaluation.project_name || '-' }}</div>
              </div>
              <div class="document-field">
                <label>Project No.</label>
                <div class="document-value">{{ evaluation.project_no || '-' }}</div>
              </div>
              <div class="document-field">
                <label>Department / Sub-Contract Value / Duration</label>
                <div class="document-value">{{ evaluation.department_value_duration || '-' }}</div>
              </div>
              <div class="document-field md:col-span-2">
                <label>Scope of Services Provided</label>
                <div class="document-value min-h-[72px]">{{ evaluation.scope_of_services || '-' }}</div>
              </div>
            </div>
          </section>

          <mat-divider></mat-divider>

          <section>
            <h3 class="section-title">
              <mat-icon class="mr-2 text-rose-600" [svgIcon]="'heroicons_solid:shield-exclamation'"></mat-icon>
              Anti-Corruption compliance
            </h3>

            <div class="mb-3 text-sm text-gray-700 dark:text-gray-300">
              Are there any reasonable grounds to believe that the Sub-Consultant has violated or failed to comply with Meinhardt’s Anti-Corruption programme and/or applicable laws?
            </div>

            <div class="flex flex-wrap gap-6">
              <div class="document-check-row">
                <span class="document-check-box">{{ evaluation.anti_corruption_is_violation === 1 ? '✓' : '' }}</span>
                <span>Yes - remove from approved list</span>
              </div>
              <div class="document-check-row">
                <span class="document-check-box">{{ evaluation.anti_corruption_is_violation !== 1 ? '✓' : '' }}</span>
                <span>No - proceed below</span>
              </div>
            </div>
          </section>

          <section>
            <h3 class="section-title">
              <mat-icon class="mr-2 text-amber-600" [svgIcon]="'heroicons_solid:cpu-chip'"></mat-icon>
              CAD Confirmation
            </h3>

            <div class="mb-3 text-sm text-gray-700 dark:text-gray-300">
              For Architectural and Interior Design Sub-Consultants only: Have they submitted written confirmation that their CAD Software is legal and has current annual maintenance licenses.
            </div>

            <div class="flex flex-wrap gap-6">
              <div class="document-check-row">
                <span class="document-check-box">{{ evaluation.cad_software_confirmed === 1 ? '✓' : '' }}</span>
                <span>Yes - proceed below</span>
              </div>
              <div class="document-check-row">
                <span class="document-check-box">{{ evaluation.cad_software_confirmed !== 1 ? '✓' : '' }}</span>
                <span>No - remove from approved list</span>
              </div>
            </div>
          </section>

          <mat-divider></mat-divider>

          <section>
            <h3 class="section-title">
              <mat-icon class="mr-2 text-blue-600" [svgIcon]="'heroicons_solid:table-cells'"></mat-icon>
              Rating Summary
            </h3>

            <div *ngIf="evaluation.items && evaluation.items.length > 0" class="overflow-x-auto mb-6">
              <table class="w-full border border-gray-200 dark:border-gray-700 rounded-lg">
                <thead class="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th class="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-r border-gray-200 dark:border-gray-700 align-middle">Item</th>
                    <th class="px-4 py-3 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-r border-gray-200 dark:border-gray-700 w-28 align-middle leading-tight">
                      Score<br><span class="text-xs font-normal text-gray-400">(1-10)</span>
                    </th>
                    <th class="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border-b align-middle">Comment</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let item of evaluation.items" class="border-b border-gray-200 dark:border-gray-700">
                    <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 align-middle">
                      {{ item.item_no }}. {{ item.item_name }}
                    </td>
                    <td class="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-700 align-middle">
                      <span class="inline-flex min-w-[56px] justify-center rounded-md bg-blue-50 px-3 py-1 text-lg font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                        {{ parseFloat(item.rating) }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 align-middle">
                      {{ item.comment || '-' }}
                    </td>
                  </tr>
                  <tr class="bg-gray-50 dark:bg-gray-800/60 font-semibold">
                    <td class="px-4 py-3 text-sm text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 align-middle">Average</td>
                    <td class="px-4 py-3 text-center text-lg text-blue-600 dark:text-blue-400 border-r border-gray-200 dark:border-gray-700 align-middle">
                      {{ calculateAverage() }}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-900 dark:text-white align-middle">–</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="text-sm text-gray-700 dark:text-gray-300 mb-4">
              Score: Poor (0 - 4)   Satisfactory (5 - 7)   Good (8 - 10)
            </div>

            <div class="space-y-3">
              <div class="document-check-row">
                <span class="document-check-box">{{ evaluation.is_maintained === 1 ? '✓' : '' }}</span>
                <span>Sub-Consultant to be maintained in approved lists (Average Score ≥ 5)</span>
              </div>
              <div class="document-check-row">
                <span class="document-check-box">{{ evaluation.is_removed === 1 ? '✓' : '' }}</span>
                <span>Sub-Consultant to be removed from approved lists (Average Score &lt; 5)</span>
              </div>
            </div>
          </section>
        </div>
      </div>

        </div> <!-- Left Column -->

        <!-- Right Column: Status -->
        <div class="lg:col-span-1 space-y-6 sticky top-6 self-start">
            <!-- Approval Workflow Card -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-8">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
            <mat-icon class="mr-2 text-emerald-600" [svgIcon]="'heroicons_solid:shield-check'"></mat-icon>
            Approval Workflow
        </h2>

        <div class="space-y-4">
            <!-- Evaluated By -->
            <div class="flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
                <div class="flex-shrink-0">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200">
                        <mat-icon class="text-sm">person</mat-icon>
                    </div>
                </div>
                <div class="flex-1">
                    <p class="text-sm font-medium text-gray-900 dark:text-white">
                        Evaluated by: <strong>{{ getEmployeeLabel(evaluation.evaluated_by) }}</strong>
                    </p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        Date: {{ formatDateTime(evaluation.evaluated_date) }}
                    </p>
                </div>
            </div>

            <!-- Approved By -->
            <div class="flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
                <div class="flex-shrink-0">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center"
                         [class]="getByStatusColor(evaluation.approved_by_status)">
                        <mat-icon class="text-sm" [class]="getWorkflowIconClass(evaluation.approved_by_status)">
                            {{ getWorkflowIcon(evaluation.approved_by_status) }}
                        </mat-icon>
                    </div>
                </div>
                <div class="flex-1">
                    <p class="text-sm font-medium text-gray-900 dark:text-white">
                        Approved by: <strong>{{ getEmployeeLabel(evaluation.approved_by) }}</strong>
                    </p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        Date: {{ formatDateTime(evaluation.approved_date) }}
                    </p>
                    <p class="text-sm text-gray-700 dark:text-gray-300">
                        Status:
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ml-1"
                              [class]="getByStatusColor(evaluation.approved_by_status)">
                            {{ getByStatusText(evaluation.approved_by_status) }}
                        </span>
                    </p>
                </div>
            </div>

            <!-- Acknowledged By -->
            <div class="flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
                <div class="flex-shrink-0">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center"
                         [class]="getByStatusColor(evaluation.acknowledged_by_status)">
                        <mat-icon class="text-sm" [class]="getWorkflowIconClass(evaluation.acknowledged_by_status)">
                            {{ getWorkflowIcon(evaluation.acknowledged_by_status) }}
                        </mat-icon>
                    </div>
                </div>
                <div class="flex-1">
                    <p class="text-sm font-medium text-gray-900 dark:text-white">
                        Acknowledged by: <strong>{{ getEmployeeLabel(evaluation.acknowledged_by) }}</strong>
                    </p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        Date: {{ formatDateTime(evaluation.acknowledged_date) }}
                    </p>
                    <p class="text-sm text-gray-700 dark:text-gray-300">
                        Status:
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ml-1"
                              [class]="getByStatusColor(evaluation.acknowledged_by_status)">
                            {{ getByStatusText(evaluation.acknowledged_by_status) }}
                        </span>
                    </p>
                </div>
            </div>
        </div>
        </div>

      <!-- Attached Documents Card -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-8">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
            <mat-icon class="mr-2 text-teal-600" [svgIcon]="'heroicons_solid:paper-clip'"></mat-icon>
            Attached Documents
        </h2>

        <div *ngIf="evaluation.files && evaluation.files.length > 0; else noDocs" class="space-y-4">
          <div *ngFor="let file of evaluation.files"
               class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
            <div class="flex items-center space-x-4">
              <div class="flex-shrink-0">
                <div class="w-10 h-10 rounded-full flex items-center justify-center bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200">
                  <mat-icon class="text-sm" [svgIcon]="'heroicons_outline:document'"></mat-icon>
                </div>
              </div>
              <div class="flex-1">
                <a [href]="getAttachmentUrl(file.path)" target="_blank" rel="noopener noreferrer"
                   class="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                  {{ file.name }}
                </a>
              </div>
            </div>
            <div class="ml-4">
              <a mat-stroked-button color="primary" [href]="getAttachmentUrl(file.path)" target="_blank" rel="noopener noreferrer" download class="text-xs">
                <mat-icon class="mr-1 text-blue-600" [svgIcon]="'heroicons_outline:arrow-down-tray'"></mat-icon>
                Download
              </a>
            </div>
          </div>
        </div>

        <ng-template #noDocs>
          <div class="text-sm text-gray-500 dark:text-gray-400">
            No documents attached.
          </div>
        </ng-template>
      </div>
        </div>

    </div>
  </div>
</div>
    `,
    styles: [`
      :host { display:block; }

      .document-card .section-title {
        display: flex;
        align-items: center;
        margin-bottom: 1rem;
        font-size: 1.125rem;
        font-weight: 500;
        color: rgb(17 24 39);
      }

      .document-field label {
        display: block;
        margin-bottom: 0.375rem;
        font-size: 0.875rem;
        font-weight: 500;
        color: rgb(107 114 128);
      }

      .document-value {
        min-height: 2.75rem;
        padding: 0.75rem 1rem;
        border: 1px solid rgb(229 231 235);
        border-radius: 0.5rem;
        background: rgb(249 250 251);
        color: rgb(17 24 39);
        line-height: 1.5;
        white-space: pre-wrap;
      }

      .document-check-row {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        color: rgb(17 24 39);
      }

      .document-check-box {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.25rem;
        height: 1.25rem;
        margin-top: 0.125rem;
        border: 1px solid rgb(156 163 175);
        border-radius: 0.25rem;
        background: white;
        font-size: 0.875rem;
        font-weight: 700;
        color: rgb(37 99 235);
        flex-shrink: 0;
      }

      :host-context(.dark) .document-card .section-title,
      :host-context(.dark) .document-check-row,
      :host-context(.dark) .document-value {
        color: rgb(243 244 246);
      }

      :host-context(.dark) .document-field label {
        color: rgb(156 163 175);
      }

      :host-context(.dark) .document-value {
        border-color: rgb(75 85 99);
        background: rgb(31 41 55);
      }

      :host-context(.dark) .document-check-box {
        border-color: rgb(107 114 128);
        background: rgb(31 41 55);
        color: rgb(96 165 250);
      }
    `]
})
export class SceViewComponent implements OnInit, OnDestroy {
    id: string | null = null;
    evaluation: SubConsultantEvaluation | null = null;
    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;
    employeeLookup = new Map<string, string>();
    employeeLookupWithTitle = new Map<string, string>();
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /** Helper for building full attachment URL from API path */
    getAttachmentUrl = getAttachmentUrl;

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private evaluationService: SubConsultantEvaluationService,
        private employeeService: EmployeeService,
        @Inject(DOCUMENT) private document: Document
    ) {
        this.id = this.route.snapshot.paramMap.get('id');
    }

    ngOnInit(): void {
        if (this.id) {
            this.loadEvaluation(parseInt(this.id, 10));
        }
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    onBack(): void {
        this.router.navigate(['/sub-consultant-evaluation/list']);
    }

    onEdit(): void {
        if (this.id) {
            this.router.navigate(['/sub-consultant-evaluation/edit', this.id]);
        }
    }

    loadEvaluation(id: number): void {
        this.isLoading = true;
        forkJoin({
            evaluation: this.evaluationService.findOne(id),
            employeeLookup: this.employeeService.getEmployeeLookupMap(),
            employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
        }).pipe(
            switchMap(({ evaluation, employeeLookup, employeeLookupWithTitle }) => {
                const codes = [
                    evaluation.evaluated_by,
                    evaluation.approved_by,
                    evaluation.acknowledged_by,
                    evaluation.create_by,
                    evaluation.update_by
                ].filter(code => !!code);
                return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
                    switchMap(updatedLookup => {
                        return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
                            map(updatedLookupWithTitle => ({ evaluation, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
                        );
                    })
                );
            }),
            takeUntil(this._unsubscribeAll)
        ).subscribe({
            next: ({ evaluation, employeeLookup, employeeLookupWithTitle }) => {
                this.employeeLookup = employeeLookup;
                this.employeeLookupWithTitle = employeeLookupWithTitle;
                this.evaluation = {
                    ...evaluation,
                    to: evaluation.to ? evaluation.to.replace(/\s*\(.*?\)\s*/g, '') : evaluation.to,
                    evaluated_by_status: evaluation.evaluated_by_status?.toLowerCase() as 'pending' | 'reject' | 'approve' | null ?? null,
                    approved_by_status: evaluation.approved_by_status?.toLowerCase() as 'pending' | 'reject' | 'approve' | null ?? null,
                    acknowledged_by_status: evaluation.acknowledged_by_status?.toLowerCase() as 'pending' | 'reject' | 'approve' | null ?? null,
                };
                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading evaluation:', error);
                this.alert = {
                    type: 'error',
                    message: 'Failed to load evaluation. Please try again.'
                };
                this.isLoading = false;
            }
        });
    }

    getEmployeeLabel(ref: string | number | null | undefined): string {
        return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
    }

    private getApprovedEmployeeLabel(ref: string | number | null | undefined, status: string | null | undefined): string {
        return this.isApprovedStatus(status) ? this.getEmployeeLabel(ref) : '';
    }

    private getApprovedPrintDate(
        dateString: string | null | undefined,
        status: string | null | undefined,
        formatter: (dateString: string | undefined) => string
    ): string {
        return this.isApprovedStatus(status) ? formatter(dateString || undefined) : '';
    }

    private isApprovedStatus(status: string | null | undefined): boolean {
        const normalized = String(status || '').trim().toLowerCase();
        return normalized === 'approve' || normalized === 'approved';
    }

    formatDate(dateString: string | undefined): string {
        return formatDateTimeNoSecondsDisplay(dateString);
    }

    formatDateTime(dateString: string | null | undefined): string {
        return formatDateTimeDisplay(dateString);
    }

    getByStatusText(status: string | null | undefined): string {
        if (!status) return 'Pending';
        const statusLower = status.toLowerCase();
        switch (statusLower) {
            case 'pending':
                return 'Pending';
            case 'reject':
            case 'rejected':
                return 'Rejected';
            case 'approve':
            case 'approved':
                return 'Approved';
            default:
                return status;
        }
    }

    getByStatusColor(status: string | null | undefined): string {
        if (!status) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        const statusLower = status.toLowerCase();
        switch (statusLower) {
            case 'pending':
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
            case 'approve':
            case 'approved':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'reject':
            case 'rejected':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
    }

    getWorkflowIcon(status: string | null | undefined): string {
        if (!status) return 'schedule';
        const statusLower = status.toLowerCase();
        switch (statusLower) {
            case 'approve':
            case 'approved':
                return 'check';
            case 'reject':
            case 'rejected':
                return 'close';
            default:
                return 'schedule';
        }
    }

    getWorkflowIconClass(status: string | null | undefined): string {
        if (!status) return 'text-yellow-600 dark:text-yellow-300';
        const statusLower = status.toLowerCase();
        switch (statusLower) {
            case 'approve':
            case 'approved':
                return 'text-green-600 dark:text-green-300';
            case 'reject':
            case 'rejected':
                return 'text-red-600 dark:text-red-300';
            case 'pending':
                return 'text-yellow-600 dark:text-yellow-300';
            default:
                return 'text-gray-600 dark:text-gray-300';
        }
    }

    calculateAverage(): string {
        if (!this.evaluation || !this.evaluation.items || this.evaluation.items.length === 0) {
            return '-';
        }

        const validRatings = this.evaluation.items
            .filter(item => item.item_no !== 8) // Exclude "Others" item
            .map(item => {
                const rating = typeof item.rating === 'string' ? parseFloat(item.rating) : item.rating;
                return isNaN(rating) ? 0 : rating;
            })
            .filter(rating => rating > 0);

        if (validRatings.length === 0) {
            return '-';
        }

        const sum = validRatings.reduce((acc, rating) => acc + rating, 0);
        const average = sum / validRatings.length;
        return average.toFixed(2);
    }

    parseFloat(value: string | number): number {
        return typeof value === 'string' ? parseFloat(value) : value;
    }

    onPrint(): void {
        if (!this.evaluation) {
            return;
        }
        this.printEvaluation(this.evaluation);
    }

    private printEvaluation(evaluation: SubConsultantEvaluation): void {
        const printWindow = this.document.defaultView?.open('', '_blank');
        if (!printWindow) {
            return;
        }

        const container = this.document.createElement('div');
        container.innerHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sub-Consultant Evaluation Form</title>
          <style>
            ${this.getPrintStyles()}
          </style>
        </head>
        <body>
          ${this.getPrintHTML(evaluation)}
        </body>
      </html>
    `;

        printWindow.document.write(container.innerHTML);
        printWindow.document.close();

        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        };
    }

    private getPrintHTML(evaluation: SubConsultantEvaluation): string {
        const formatDate = (dateString: string | null | undefined): string => {
            if (!dateString) return '';
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}-${month}-${year}`;
        };

        // Default item names
        const defaultItemNames = [
            'Quality and Accuracy of Document',
            'Timeliness of Documentation',
            'Understanding of MTL\'s Needs',
            'Cooperation and Responsiveness',
            'Management Abilities',
            'Compliance to EMS / OHSMS Requirements',
            'Overall Level of Satisfaction',
            'Others'
        ];

        const items = (evaluation.items || []).sort((a, b) => (a.item_no || 0) - (b.item_no || 0));

        // Calculate average rating from items that have ratings
        const itemsWithRatings = items.filter(item => {
            const rating = typeof item.rating === 'number' ? item.rating : parseFloat(String(item.rating));
            return !isNaN(rating) && rating > 0;
        });
        const averageRating = itemsWithRatings.length > 0
            ? (itemsWithRatings.reduce((sum, item) => {
                const rating = typeof item.rating === 'number' ? item.rating : parseFloat(String(item.rating)) || 0;
                return sum + rating;
            }, 0) / itemsWithRatings.length).toFixed(1)
            : '0.0';

        // Ensure at least 8 items are displayed with correct names
        const itemRows = [];
        for (let i = 1; i <= 8; i++) {
            const item = items.find(it => it.item_no === i);
            const itemName = item?.item_name || defaultItemNames[i - 1] || '';

            // Format rating - show empty if no rating
            let ratingDisplay = '';
            if (item?.rating !== null && item?.rating !== undefined && item?.rating !== '') {
                const ratingValue = typeof item.rating === 'number' ? item.rating : parseFloat(String(item.rating));
                if (!isNaN(ratingValue) && ratingValue >= 0) {
                    ratingDisplay = ratingValue.toString();
                }
            }

            // Format comment - show empty if no comment
            const commentDisplay = item?.comment || '';

            // Add B letter and vertical line for items 5, 6, 7
            let bCell = '';
            if (i === 5) {
                bCell = '<td rowspan="2" class="table-b-letter">B</td>';
            } else if (i === 7) {
                bCell = '<td class="table-b-line"></td>';
            } else if (i !== 6) {
                bCell = '<td></td>';
            }

            itemRows.push(`
        <tr>
          ${bCell}
          <td>${i}</td>
          <td>${itemName}</td>
          <td class="center">${ratingDisplay}</td>
          <td>${commentDisplay}</td>
        </tr>
      `);
        }
        const itemRowsHTML = itemRows.join('');

        return `
      <div class="page">
        <!-- Header -->
        <table class="header-table">
          <tr>
            <td class="header-left">
              <div>To :</div>
              <div class="company-name">Meinhardt (Thailand) Ltd.</div>
            </td>
            <td class="header-center">
            </td>
            <td class="header-right">
              <div class="form-code">/QMR/T6SC</div>
              <div class="logo"><img src="/erpAsset 2alogo.png" alt="MEINHARDT" style="height: 20px; max-width: 150px;" /></div>
              <div class="form-number">10 - FORM MTSC-02</div>
            </td>
          </tr>
        </table>

        <!-- Title -->
        <div class="title">SUB-CONSULTANT EVALUATION FORM</div>

        <!-- Main Content Box -->
        <div class="content-box">
          <!-- Information Fields -->
          <div class="row">
            <span class="label">Sub-Consultant Name:</span>
            <span class="dotted-line">${evaluation.sub_consultant_name || ''}</span>
          </div>

          <div class="row" style="display: flex; align-items: baseline;">
            <span class="label">Project Name:</span>
            <span class="dotted-line">${evaluation.project_name || ''}</span>
            <span class="label" style="margin-left: 30px;">Project No.:</span>
            <span class="dotted-line">${evaluation.project_no || ''}</span>
          </div>

          <div class="row">
            <span class="label">Department / Sub-Contract Value / Duration:</span>
            <span class="dotted-line">${evaluation.department_value_duration || ''}</span>
          </div>

          <div class="row">
            <span class="label">Scope of Services Provided:</span>
            <span class="dotted-line">${evaluation.scope_of_services || ''}</span>
          </div>

          <!-- Section B: Compliance -->
          <div class="section-b">
            <div class="section-b-header">
              <span class="section-b-letter">B</span>
              <div class="section-b-content">
                <div class="compliance-question">
                  Are there any reasonable grounds to believe that the Sub-Consultant has violated or failed to comply with Meinhardt's Anti-Corruption programme and/or applicable laws?
                </div>
                <div class="compliance-options">
                  <span class="compliance-option">
                    <span class="checkbox">${evaluation.anti_corruption_is_violation === 1 ? '☑' : '☐'}</span> Yes – remove from approved list
                  </span>
                  <span class="compliance-option">
                    <span class="checkbox">${evaluation.anti_corruption_is_violation === 0 ? '☑' : '☐'}</span> No – proceed below
                  </span>
                </div>

                <div class="sub-section-title">For Architectural and Interior Design Sub-Consultants only :</div>
                <div class="compliance-question">
                  Have they submitted written confirmation that their CAD Software is legal and has current annual maintenance licenses.
                </div>
                <div class="compliance-options">
                  <span class="compliance-option">
                    <span class="checkbox">${evaluation.cad_software_confirmed === 1 ? '☑' : '☐'}</span> Yes – proceed below
                  </span>
                  <span class="compliance-option">
                    <span class="checkbox">${evaluation.cad_software_confirmed === 0 ? '☑' : '☐'}</span> No – remove from approved list
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Assessment Table -->
          <div class="section-title underline">Assessment</div>
          <table class="score-table">
            <thead>
              <tr>
                <th style="width: 4%;"></th>
                <th colspan="2" style="width: 46%;">Item</th>
                <th style="width: 15%; line-height: 1.2;">Score<br><span style="font-size: 8pt; font-weight: normal;">(1-10)</span></th>
                <th style="width: 35%;">Comment</th>
              </tr>
            </thead>
            <tbody>
              ${itemRowsHTML}
              <tr class="average-row">
                <td></td>
                <td></td>
                <td><strong>Average</strong></td>
                <td class="center"><strong>${averageRating}</strong></td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <!-- Rating Scale -->
          <div class="rating-scale">
            <span class="label">Score:</span>
            <span>Poor (0 - 4)</span>
            <span>Satisfactory (5 - 7)</span>
            <span>Good (8 - 10)</span>
          </div>

          <!-- Recommendation -->
          <div class="recommendation">
            <div class="recommendation-item">
              <span class="checkbox">${evaluation.is_maintained === 1 ? '☑' : '☐'}</span>
              <span>Sub-Consultant to be maintained in approved lists (Average Score ≥ 5)</span>
            </div>
            <div class="recommendation-item">
              <span class="checkbox">${evaluation.is_removed === 1 ? '☑' : '☐'}</span>
              <span>Sub-Consultant to be removed from approved lists (Average Score < 5)</span>
            </div>
          </div>

          <!-- Signatures -->
          <div class="signature-row">
            <span class="label">Evaluated by:</span>
            <span class="dotted-sig">${this.getApprovedEmployeeLabel(evaluation.evaluated_by, evaluation.evaluated_by_status)}</span>
            <span class="role">(DI/ TL)</span>
            <span class="label">Date:</span>
            <span class="dotted-date">${this.getApprovedPrintDate(evaluation.evaluated_date, evaluation.evaluated_by_status, formatDate)}</span>
          </div>

          <div class="signature-row">
            <span class="label">Approved by:</span>
            <span class="dotted-sig">${this.getApprovedEmployeeLabel(evaluation.approved_by, evaluation.approved_by_status)}</span>
            <span class="role">(MD/ DI/ TL)</span>
            <span class="label">Date:</span>
            <span class="dotted-date">${this.getApprovedPrintDate(evaluation.approved_date, evaluation.approved_by_status, formatDate)}</span>
          </div>

          <div class="signature-row">
            <span class="label">Acknowledged by:</span>
            <span class="dotted-sig">${this.getApprovedEmployeeLabel(evaluation.acknowledged_by, evaluation.acknowledged_by_status)}</span>
            <span class="role">(IMR)</span>
            <span class="label">Date:</span>
            <span class="dotted-date">${this.getApprovedPrintDate(evaluation.acknowledged_date, evaluation.acknowledged_by_status, formatDate)}</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="footer-ref">Z:MR/MYDOCUMENTS/IMS DOCUMENT/IMS DOCUMENTATION/FORMS/5BE0BD75816DD999767C80BAD4A36614DA044C008A12432F9A8D7423AC5A13E4.DOC/REV.B (01/01/2018)/CC/NK/MR</div>
          <div class="page-num">Page 1 of 1</div>
        </div>
      </div>
    `;
    }

    private getPrintStyles(): string {
        return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #000; background: #fff; }

      .page { width: 210mm; height: 297mm; padding: 5mm; margin: 0 auto; display: flex; flex-direction: column; }

      /* Header */
      .header-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
      .header-table td { vertical-align: top; padding: 3px 0; }
      .header-left { width: 40%; }
      .header-center { width: 30%; }
      .header-right { width: 30%; text-align: right; }
      .company-name { font-weight: bold; }
      .dotted-short { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 150px; }
      .form-code { font-size: 10pt; }
      .logo { font-size: 16pt; font-weight: bold; letter-spacing: 2px; text-align: right; }
      .logo img { height: 20px; max-width: 150px; object-fit: contain; display: block; margin-left: auto; }
      .form-number { font-size: 9pt; }

      /* Title - 14-16 pt (Bold) */
      .title { text-align: center; font-size: 15pt; font-weight: bold; text-decoration: underline; margin: 10px 0; color: #144c90; text-decoration-color: #144c90; }

      /* Content Box */
      .content-box { border: 1px solid #000; padding: 10px 12px; page-break-inside: avoid; break-inside: avoid; flex: 1; }

      /* Rows - Body 10-11 pt (Regular) */
      .row { margin: 5px 0; font-size: 10pt; line-height: 1.4; }
      .label { font-weight: bold; margin-right: 5px; }
      .dotted-line { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 200px; margin-left: 5px; flex: 1; }
      .ml { margin-left: 30px; }

      /* Section B: Compliance */
      .section-b { margin: 10px 0; position: relative; }
      .section-b-header {
        display: flex;
        align-items: flex-start;
        position: relative;
      }
      .section-b-letter {
        font-size: 24pt;
        font-weight: 900;
        margin-right: 0;
        line-height: 1;
        position: relative;
        padding-right: 10px;
        border-right: 3px solid #000;
        display: flex;
        align-items: flex-start;
        padding-top: 0;
        flex-shrink: 0;
        height: auto;
      }
      .section-b-content {
        flex: 1;
        padding-left: 8px;
        margin-left: 0;
        display: flex;
        flex-direction: column;
      }
      .compliance-question { font-size: 10pt; margin: 5px 0; line-height: 1.4; }
      .compliance-options { margin: 5px 0 10px 0; }
      .compliance-option { display: inline-block; margin-right: 20px; font-size: 10pt; white-space: nowrap; }
      .checkbox { font-size: 12pt; margin-right: 5px; }
      .sub-section-title { font-weight: bold; font-size: 10pt; margin: 10px 0 5px 0; }

      /* Section Title - 11-12 pt (Bold) */
      .section-title { font-weight: bold; font-size: 12pt; margin: 8px 0 5px 0; }
      .section-title.underline { text-decoration: underline; }

      /* Score Table - 10-11 pt (Regular) */
      .score-table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 10pt; }
      .score-table th, .score-table td { border: 1px solid #000; padding: 5px 6px; text-align: left; }
      .score-table th { background: #f5f5f5; font-weight: bold; text-align: center; }
      .score-table .col-item { width: 50%; text-align: left; }
      .score-table .col-rating { width: 15%; text-align: center; }
      .score-table .col-comment { width: 35%; text-align: left; }
      .score-table td.center { text-align: center; }
      .score-table td:first-child {
        width: 4%;
        text-align: center;
        padding: 5px 3px;
        vertical-align: middle;
        border-right: none;
      }
      .score-table td:nth-child(2) { width: 4%; text-align: center; padding-right: 8px; }
      .score-table td:nth-child(3) { width: 42%; }
      .score-table td:nth-child(4) { width: 15%; text-align: center; }
      .score-table td:nth-child(5) { width: 35%; }
      .table-b-letter {
        font-size: 18pt;
        font-weight: 900;
        text-align: center;
        vertical-align: middle;
        padding: 5px 3px;
        border-right: 2px solid #000 !important;
        position: relative;
      }
      .table-b-line {
        border-right: 2px solid #000 !important;
        padding: 5px 3px;
      }
      .average-row { font-weight: bold; }
      .average-row td:first-child { text-align: center; }

      /* Rating Scale */
      .rating-scale { margin: 8px 0; font-size: 10pt; }
      .rating-scale .label { margin-right: 5px; }
      .rating-scale span { margin-right: 15px; }

      /* Recommendation */
      .recommendation { margin: 8px 0; }
      .recommendation-item { margin: 4px 0; font-size: 10pt; line-height: 1.4; }

      /* Signatures */
      .signature-row { margin: 10px 0; font-size: 10pt; display: flex; align-items: baseline; gap: 5px; }
      .dotted-sig { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 150px; }
      .dotted-date { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 100px; }
      .role { font-size: 10pt; margin: 0 10px; }

      /* Footer */
      .footer { margin-top: auto; padding-top: 6px; border-top: 1px solid #ccc; font-size: 7pt; color: #666; display: flex; justify-content: space-between; }
      .footer-ref { flex: 1; }
      .page-num { text-align: right; }

      @media print {
        @page { size: A4 portrait; margin: 0; }
        body { margin: 0; padding: 0; }
        .page { width: 100%; height: 297mm; padding: 5mm; box-sizing: border-box; page-break-inside: avoid; break-inside: avoid; }
        .content-box { page-break-inside: avoid; break-inside: avoid; }
      }
    `;
    }
}
