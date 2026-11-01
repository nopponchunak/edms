import { Component, OnInit } from '@angular/core';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, ActivatedRoute } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import {
  canCreateFeeSheetRevision,
  canEditCurrentFeeSheet,
  FeeSheetService,
  resolveFeeSheetStatus,
} from 'app/core/services/fee-sheet.service';
import { ProjectTypeService, ProjectType } from 'app/core/services/project-type.service';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { resolveEmployeeDisplayInitial } from 'app/core/utils/employee-display.util';
import {
  getRemovedRows,
  getRowDiffState,
  hasPreviousRevision,
  RevisionDiffState,
  valuesDifferent,
} from './project-fee-sheet-revision-diff.util';

// ✅ แก้ path ให้ตรงของพี่
import { EmployeeService } from 'app/core/services/employee.service';

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

export interface ProjectFeeSheet {
  id: string;
  revisionNo: number;
  revisionLabel: string;
  isLatest: boolean;

  copiesTo: string;
  circ: string;
  chFile: string;
  fee: string;

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

  grossFee: number;
  subconsultantsName: string;
  subconsultantsAmount: number;
  subconsultantsItems: FeeAgreementLineItemView[];
  otherExpensesName: string;
  otherExpenses: number;
  otherExpensesItems: FeeAgreementLineItemView[];
  nettFee: number;
  agreementReceived: string;
  feeAgreementReceived: boolean;
  feeAgreementAmount: number;
  feeAgreements: FeeAgreementRevisionView[];

  jobCostingAllocation: Array<{ phase: string; percentage: number; startDate: string; endDate: string }>;
  billingForecast: Array<{ month: string; amount: number }>;
  billingForecastRevisions: Array<{ revisionNo: number; revisionLabel: string; items: Array<{ month: string; amount: number }> }>;

  projectType: string;

  filledInBy: string;
  filledInDate: string;
  approvedBy: string;
  approvedDate: string;

