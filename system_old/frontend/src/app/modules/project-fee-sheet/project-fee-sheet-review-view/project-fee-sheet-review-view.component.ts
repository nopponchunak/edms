import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { EmployeeService } from 'app/core/services/employee.service';
import { FeeSheetService, FeeSheetType, resolveFeeSheetStatus } from 'app/core/services/fee-sheet.service';
import { ProjectType, ProjectTypeService } from 'app/core/services/project-type.service';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { resolveEmployeeDisplayInitial } from 'app/core/utils/employee-display.util';
import {
  PROJECT_FACADE_FEE_SHEET_EMAIL_CONFIG,
  PROJECT_FEE_SHEET_EMAIL_CONFIG,
  PROJECT_TRANSPORTATION_FEE_SHEET_EMAIL_CONFIG,
  WorkflowEmailConfig,
  WorkflowEmailNotificationService,
} from 'app/core/services/workflow-email-notification.service';
import {
  getRemovedRows,
  getRowDiffState,
  RevisionDiffState,
  valuesDifferent,
} from '../project-fee-sheet-view/project-fee-sheet-revision-diff.util';

interface FeeSheetApprovalRouteData {
  feeSheetType: FeeSheetType;
  documentLabel: string;
  listPath: string;
  viewPath: string;
}

interface FeeAgreementLineItemView {
  name: string;
  amount: number;
}

interface FeeAgreementRevisionView {
  revisionNo: number;
  revisionLabel: string;
  revisionName: string;
  grossFee: number;
  subconsultantsName: string;
  subconsultantsAmount: number;
  subconsultantsItems: FeeAgreementLineItemView[];
  otherExpensesName: string;
  otherExpenses: number;
  otherExpensesItems: FeeAgreementLineItemView[];
  nettFee: number;
  agreementReceived: string;
}

interface FeeAgreementRevisionColumn extends FeeAgreementRevisionView {
  pageRevisionNo: number;
  pageRevisionLabel: string;
}