  status: string;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-project-fee-sheet-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
    MatTabsModule,
    FuseAlertComponent,
    ViewActionsComponent
  ],
  templateUrl: './project-fee-sheet-view.component.html',
  styleUrls: ['./project-fee-sheet-view.component.scss']
})
export class ProjectFeeSheetViewComponent implements OnInit {
  feeSheet: ProjectFeeSheet | null = null;
  feeSheetRevisions: ProjectFeeSheet[] = [];
  feeAgreementRevisionColumns: FeeAgreementRevisionColumn[] = [];
  selectedRevisionIndex = 0;
  currentWorkflowStatus = '';
  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  // ✅ map ไว้ lookup id -> label
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
    private router: Router,
    private route: ActivatedRoute,
    private feeApi: FeeSheetService,
    private employeeService: EmployeeService,
    private projectTypeService: ProjectTypeService
  ) {}

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

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      if (params['id']) this.loadFeeSheetAndEmployees(params['id']);
    });
  }

  private normalizeToArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    if (Array.isArray(raw?.data?.items)) return raw.data.items;
    return [];
  }

  private loadFeeSheetAndEmployees(id: string): void {
    this.isLoading = true;
    this.alert = null;

    forkJoin({
      fee: this.feeApi.getById(id),
      // ✅ โหลด employees ครั้งเดียว (200 ปรับได้)
      employees: this.employeeService.getEmployees('', 200).pipe(
        catchError(() => of([]))
      ),
      projectTypes: this.projectTypeService.getAll().pipe(
        catchError(() => of([]))
      )
    }).subscribe({
      next: ({ fee, employees, projectTypes }: any) => {
        this.projectTypes = this.normalizeToArray(projectTypes);

        // 1) สร้าง map id -> label
        this.employeeLabelById.clear();
        this.employeeLabelByCode.clear();
        this.normalizeToArray(employees).forEach((e: any) => {
          const idNum = Number(e?.id);
          const code = String(e?.employee_code ?? e?.code ?? '').trim();
          const rawName = `${e?.firstname ?? ''} ${e?.lastname ?? ''}`.trim()
            || e?.name
            || (Number.isFinite(idNum) ? `Employee ${idNum}` : code || 'Employee');
          
          const nameOnly = rawName.replace(/\s*\([^)]*\)$/, '').trim() || '-';
          const initial = resolveEmployeeDisplayInitial(e);

          const label = initial ? `${initial} , ${nameOnly}` : nameOnly;

          if (Number.isFinite(idNum)) this.employeeLabelById.set(idNum, label);
          if (code) this.employeeLabelByCode.set(code, label);
        });

        const revisionRows = Array.isArray(fee?.revisions) && fee.revisions.length
          ? fee.revisions
          : [fee?.revision ?? fee?.currentRevision].filter(Boolean);
        const proj = fee?.project ?? null;

        this.feeSheetRevisions = revisionRows
          .map((rev: any) => this.mapRevisionToFeeSheet(fee, rev, proj, id))
          .sort((a: ProjectFeeSheet, b: ProjectFeeSheet) => a.revisionNo - b.revisionNo);
        this.currentWorkflowStatus = resolveFeeSheetStatus(
          fee?.currentRevision?.status,
          fee?.currentRevision?.approved_by_ch_status,
          fee?.revision?.status,
          fee?.revision?.approved_by_ch_status,
          fee?.status
        );

        const currentRevisionNo = Number(
          fee?.currentRevision?.rev_no ??
            fee?.currentRevision?.revision_no ??
            fee?.revision?.rev_no ??
            fee?.revision?.revision_no
        );
        const latestIndex = this.feeSheetRevisions.findIndex((row) =>
          Number.isFinite(currentRevisionNo)
            ? row.revisionNo === currentRevisionNo
            : row.isLatest
        );

        this.selectedRevisionIndex = latestIndex >= 0
          ? latestIndex
          : Math.max(this.feeSheetRevisions.length - 1, 0);
        this.feeSheet = this.feeSheetRevisions[this.selectedRevisionIndex] ?? null;
        this.feeAgreementRevisionColumns = this.buildFeeAgreementRevisionColumns();

        this.isLoading = false;
      },
      error: (err: any) => {
        console.error(err);
        this.isLoading = false;
        this.alert = { type: 'error', message: err?.error?.message ?? 'Load fee sheet failed' };
      }
    });
  }

  private mapRevisionToFeeSheet(fee: any, rev: any, proj: any, id: string): ProjectFeeSheet {
    const revisionNo = Number(rev?.rev_no ?? rev?.revision_no ?? 0);
    const feeAgreementsRaw = Array.isArray(rev?.fee_agreements) ? rev.fee_agreements : [];
    const feeAgreements: FeeAgreementRevisionView[] = feeAgreementsRaw.map((x: any) => {
      const subconsultantsItems = this.normalizeFeeAgreementItems(
        x,
        'less_subconsultants_items',
        'less_subconsultants_name',
        'less_subconsultants_number'
      );
      const otherExpensesItems = this.normalizeFeeAgreementItems(
        x,
        'less_other_expenses_items',
        'less_other_expenses_name',
        'less_other_expenses'
      );

      return {
        revisionNo: Number(x?.revision_no ?? 0),
        revisionLabel: this.revisionDisplayLabel(Number(x?.revision_no ?? 0)),
        revisionName: this.revisionDisplayLabel(Number(x?.revision_no ?? 0)),
        grossFee: Number(x?.gross_fee_excl_vat ?? 0),
        subconsultantsName: String(x?.less_subconsultants_name ?? '-'),
        subconsultantsAmount: this.feeAgreementItemTotal(
          subconsultantsItems,
          x,
          'less_subconsultants_items',
          'less_subconsultants_number'
        ),
        subconsultantsItems,
        otherExpensesName: String(x?.less_other_expenses_name ?? '-'),
        otherExpenses: this.feeAgreementItemTotal(
          otherExpensesItems,
          x,
          'less_other_expenses_items',
          'less_other_expenses'
        ),
        otherExpensesItems,
        nettFee: Number(x?.net_fee_excl_vat ?? 0),
        agreementReceived: String(x?.agreement_received ?? ''),
      };
    });
    const fee0 = feeAgreements[0] ?? null;

    const teamMembers = Array.isArray(rev?.team_members) ? rev.team_members : [];
    const teamText = teamMembers.length
      ? teamMembers.map((x: any) => this.getEmployeeLabel(x.employee_code)).filter(Boolean).join(', ')
      : (rev?.team ?? '-');

    const jobCostingRows = ((Array.isArray(rev?.job_costings) ? rev.job_costings : null)
      ?? (Array.isArray(rev?.job_costing) ? rev.job_costing : [])).map((j: any) => ({
      phase: j.phase,
      percentage: Number(j.percent ?? j.percentage ?? 0),
      startDate: j.start_date,
      endDate: j.end_date
    }));

    const billingForecastRows = ((Array.isArray(rev?.billing_forecasts) ? rev.billing_forecasts : null)
      ?? (Array.isArray(rev?.billing_forecast) ? rev.billing_forecast : [])).map((b: any) => ({
      month: b.month,
      amount: Number(b.amount ?? 0)
    }));

    return {
      id: String(fee?.id ?? id),
      revisionNo,
      revisionLabel: this.revisionDisplayLabel(revisionNo),
      isLatest: Boolean(rev?.is_latest),

      copiesTo: proj?.copies_to ?? '-',
      circ: proj?.circ_adm ?? '-',
      chFile: proj?.ch_file ?? '-',
      fee: proj?.fee ?? '-',

      projectPNo: proj?.project_no ?? '-',
      projectNo: rev?.mt_project_no ?? fee?.mtProjectNo ?? '-',
      date: rev?.form_filled_by_date ?? rev?.created_at ?? '',

      team: teamText,
      directorInCharge: this.getEmployeeLabel(rev?.director_in_charge_id),
      discipline: rev?.discipline?.name || this.getDisciplineLabel(rev?.discipline_id),

      projectName: rev?.project_name ?? proj?.project_name ?? '-',
      location: rev?.location ?? proj?.city ?? '-',
      client: rev?.client_name ?? proj?.client_name ?? '-',
      contactName: rev?.contact_name ?? proj?.client_contact_name ?? '-',
      mtlScope: rev?.mtl_scope_detail ?? '-',
      comments: rev?.comment ?? '-',

      feeAgreementReceived: feeAgreements.length > 0,
      feeAgreementAmount: Number(fee0?.grossFee ?? 0),
      grossFee: Number(fee0?.grossFee ?? 0),
      subconsultantsName: String(fee0?.subconsultantsName ?? '-'),
      subconsultantsAmount: Number(fee0?.subconsultantsAmount ?? 0),
      subconsultantsItems: fee0?.subconsultantsItems ?? [],
      otherExpensesName: String(fee0?.otherExpensesName ?? '-'),
      otherExpenses: Number(fee0?.otherExpenses ?? 0),
      otherExpensesItems: fee0?.otherExpensesItems ?? [],
      nettFee: Number(fee0?.nettFee ?? 0),
      agreementReceived: String(fee0?.agreementReceived ?? '-'),
      feeAgreements,

      jobCostingAllocation: jobCostingRows,
      billingForecast: billingForecastRows,
      billingForecastRevisions: [{
        revisionNo: 0,
        revisionLabel: 'Current Snapshot',
        items: billingForecastRows,
      }],

      projectType: this.getProjectTypeLabel(rev?.project_type, rev?.project_type_id),
      filledInBy: this.getEmployeeLabel(rev?.form_filled_by_id),
      filledInDate: rev?.form_filled_by_date ?? '',
      approvedBy: this.getEmployeeLabel(rev?.approved_by_ch_id),
      approvedDate: rev?.approved_by_ch_date ?? '',

      status: resolveFeeSheetStatus(rev?.status, rev?.approved_by_ch_status),
      createdAt: rev?.created_at ?? '',
      updatedAt: rev?.updated_at ?? ''
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

    const match = this.projectTypes.find(t => String(t.id) === String(lookupId));
    if (match) {
      const matchCode = String(match.code ?? '').trim();
      return matchCode ? `${matchCode} - ${match.name}` : match.name;
    }

    return String(lookupId);
  }

  private getDisciplineLabel(id: any): string {
    if (!id) return '-';
    const match = this.DISCIPLINE_OPTIONS.find(d => String(d.id) === String(id));
    return match ? match.name : String(id);
  }

  getFeeAgreementByRevision(revisionNo: number): FeeAgreementRevisionView {
    return this.feeSheet?.feeAgreements?.find((x) => x.revisionNo === revisionNo) ?? {
      revisionNo,
      revisionLabel: this.revisionDisplayLabel(revisionNo),
      revisionName: this.revisionDisplayLabel(revisionNo),
      grossFee: 0,
      subconsultantsName: '-',
      subconsultantsAmount: 0,
      subconsultantsItems: [],
      otherExpensesName: '-',
      otherExpenses: 0,
      otherExpensesItems: [],
      nettFee: 0,
      agreementReceived: '-'
    };
  }

  get previousFeeSheet(): ProjectFeeSheet | null {
    return hasPreviousRevision(this.selectedRevisionIndex)
      ? this.feeSheetRevisions[this.selectedRevisionIndex - 1] ?? null
      : null;
  }

  onRevisionTabChange(index: number): void {
    this.selectedRevisionIndex = index;
    this.feeSheet = this.feeSheetRevisions[index] ?? null;
    this.feeAgreementRevisionColumns = this.buildFeeAgreementRevisionColumns();
  }

  getSelectedRevisionLabel(): string {
    return this.feeSheet?.revisionLabel ?? 'Original';
  }

  getFieldClass(field: keyof ProjectFeeSheet): string {
    if (!this.feeSheet || !this.previousFeeSheet) {
      return '';
    }

    return valuesDifferent(this.feeSheet[field], this.previousFeeSheet[field])
      ? 'changed-field'
      : '';
  }

  getCurrentFeeAgreement(): FeeAgreementRevisionView {
    return this.feeSheet?.feeAgreements?.[0] ?? this.getFeeAgreementByRevision(0);
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

    return changed
      ? 'changed-field'
      : '';
  }

  getFeeAgreementClass(field: keyof FeeAgreementRevisionView): string {
    const previousAgreement = this.previousFeeSheet?.feeAgreements?.[0] ?? null;
    if (!previousAgreement) {
      return '';
    }

    const currentAgreement = this.getCurrentFeeAgreement();
    const changed = field === 'subconsultantsItems' || field === 'otherExpensesItems'
      ? this.feeAgreementItemsDifferent(
          currentAgreement[field] as FeeAgreementLineItemView[],
          previousAgreement[field] as FeeAgreementLineItemView[]
        )
      : valuesDifferent(currentAgreement[field], previousAgreement[field]);

    return changed
      ? 'changed-field'
      : '';
  }

  feeAgreementItemsDifferent(
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

  onBack(): void {
    this.router.navigate(['/project-fee-sheet']);
  }

  onEdit(): void {
    if (!this.canEditCurrent()) {
      this.alert = { type: 'warning', message: 'This fee sheet cannot be edited directly.' };
      return;
    }

    if (this.feeSheet) this.router.navigate(['/project-fee-sheet/edit', this.feeSheet.id]);
  }

  onAddRevision(): void {
    if (!this.canCreateRevision()) {
      this.alert = { type: 'warning', message: 'A new revision can only be created after approval.' };
      return;
    }

    if (this.feeSheet) {
      this.router.navigate(['/project-fee-sheet/edit', this.feeSheet.id], {
        queryParams: { mode: 'revision' }
      });
    }
  }

  canEditCurrent(): boolean {
    return canEditCurrentFeeSheet(this.currentWorkflowStatus);
  }

  canCreateRevision(): boolean {
    return canCreateFeeSheetRevision(this.currentWorkflowStatus);
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

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft': return 'Draft';
      case 'submitted': return 'Submitted';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  }

  formatDate(dateString: string): string {
    return formatDateDisplay(dateString);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Number(amount ?? 0));
  }
}