interface ProjectFeeSheetApprovalRevision {
  id: string;
  revisionNo: number;
  revisionLabel: string;
  isLatest: boolean;
  projectPNo: string;
  projectNo: string;
  date: string;
  team: string;
  directorInCharge: string;
  discipline: string;
  projectName: string;
  location: string;
  client: string;
  contactName: string;
  mtlScope: string;
  comments: string;
  feeAgreements: FeeAgreementRevisionView[];
  jobCostingAllocation: Array<{ phase: string; percentage: number; startDate: string; endDate: string }>;
  billingForecast: Array<{ month: string; amount: number }>;
  projectType: string;
  filledInBy: string;
  filledInDate: string;
  approvedBy: string;
  approvedDate: string;
  approvedByCode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-project-fee-sheet-review-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    FuseAlertComponent,
  ],
  template: `
    <div class="ims-view-page">
      <div class="ims-view-shell">
        <div class="ims-view-header flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 class="mb-2 text-2xl font-bold uppercase text-blue-600">{{ documentLabel }} Approval</h1>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Review the latest revision against the previous revision before submitting the CH decision.
            </p>
          </div>
          <button mat-stroked-button class="rounded-full px-5" type="button" (click)="backToList()">
            <mat-icon class="mr-2" [svgIcon]="'heroicons_outline:arrow-left'"></mat-icon>
            Back to List
          </button>
        </div>

        <fuse-alert
          class="mb-6"
          *ngIf="alert"
          [appearance]="'outline'"
          [type]="alert.type"
          [showIcon]="'true'"
          [dismissible]="'true'"
          (dismissed)="alert = null">
          {{ alert.message }}
        </fuse-alert>

        <div *ngIf="isLoading" class="flex justify-center items-center py-24">
          <mat-spinner [diameter]="48"></mat-spinner>
        </div>

        <div *ngIf="!isLoading && feeSheet" class="space-y-6">
          <div class="space-y-6">
            <div class="ims-card">
              <div class="ims-card-header bg-gray-50/50 dark:bg-gray-800/50">
                <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div class="mb-1 text-xs tracking-[0.2em] text-gray-500 dark:text-gray-400 uppercase">
                      Meinhardt (Thailand) Ltd.
                    </div>
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white uppercase">
                      {{ documentLabel }}
                    </h2>
                  </div>
                  <span class="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium" [class]="getStatusBadgeClass(feeSheet.status)">
                    {{ getStatusLabel(feeSheet.status) }}
                  </span>
                </div>
              </div>

              <mat-tab-group
                class="revision-tabs"
                [selectedIndex]="selectedRevisionIndex"
                (selectedIndexChange)="onRevisionTabChange($event)">
                <mat-tab *ngFor="let revision of feeSheetRevisions; let i = index" [label]="getRevisionTabLabel(revision, i)"></mat-tab>
              </mat-tab-group>

              <div class="ims-card-body space-y-8">
                <section>
                  <h3 class="document-section-title">Project Information</h3>
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div class="document-field">
                      <label>Project "P No."</label>
                      <div class="ims-field-box" [ngClass]="getFieldClass('projectPNo')">{{ feeSheet.projectPNo }}</div>
                    </div>
                    <div class="document-field">
                      <label>Project No.</label>
                      <div class="ims-field-box font-mono font-bold text-gray-900 dark:text-gray-100" [ngClass]="getFieldClass('projectNo')">{{ feeSheet.projectNo }}</div>
                    </div>
                    <div class="document-field">
                      <label>Date</label>
                      <div class="ims-field-box" [ngClass]="getFieldClass('date')">{{ formatDate(feeSheet.date) }}</div>
                    </div>
                    <div class="document-field lg:col-span-2">
                      <label>Project Name</label>
                      <div class="ims-field-box font-semibold text-gray-900 dark:text-white" [ngClass]="getFieldClass('projectName')">{{ feeSheet.projectName }}</div>
                    </div>
                    <div class="document-field">
                      <label>Discipline</label>
                      <div class="ims-field-box" [ngClass]="getFieldClass('discipline')">{{ feeSheet.discipline }}</div>
                    </div>
                    <div class="document-field">
                      <label>Team (TL)</label>
                      <div class="ims-field-box" [ngClass]="getFieldClass('team')">{{ feeSheet.team }}</div>
                    </div>
                    <div class="document-field">
                      <label>Director In Charge (DI)</label>
                      <div class="ims-field-box" [ngClass]="getFieldClass('directorInCharge')">{{ feeSheet.directorInCharge }}</div>
                    </div>
                    <div class="document-field">
                      <label>Location</label>
                      <div class="ims-field-box" [ngClass]="getFieldClass('location')">{{ feeSheet.location }}</div>
                    </div>
                    <div class="document-field lg:col-span-2">
                      <label>Client</label>
                      <div class="ims-field-box" [ngClass]="getFieldClass('client')">{{ feeSheet.client }}</div>
                    </div>
                    <div class="document-field">
                      <label>Contact Name</label>
                      <div class="ims-field-box" [ngClass]="getFieldClass('contactName')">{{ feeSheet.contactName }}</div>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 gap-6 mt-6">
                    <div class="document-field">
                      <label>MTL Scope detail(s) and phase(s)</label>
                      <div class="ims-field-box min-h-[5rem] items-start py-2 whitespace-pre-wrap" [ngClass]="getFieldClass('mtlScope')">{{ feeSheet.mtlScope }}</div>
                    </div>
                    <div class="document-field">
                      <label>Comments / Remark</label>
                      <div class="ims-field-box min-h-[4rem] items-start py-2 whitespace-pre-wrap" [ngClass]="getFieldClass('comments')">{{ feeSheet.comments }}</div>
                    </div>
                  </div>
                </section>

                <mat-divider></mat-divider>

                <section>
                  <h3 class="document-section-title">Fee Agreement & Revisions</h3>
                  <div class="ims-table-container">
                    <table class="ims-table fee-agreement-chain-table">
                      <thead>
                        <tr>
                          <th class="fee-agreement-description-col">Description</th>
                          <th *ngFor="let revision of feeAgreementRevisionColumns" class="align-center fee-agreement-revision-col">
                            {{ revision.pageRevisionLabel }}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td class="font-medium">Fee Agreement Received?</td>
                          <td *ngFor="let revision of feeAgreementRevisionColumns; let i = index" class="align-center whitespace-pre-wrap" [ngClass]="getFeeAgreementChainClass(i, 'agreementReceived')">
                            {{ revision.agreementReceived || '-' }}
                          </td>
                        </tr>
                        <tr>
                          <td class="font-medium">Gross Fee (excl VAT)</td>
                          <td *ngFor="let revision of feeAgreementRevisionColumns; let i = index" class="align-center" [ngClass]="getFeeAgreementChainClass(i, 'grossFee')">
                            {{ formatCurrency(revision.grossFee) }}
                          </td>
                        </tr>
                        <tr>
                          <td class="font-medium">Less Subconsultants</td>
                          <td *ngFor="let revision of feeAgreementRevisionColumns; let i = index" class="align-center" [ngClass]="getFeeAgreementChainClass(i, 'subconsultantsItems')">
                            <div class="fee-item-list" *ngIf="revision.subconsultantsItems.length; else noSubconsultants">
                              <div class="fee-item-row" *ngFor="let item of revision.subconsultantsItems">
                                <span>{{ item.name || '-' }}</span>
                                <strong>{{ formatCurrency(item.amount) }}</strong>
                              </div>
                              <div class="fee-item-total">
                                <span>Total</span>
                                <strong>{{ formatCurrency(revision.subconsultantsAmount) }}</strong>
                              </div>
                            </div>
                            <ng-template #noSubconsultants><span class="text-gray-400">-</span></ng-template>
                          </td>
                        </tr>
                        <tr>
                          <td class="font-medium">Less Other Expenses</td>
                          <td *ngFor="let revision of feeAgreementRevisionColumns; let i = index" class="align-center" [ngClass]="getFeeAgreementChainClass(i, 'otherExpensesItems')">
                            <div class="fee-item-list" *ngIf="revision.otherExpensesItems.length; else noOtherExpenses">
                              <div class="fee-item-row" *ngFor="let item of revision.otherExpensesItems">
                                <span>{{ item.name || '-' }}</span>
                                <strong>{{ formatCurrency(item.amount) }}</strong>
                              </div>
                              <div class="fee-item-total">
                                <span>Total</span>
                                <strong>{{ formatCurrency(revision.otherExpenses) }}</strong>
                              </div>
                            </div>
                            <ng-template #noOtherExpenses><span class="text-gray-400">-</span></ng-template>
                          </td>
                        </tr>
                        <tr class="bg-gray-100/50 dark:bg-gray-800/50">
                          <td class="font-bold text-gray-900 dark:text-white">Nett Fee (excl VAT)</td>
                          <td *ngFor="let revision of feeAgreementRevisionColumns; let i = index" class="align-center font-bold text-gray-900 dark:text-white" [ngClass]="getFeeAgreementChainClass(i, 'nettFee')">
                            {{ formatCurrency(revision.nettFee) }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>

                <mat-divider></mat-divider>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <section>
                    <h3 class="document-section-title">Job Costing Allocation</h3>
                    <div class="ims-table-container">
                      <table class="ims-table">
                        <thead>
                          <tr>
                            <th>Phase</th>
                            <th class="align-center">% of Fee</th>
                            <th class="align-center">Period</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr *ngFor="let item of getJobCostingRowsForView()" [ngClass]="getRowStateClass(item._changeState)">
                            <td class="font-medium">{{ item.phase }}</td>
                            <td class="align-center">{{ item.percentage }}%</td>
                            <td class="align-center text-xs">{{ formatDate(item.startDate) }} - {{ formatDate(item.endDate) }}</td>
                          </tr>
                          <tr *ngIf="!getJobCostingRowsForView().length">
                            <td colspan="3" class="text-center text-gray-500 py-4 italic">No job costing data</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section>
                    <h3 class="document-section-title">Billing Forecast</h3>
                    <div class="ims-table-container">
                      <table class="ims-table">
                        <thead>
                          <tr>
                            <th>1st of Month</th>
                            <th class="align-right">Amount (approx)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr *ngFor="let item of getBillingForecastRowsForView()" [ngClass]="getRowStateClass(item._changeState)">
                            <td class="font-medium">{{ formatDate(item.month) }}</td>
                            <td class="align-right font-mono">{{ formatCurrency(item.amount) }}</td>
                          </tr>
                          <tr *ngIf="!getBillingForecastRowsForView().length">
                            <td colspan="2" class="text-center text-gray-500 py-4 italic">No forecast data</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>

                <mat-divider></mat-divider>

                <section>
                  <h3 class="document-section-title">Type & Signatures</h3>
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div class="document-field">
                      <label>Project Type</label>
                      <div class="ims-field-box" [ngClass]="getFieldClass('projectType')">{{ feeSheet.projectType }}</div>
                    </div>
                    <div class="document-field">
                      <label>Form filled in by</label>
                      <div class="ims-field-box font-medium" [ngClass]="getFieldClass('filledInBy')">{{ feeSheet.filledInBy }}</div>
                    </div>
                    <div class="document-field">
                      <label>Date</label>
                      <div class="ims-field-box" [ngClass]="getFieldClass('filledInDate')">{{ formatDate(feeSheet.filledInDate) }}</div>
                    </div>
                    <div class="lg:col-span-1 hidden lg:block"></div>
                    <div class="document-field">
                      <label>Approved by CH (MD)</label>
                      <div class="ims-field-box font-medium" [ngClass]="getFieldClass('approvedBy')">{{ feeSheet.approvedBy }}</div>
                    </div>
                    <div class="document-field">
                      <label>Date</label>
                      <div class="ims-field-box" [ngClass]="getFieldClass('approvedDate')">{{ formatDate(feeSheet.approvedDate) }}</div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>

          <mat-card class="ims-card action-footer-card fee-sheet-action-card mt-6">
            <div class="ims-card-body p-6 md:p-8">
              <div class="mb-6">
                <h3 class="text-xl font-bold text-gray-900">Approval Decision</h3>
                <p class="text-sm text-gray-500">You are updating the status for this fee sheet</p>
              </div>

              <div class="space-y-6">
                <div *ngIf="permissionMessage" class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {{ permissionMessage }}
                </div>

                <div
                  class="fee-sheet-decision-field"
                  [class.is-open]="decisionDropdownOpen"
                  [class.is-disabled]="!canAct || isSubmitting">
                  <label class="fee-sheet-decision-label">Status</label>
                  <button
                    type="button"
                    class="fee-sheet-decision-trigger"
                    [disabled]="!canAct || isSubmitting"
                    (click)="toggleDecisionDropdown($event)"
                    (keydown.escape)="closeDecisionDropdown()">
                    <span>{{ getDecisionLabel() }}</span>
                    <span class="fee-sheet-decision-arrow"></span>
                  </button>

                  <div
                    *ngIf="decisionDropdownOpen"
                    class="fee-sheet-decision-panel"
                    (click)="$event.stopPropagation()">
                    <button
                      type="button"
                      class="fee-sheet-decision-option"
                      [class.is-selected]="decision === 'approve'"
                      (click)="setDecision('approve', $event)">
                      <span class="fee-sheet-decision-check">{{ decision === 'approve' ? '✓' : '' }}</span>
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      class="fee-sheet-decision-option"
                      [class.is-selected]="decision === 'reject'"
                      (click)="setDecision('reject', $event)">
                      <span class="fee-sheet-decision-check">{{ decision === 'reject' ? '✓' : '' }}</span>
                      <span>Reject</span>
                    </button>
                  </div>
                </div>

                <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <p class="text-sm text-blue-800 mb-2">
                    <strong>Approved by CH:</strong>
                  </p>
                  <p class="text-base font-semibold text-blue-900">
                    {{ feeSheet.approvedBy }}
                  </p>
                </div>

                <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Highlighted fields show changes in the latest revision compared with the previous revision.
                </div>

                <div class="flex justify-end space-x-4 pt-4">
                  <button
                    type="button"
                    (click)="backToList()"
                    class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    [disabled]="!canAct || !decision || isSubmitting"
                    (click)="submitDecision()"
                    class="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span *ngIf="!isSubmitting">Update Status</span>
                    <mat-spinner *ngIf="isSubmitting" [diameter]="20"></mat-spinner>
                  </button>
                </div>
              </div>
            </div>
          </mat-card>
        </div>

        <div *ngIf="!isLoading && !feeSheet" class="text-center py-24 bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
          <mat-icon class="text-6xl text-gray-400 mb-4" [svgIcon]="'heroicons_outline:exclamation-circle'"></mat-icon>
          <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Fee sheet not found</h3>
          <p class="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">The fee sheet you're looking for doesn't exist or has been deleted.</p>
          <button mat-flat-button color="primary" class="rounded-full px-8" (click)="backToList()">
            <mat-icon class="mr-2" [svgIcon]="'heroicons_outline:arrow-left'"></mat-icon>
            Return to List
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['../project-fee-sheet-view/project-fee-sheet-view.component.scss'],
})
export class ProjectFeeSheetReviewViewComponent implements OnInit {
  feeSheet: ProjectFeeSheetApprovalRevision | null = null;
  feeSheetRevisions: ProjectFeeSheetApprovalRevision[] = [];
  feeAgreementRevisionColumns: FeeAgreementRevisionColumn[] = [];
  selectedRevisionIndex = 0;
  rawRevision: any = null;
  rawResponse: any = null;

  documentLabel = 'Project Fee Sheet';
  listPath = '/project-fee-sheet/list';
  viewPath = '/project-fee-sheet/view';
  feeSheetType: FeeSheetType = 'project';

  alert: { type: FuseAlertType; message: string } | null = null;
  isLoading = false;
  isSubmitting = false;
  canAct = false;
  permissionMessage = '';
  decision: 'approve' | 'reject' | null = null;
  decisionDropdownOpen = false;

  private employeeLabelById = new Map<number, string>();
  private employeeLabelByCode = new Map<string, string>();
  private projectTypes: ProjectType[] = [];

  private readonly DISCIPLINE_OPTIONS = [
    { id: '1', name: 'C&S' },
    { id: '2', name: 'M&E' },
    { id: '3', name: 'Facade' },
    { id: '4', name: 'Lighting' },
    { id: '5', name: 'Transportation' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private feeSheetService: FeeSheetService,
    private employeeService: EmployeeService,
    private projectTypeService: ProjectTypeService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private fuseConfirmationService: FuseConfirmationService,
    private toastr: ToastrService
  ) {}

  @HostListener('document:click')
  closeDecisionDropdown(): void {
    this.decisionDropdownOpen = false;
  }

  ngOnInit(): void {
    const data = this.route.snapshot.data as FeeSheetApprovalRouteData;
    this.feeSheetType = data.feeSheetType ?? 'project';
    this.documentLabel = data.documentLabel ?? 'Project Fee Sheet';
    this.listPath = data.listPath ?? '/project-fee-sheet/list';
    this.viewPath = data.viewPath ?? '/project-fee-sheet/view';
    this.loadFeeSheet();
  }

  private loadFeeSheet(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.toastr.error('Fee sheet id is missing.');
      this.backToList();
      return;
    }

    this.isLoading = true;
    this.alert = null;
    forkJoin({
      fee: this.feeSheetService.getById(id),
      employees: this.employeeService.getEmployees('', 200).pipe(catchError(() => of([]))),
      projectTypes: this.projectTypeService.getAll().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ fee, employees, projectTypes }: any) => {
        this.projectTypes = this.normalizeToArray(projectTypes);
        this.buildEmployeeLookup(employees);
        this.rawResponse = fee;
        this.rawRevision = fee?.currentRevision ?? fee?.revision ?? null;
        this.feeSheetRevisions = this.buildActionRevisions(fee, id);
        this.selectedRevisionIndex = Math.max(this.feeSheetRevisions.length - 1, 0);
        this.feeSheet = this.feeSheetRevisions[this.selectedRevisionIndex] ?? null;
        this.feeAgreementRevisionColumns = this.buildFeeAgreementRevisionColumns();
        this.evaluateAccess();
        this.isLoading = false;
      },
      error: (error) => {
        console.error(error);
        this.isLoading = false;
        this.alert = { type: 'error', message: error?.error?.message ?? 'Load fee sheet failed.' };
      },
    });
  }

  private buildActionRevisions(fee: any, id: string): ProjectFeeSheetApprovalRevision[] {
    const revisionsRaw = Array.isArray(fee?.revisions) && fee.revisions.length
      ? fee.revisions
      : [fee?.revision ?? fee?.currentRevision].filter(Boolean);
    const project = fee?.project ?? null;
    const allRevisions = revisionsRaw
      .map((rev: any) => this.mapRevisionToFeeSheet(fee, rev, project, id))
      .sort((a: ProjectFeeSheetApprovalRevision, b: ProjectFeeSheetApprovalRevision) => a.revisionNo - b.revisionNo);

    const currentRevisionNo = Number(
      fee?.currentRevision?.rev_no ??
        fee?.currentRevision?.revision_no ??
        fee?.revision?.rev_no ??
        fee?.revision?.revision_no
    );
    const latestIndex = allRevisions.findIndex((row) =>
      Number.isFinite(currentRevisionNo)
        ? row.revisionNo === currentRevisionNo
        : row.isLatest
    );
    const resolvedLatestIndex = latestIndex >= 0 ? latestIndex : Math.max(allRevisions.length - 1, 0);
    const previous = resolvedLatestIndex > 0 ? allRevisions[resolvedLatestIndex - 1] : null;
    const latest = allRevisions[resolvedLatestIndex] ?? null;

    return [previous, latest].filter(Boolean) as ProjectFeeSheetApprovalRevision[];
  }

  private mapRevisionToFeeSheet(fee: any, rev: any, project: any, id: string): ProjectFeeSheetApprovalRevision {
    const revisionNo = Number(rev?.rev_no ?? rev?.revision_no ?? 0);
    const feeAgreementsRaw = Array.isArray(rev?.fee_agreements) ? rev.fee_agreements : [];
    const feeAgreements = feeAgreementsRaw.map((row: any) => this.mapFeeAgreement(row));
    const fee0 = feeAgreements[0] ?? null;
    const teamMembers = Array.isArray(rev?.team_members) ? rev.team_members : [];
    const teamText = teamMembers.length
      ? teamMembers.map((item: any) => this.getEmployeeLabel(item.employee_code)).filter(Boolean).join(', ')
      : (rev?.team ?? '-');
    const billingRows = ((Array.isArray(rev?.billing_forecasts) ? rev.billing_forecasts : null)
      ?? (Array.isArray(rev?.billing_forecast) ? rev.billing_forecast : [])).map((row: any) => ({
      month: row.month ?? row.estimated_date ?? row.estimatedDate ?? '',
      amount: Number(row.amount ?? 0),
    }));

    return {
      id: String(fee?.id ?? id),
      revisionNo,
      revisionLabel: this.revisionDisplayLabel(revisionNo),
      isLatest: Boolean(rev?.is_latest),
      projectPNo: project?.project_no ?? '-',
      projectNo: rev?.mt_project_no ?? fee?.mtProjectNo ?? '-',
      date: rev?.form_filled_by_date ?? rev?.created_at ?? '',
      team: teamText,
      directorInCharge: this.getEmployeeLabel(rev?.director_in_charge_id),
      discipline: rev?.discipline?.name || this.getDisciplineLabel(rev?.discipline_id),
      projectName: rev?.project_name ?? project?.project_name ?? '-',
      location: rev?.location ?? project?.city ?? '-',
      client: rev?.client_name ?? project?.client_name ?? '-',
      contactName: rev?.contact_name ?? project?.client_contact_name ?? '-',
      mtlScope: rev?.mtl_scope_detail ?? '-',
      comments: rev?.comment ?? '-',
      feeAgreements,
      jobCostingAllocation: ((Array.isArray(rev?.job_costings) ? rev.job_costings : null)
        ?? (Array.isArray(rev?.job_costing) ? rev.job_costing : [])).map((row: any) => ({
        phase: row.phase,
        percentage: Number(row.percent ?? row.percentage ?? 0),
        startDate: row.start_date,
        endDate: row.end_date,
      })),
      billingForecast: billingRows,
      projectType: this.getProjectTypeLabel(rev?.project_type, rev?.project_type_id),
      filledInBy: this.getEmployeeLabel(rev?.form_filled_by_id),
      filledInDate: rev?.form_filled_by_date ?? '',
      approvedBy: this.getEmployeeLabel(rev?.approved_by_ch_id),
      approvedDate: rev?.approved_by_ch_date ?? '',
      approvedByCode: String(rev?.approved_by_ch_id ?? ''),
      status: resolveFeeSheetStatus(rev?.status, rev?.approved_by_ch_status, fee?.status),
      createdAt: rev?.created_at ?? '',
      updatedAt: rev?.updated_at ?? '',
    };
  }

  private mapFeeAgreement(row: any): FeeAgreementRevisionView {
    const subconsultantsItems = this.normalizeFeeAgreementItems(
      row,
      'less_subconsultants_items',
      'less_subconsultants_name',
      'less_subconsultants_number'
    );
    const otherExpensesItems = this.normalizeFeeAgreementItems(
      row,
      'less_other_expenses_items',
      'less_other_expenses_name',
      'less_other_expenses'
    );

    return {
      revisionNo: Number(row?.revision_no ?? 0),
      revisionLabel: this.revisionDisplayLabel(Number(row?.revision_no ?? 0)),
      revisionName: this.revisionDisplayLabel(Number(row?.revision_no ?? 0)),
      grossFee: Number(row?.gross_fee_excl_vat ?? 0),
      subconsultantsName: String(row?.less_subconsultants_name ?? '-'),
      subconsultantsAmount: this.feeAgreementItemTotal(
        subconsultantsItems,
        row,
        'less_subconsultants_items',
        'less_subconsultants_number'
      ),
      subconsultantsItems,
      otherExpensesName: String(row?.less_other_expenses_name ?? '-'),
      otherExpenses: this.feeAgreementItemTotal(
        otherExpensesItems,
        row,
        'less_other_expenses_items',
        'less_other_expenses'
      ),
      otherExpensesItems,
      nettFee: Number(row?.net_fee_excl_vat ?? 0),
      agreementReceived: String(row?.agreement_received ?? ''),
    };
  }

  private normalizeFeeAgreementItems(
    row: any,
    itemsKey: string,
    legacyNameKey: string,
    legacyAmountKey: string
  ): FeeAgreementLineItemView[] {
    const source = Array.isArray(row?.[itemsKey]) && row[itemsKey].length
      ? row[itemsKey]
      : ((String(row?.[legacyNameKey] ?? '').trim() || Number(row?.[legacyAmountKey] ?? 0) !== 0)
        ? [{ name: row?.[legacyNameKey], amount: row?.[legacyAmountKey] }]
        : []);

    return source
      .map((item: any) => ({
        name: String(item?.name ?? '').trim(),
        amount: Number(item?.amount ?? 0),
      }))
      .filter((item: FeeAgreementLineItemView) => item.name || item.amount !== 0);
  }

  private feeAgreementItemTotal(
    items: FeeAgreementLineItemView[],
    row: any,
    itemsKey: string,
    legacyAmountKey: string
  ): number {
    if (!Array.isArray(row?.[itemsKey])) {
      return Number(row?.[legacyAmountKey] ?? 0);
    }

    return items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  }

  private buildEmployeeLookup(employees: any): void {
    this.employeeLabelById.clear();
    this.employeeLabelByCode.clear();

    this.normalizeToArray(employees).forEach((employee: any) => {
      const id = Number(employee?.id);
      const code = String(employee?.employee_code ?? employee?.code ?? '').trim();
      const rawName = `${employee?.firstname ?? ''} ${employee?.lastname ?? ''}`.trim()
        || employee?.name
        || (Number.isFinite(id) ? `Employee ${id}` : code || 'Employee');
      const nameOnly = rawName.replace(/\s*\([^)]*\)$/, '').trim() || '-';
      const initial = resolveEmployeeDisplayInitial(employee);

      const label = initial ? `${initial} , ${nameOnly}` : nameOnly;
      if (Number.isFinite(id)) this.employeeLabelById.set(id, label);
      if (code) this.employeeLabelByCode.set(code, label);
    });
  }

  private normalizeToArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    if (Array.isArray(raw?.data?.items)) return raw.data.items;
    return [];
  }

  private evaluateAccess(): void {
    const currentUser = getCurrentUserCode();
    const approver = String(this.feeSheet?.approvedByCode ?? '').trim().toLowerCase();
    const status = String(this.feeSheet?.status ?? '').trim().toLowerCase();
    this.canAct = !!currentUser && approver === currentUser.trim().toLowerCase() && status === 'submitted';

    if (!this.canAct) {
      this.permissionMessage =
        status !== 'submitted'
          ? 'This fee sheet is not waiting for CH approval.'
          : 'Only the selected Approved by CH user can approve or reject this fee sheet.';
    } else {
      this.permissionMessage = '';
    }
  }

  private revisionDisplayLabel(revisionNo: number): string {
    if (!Number.isFinite(revisionNo) || revisionNo <= 0) {
      return 'Original';
    }

    let value = Math.floor(revisionNo);
    let label = '';
    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }

    return `Rev ${label}`;
  }

  get previousFeeSheet(): ProjectFeeSheetApprovalRevision | null {
    return this.selectedRevisionIndex > 0
      ? this.feeSheetRevisions[this.selectedRevisionIndex - 1] ?? null
      : null;
  }

  getRevisionTabLabel(revision: ProjectFeeSheetApprovalRevision, index: number): string {
    if (this.feeSheetRevisions.length === 1) {
      return `${revision.revisionLabel} (Latest)`;
    }

    return index === this.feeSheetRevisions.length - 1
      ? `${revision.revisionLabel} (Latest)`
      : `${revision.revisionLabel} (Previous)`;
  }

  onRevisionTabChange(index: number): void {
    this.selectedRevisionIndex = index;
    this.feeSheet = this.feeSheetRevisions[index] ?? null;
    this.feeAgreementRevisionColumns = this.buildFeeAgreementRevisionColumns();
    this.evaluateAccess();
  }

  toggleDecisionDropdown(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.canAct || this.isSubmitting) {
      return;
    }

    this.decisionDropdownOpen = !this.decisionDropdownOpen;
  }

  setDecision(value: string, event?: MouseEvent): void {
    event?.stopPropagation();
    this.decision = value === 'approve' || value === 'reject' ? value : null;
    this.decisionDropdownOpen = false;
  }

  getDecisionLabel(): string {
    if (this.decision === 'approve') {
      return 'Approve';
    }

    if (this.decision === 'reject') {
      return 'Reject';
    }

    return '';
  }

  getFieldClass(field: keyof ProjectFeeSheetApprovalRevision): string {
    if (!this.feeSheet || !this.previousFeeSheet) {
      return '';
    }

    return valuesDifferent(this.feeSheet[field], this.previousFeeSheet[field])
      ? 'changed-field'
      : '';
  }

  private buildFeeAgreementRevisionColumns(): FeeAgreementRevisionColumn[] {
    const revisions = this.feeSheetRevisions.length
      ? this.feeSheetRevisions
      : (this.feeSheet ? [this.feeSheet] : []);
    const lastVisibleIndex = Math.min(
      Math.max(this.selectedRevisionIndex, 0),
      Math.max(revisions.length - 1, 0)
    );

    return revisions.slice(0, lastVisibleIndex + 1).map((revision) => {
      const agreement = revision.feeAgreements?.[0] ?? {
        revisionNo: 0,
        revisionLabel: revision.revisionLabel,
        revisionName: revision.revisionLabel,
        grossFee: 0,
        subconsultantsName: '-',
        subconsultantsAmount: 0,
        subconsultantsItems: [],
        otherExpensesName: '-',
        otherExpenses: 0,
        otherExpensesItems: [],
        nettFee: 0,
        agreementReceived: '-',
      };

      return {
        ...agreement,
        pageRevisionNo: revision.revisionNo,
        pageRevisionLabel: revision.revisionLabel,
      };
    });
  }

  getFeeAgreementChainClass(
    index: number,
    field: keyof FeeAgreementRevisionView
  ): string {
    const columns = this.feeAgreementRevisionColumns;
    const latestVisibleIndex = columns.length - 1;

    if (index <= 0 || index !== latestVisibleIndex) {
      return '';
    }

    const current = columns[index];
    const previous = columns[index - 1];
    if (!current || !previous) {
      return '';
    }

    const changed = field === 'subconsultantsItems' || field === 'otherExpensesItems'
      ? this.feeAgreementItemsDifferent(
        current[field] as FeeAgreementLineItemView[],
        previous[field] as FeeAgreementLineItemView[]
      )
      : valuesDifferent(current[field], previous[field]);

    return changed ? 'changed-field' : '';
  }

  private feeAgreementItemsDifferent(
    current: FeeAgreementLineItemView[] | null | undefined,
    previous: FeeAgreementLineItemView[] | null | undefined
  ): boolean {
    return this.feeAgreementItemsComparable(current) !== this.feeAgreementItemsComparable(previous);
  }

  private feeAgreementItemsComparable(items: FeeAgreementLineItemView[] | null | undefined): string {
    return (items ?? [])
      .map((item) => ({
        name: String(item?.name ?? '').trim(),
        amount: Number(item?.amount ?? 0),
      }))
      .filter((item) => item.name || item.amount !== 0)
      .sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name);
        return nameCompare !== 0 ? nameCompare : a.amount - b.amount;
      })
      .map((item) => `${item.name}|${item.amount}`)
      .join('||');
  }

  getJobCostingRowsForView(): Array<any & { _changeState: RevisionDiffState }> {
    const currentRows = this.feeSheet?.jobCostingAllocation ?? [];
    const previousRows = this.previousFeeSheet?.jobCostingAllocation ?? [];

    if (!this.previousFeeSheet) {
      return currentRows.map((row) => ({ ...row, _changeState: 'unchanged' as RevisionDiffState }));
    }

    const current = currentRows.map((row) => ({
      ...row,
      _changeState: getRowDiffState(
        row,
        previousRows,
        ['phase'],
        ['percentage', 'startDate', 'endDate']
      ),
    }));
    const removed = getRemovedRows(currentRows, previousRows, ['phase']).map((row) => ({
      ...row,
      _changeState: 'removed' as RevisionDiffState,
    }));

    return [...current, ...removed];
  }

  getBillingForecastRowsForView(): Array<any & { _changeState: RevisionDiffState }> {
    const currentRows = this.feeSheet?.billingForecast ?? [];
    const previousRows = this.previousFeeSheet?.billingForecast ?? [];

    if (!this.previousFeeSheet) {
      return currentRows.map((row) => ({ ...row, _changeState: 'unchanged' as RevisionDiffState }));
    }

    const current = currentRows.map((row) => ({
      ...row,
      _changeState: getRowDiffState(row, previousRows, ['month'], ['amount']),
    }));
    const removed = getRemovedRows(currentRows, previousRows, ['month']).map((row) => ({
      ...row,
      _changeState: 'removed' as RevisionDiffState,
    }));

    return [...current, ...removed];
  }

  getRowStateClass(state: RevisionDiffState | undefined): string {
    switch (state) {
      case 'added':
        return 'changed-row changed-row--added';
      case 'changed':
        return 'changed-row';
      case 'removed':
        return 'changed-row changed-row--removed';
      default:
        return '';
    }
  }

  submitDecision(): void {
    if (!this.feeSheet || !this.decision || !this.canAct) {
      return;
    }

    const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm action',
      message: 'Are you sure you want to submit this action?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Confirm', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed' || !this.feeSheet || !this.decision) {
        return;
      }

      this.isSubmitting = true;
      const emailStatus = this.decision === 'approve' ? 'approved' : 'rejected';
      this.feeSheetService.updateApproval(this.feeSheet.id, this.decision).subscribe({
        next: (response) => {
          this.sendActionEmail(emailStatus, response);
          this.toastr.success('Fee sheet approval updated.');
          this.router.navigate([this.listPath], { queryParams: { tab: 'action' } });
        },
        error: (error) => {
          console.error(error);
          this.isSubmitting = false;
          this.toastr.error(error?.error?.message ?? 'Update approval failed.');
        },
      });
    });
  }

  private sendActionEmail(status: string, response: any): void {
    if (!this.feeSheet) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        this.getEmailConfig(),
        {
          ...this.rawResponse,
          ...this.rawRevision,
          ...this.workflowEmailNotificationService.createNotificationSource({}, response),
          id: this.feeSheet.id,
          status,
          approved_by_ch_status: status,
          form_filled_by_id: this.rawRevision?.form_filled_by_id,
          approved_by_ch_id: this.rawRevision?.approved_by_ch_id,
        },
        'approved_by_ch_status',
        status,
        this.feeSheet.id
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send fee sheet status email:', error);
          this.toastr.warning('Status updated, but email notification could not be sent.');
        },
      });
  }

  private getEmailConfig(): WorkflowEmailConfig {
    if (this.feeSheetType === 'facade') {
      return PROJECT_FACADE_FEE_SHEET_EMAIL_CONFIG;
    }

    if (this.feeSheetType === 'transportation') {
      return PROJECT_TRANSPORTATION_FEE_SHEET_EMAIL_CONFIG;
    }

    return PROJECT_FEE_SHEET_EMAIL_CONFIG;
  }

  private getEmployeeLabel(ref: any): string {
    if (ref === null || ref === undefined) return '-';
    const text = String(ref).trim();
    if (!text) return '-';

    const id = Number(text);
    if (Number.isFinite(id) && id > 0) {
      return this.employeeLabelById.get(id) ?? `ID: ${id}`;
    }

    return this.employeeLabelByCode.get(text) ?? text;
  }

  private getProjectTypeLabel(projectType: any, id?: any): string {
    const code = String(projectType?.code ?? '').trim();
    const name = String(projectType?.name ?? '').trim();
    if (code && name) return `${code} - ${name}`;
    if (name) return name;

    const lookupId = id ?? projectType?.id;
    if (!lookupId) return '-';

    const match = this.projectTypes.find((item) => String(item.id) === String(lookupId));
    if (match) {
      const matchCode = String(match.code ?? '').trim();
      return matchCode ? `${matchCode} - ${match.name}` : match.name;
    }

    return String(lookupId);
  }

  private getDisciplineLabel(id: any): string {
    if (!id) return '-';
    const match = this.DISCIPLINE_OPTIONS.find((item) => String(item.id) === String(id));
    return match ? match.name : String(id);
  }

  backToList(): void {
    this.router.navigate([this.listPath]);
  }

  viewDocument(): void {
    if (!this.feeSheet) {
      return;
    }
    this.router.navigate([this.viewPath, this.feeSheet.id]);
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft': return 'Draft';
      case 'submitted': return 'Submitted';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'submitted': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'approved': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'rejected': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  formatDate(value: string): string {
    return formatDateDisplay(value);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(value ?? 0));
  }
}
