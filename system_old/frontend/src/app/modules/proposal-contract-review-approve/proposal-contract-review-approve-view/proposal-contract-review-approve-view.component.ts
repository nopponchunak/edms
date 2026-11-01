import { Component, OnDestroy, OnInit } from '@angular/core';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { Router, ActivatedRoute } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';

import { ProposalContractReviewService } from 'app/core/services/proposal-contract-review.service';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, finalize, map, switchMap, takeUntil } from 'rxjs/operators';
import { EmployeeService } from 'app/core/services/employee.service';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { FuseConfirmationService } from '@fuse/services/confirmation';

export interface ProposalContractReview {
  id: string;
  projectName: string;
  projectNo: string;
  proposalNumber: string;
  projectType: string;
  location: string;

  clientName: string;
  clientContact: string;
  clientAddress: string;
  clientTel: string;
  clientFax: string;

  architectName: string;
  architectContact: string;
  architectAddress: string;
  architectTel: string;
  architectFax: string;

  projectDetails: string[];
  disciplines: string[];

  estimatedValue: number;
  currency: string;

  scopeClearlyDefined: boolean;
  scopeDetails: string;
  adequateResources: boolean;
  resourcesDetails: string;
  helpFromOtherOffices: boolean;
  helpDetails: string;
  subConsultantsRequired: boolean;
  subConsultantsDetails: string;

  specialQARequirements: string;
  specialConsiderations: string;
  comments: string;

  governmentProject: boolean;
  mmclProject: boolean;
  mtl: boolean;

  filledInBy: string;
  filledInDate: string;

  proposalToBeSubmitted: boolean;
  proposalDecline: boolean;
  winProbability: number;
  proposalReviewers: Array<{ name: string; date: string }>;

  contractAgreedToProceed: boolean;
  contractDecline: boolean;
  leadTL: string;
  tl: string;
  needPQP: boolean;
  contractReviewers: Array<{ name: string; date: string }>;

  // ✅ status นี้ใช้ “แสดงผลใน UI” (คำนวณจากฟิลด์จริง)
  status: string;

  createdAt: string;
  updatedAt: string;

  submittedAt?: string;
  proposalReviewedAt?: string;
  contractReviewedAt?: string;
  currentStage?: 'proposal' | 'contract' | null;
  currentApprovalRole?: string | null;
}

@Component({
  selector: 'app-proposal-contract-review-approve-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatRadioModule,
    FuseAlertComponent,
  ],
  templateUrl: './proposal-contract-review-approve-view.component.html',
  styleUrls: ['./proposal-contract-review-approve-view.component.scss'],
})
export class ProposalContractReviewApproveViewComponent implements OnInit, OnDestroy {
  review: ProposalContractReview | null = null;

  // ✅ เก็บข้อมูลดิบจาก getById เพื่อเอาไป update ให้ครบ field
  private reviewRaw: any = null;

  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();

  // Approval form (UI)
  approvalComments = '';
  approvalDecision: 'approve' | 'decline' | null = null;
  winProbability: number | null = null;
  needPQP: boolean | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private proposalContractReviewService: ProposalContractReviewService,
    private employeeService: EmployeeService,
    private fuseConfirmationService: FuseConfirmationService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((pm) => {
      const id = pm.get('id');
      if (id) this.loadReview(id);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadReview(id: string): void {
    this.isLoading = true;
    this.alert = null;
    this.review = null;
    this.reviewRaw = null;

    forkJoin({
      response: this.proposalContractReviewService
        .getById(id)
        .pipe(
          catchError((err) => {
            console.error('[REVIEW] getById error', err);
            this.showAlert('error', err?.error?.message || 'Failed to load review');
            return of(null);
          })
        ),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    })
      .pipe(
        switchMap(({ response, employeeLookup, employeeLookupWithTitle }) => {
          const data = response?.data || response;
          if (!data) return forkJoin({ response: of(response), employeeLookup: of(employeeLookup), employeeLookupWithTitle: of(employeeLookupWithTitle) });

          const codes = [
            data.filled_in_by,
            data.lead_tl,
            data.tl_name,
            data.proposal_reviewer1,
            data.proposal_reviewer2,
            data.proposal_reviewer3,
            data.contract_reviewer1,
            data.contract_reviewer2,
            data.contract_reviewer3,
            ...(Array.isArray(data.approvals) ? data.approvals.map((approval: any) => approval.approver_code) : []),
            data.created_by,
            data.updated_by
          ].filter(code => !!code);

          return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
            switchMap(updatedLookup => {
              return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
                map(updatedLookupWithTitle => ({ response, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
              );
            })
          );
        }),
        finalize(() => (this.isLoading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe(({ response: res, employeeLookup, employeeLookupWithTitle }: { response: any; employeeLookup: Map<string, string>; employeeLookupWithTitle: Map<string, string> }) => {
        this.employeeLookup = employeeLookup;
        this.employeeLookupWithTitle = employeeLookupWithTitle;
        const d = res?.data ?? res;
        if (!d) return;

        this.reviewRaw = d;
        this.review = this.mapApiToViewModel(d, id);
      });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup, '-');
  }

  private deriveStatus(
    d: any
  ): 'approved' | 'declined' | 'contract_approved' | 'pending_contract_review' | 'pending_proposal_review' | 'contract_reviewed' | 'proposal_reviewed' | 'submitted' | 'draft' {
    const explicitStatus = String(d.status ?? '').trim().toLowerCase();
    if ([
      'approved',
      'declined',
      'contract_approved',
      'pending_contract_review',
      'pending_proposal_review',
      'contract_reviewed',
      'proposal_reviewed',
      'submitted',
      'draft',
    ].includes(explicitStatus)) {
      return explicitStatus as any;
    }

    const toNum = (v: any) => Number(v ?? 0);

    if (toNum(d.contract_decline) === 1) return 'declined';
    if (toNum(d.contract_agreed_to_proceed) === 1) return 'approved';

    const hasContractReviewer = !!d.contract_reviewer1 || !!d.contract_reviewer2 || !!d.contract_reviewer3;
    const hasProposalReviewer = !!d.proposal_reviewer1 || !!d.proposal_reviewer2 || !!d.proposal_reviewer3;

    if (hasContractReviewer) return 'contract_reviewed';
    if (hasProposalReviewer) return 'proposal_reviewed';

    if (d.filled_in_date) return 'submitted';
    return 'draft';
  }

  private mapApiToViewModel(d: any, fallbackId: string): ProposalContractReview {
    const location = [d.city, d.country].filter(Boolean).join(', ');

    const num = (v: any) => {
      const n = typeof v === 'string' ? Number(v) : Number(v ?? 0);
      return isNaN(n) ? 0 : n;
    };

    const b01 = (v: any) => {
      const normalized = String(v ?? '').toLowerCase();
      return v === true || v === 1 || normalized === '1' || normalized === 'yes' || normalized === 'true';
    };

    const proposalReviewers = this.reviewersFromApi(d, 'proposal', [
      { name: d.proposal_reviewer1, date: d.proposal_reviewer1_date },
      { name: d.proposal_reviewer2, date: d.proposal_reviewer2_date },
      { name: d.proposal_reviewer3, date: d.proposal_reviewer3_date },
    ]);

    const contractReviewers = this.reviewersFromApi(d, 'contract', [
      { name: d.contract_reviewer1, date: d.contract_reviewer1_date },
      { name: d.contract_reviewer2, date: d.contract_reviewer2_date },
      { name: d.contract_reviewer3, date: d.contract_reviewer3_date },
    ]);
    const currentStage = this.currentStageFromApi(d);
    const currentApproval = this.currentApprovalFromApi(d, currentStage);

    return {
      id: String(d.id ?? fallbackId),

      projectName: d.project_name ?? '-',
      projectNo: d.project_no ?? '-',
      proposalNumber: d.proposal_number ?? d.proposalNumber ?? '-',
      projectType: d.project_type ?? '-',
      location: location || '-',

      clientName: d.client_name ?? '-',
      clientContact: d.client_contact_name ?? '',
      clientAddress: d.client_address ?? '',
      clientTel: d.client_tel_no ?? '',
      clientFax: d.client_fax_no ?? '',

      architectName: d.architect_name ?? '',
      architectContact: d.architect_contact_name ?? '',
      architectAddress: d.architect_address ?? '',
      architectTel: d.architect_tel_no ?? '',
      architectFax: d.architect_fax_no ?? '',

      projectDetails: [],
      disciplines: [],

      estimatedValue: num(d.estimated_total_fees),
      currency: d.currency ?? 'THB',

      scopeClearlyDefined: b01(d.scope_clearly_defined),
      scopeDetails: d.scope_details ?? '',
      adequateResources: b01(d.staff_resources_available),
      resourcesDetails: d.resources_details ?? '',
      helpFromOtherOffices: b01(d.help_from_other_offices),
      helpDetails: d.help_details ?? '',
      subConsultantsRequired: b01(d.sub_consultants_required),
      subConsultantsDetails: d.sub_consultants_details ?? '',

      specialQARequirements: d.qa_requirements ?? '',
      specialConsiderations: d.special_considerations ?? '',
      comments: d.quality_comments ?? '',

      governmentProject: b01(d.is_government_project),
      mmclProject: b01(d.is_mmcl_project),
      mtl: b01(d.is_mtl_project),

      filledInBy: d.filled_in_by ?? '-',
      filledInDate: d.filled_in_date ?? '',

      proposalToBeSubmitted: b01(d.proposal_to_be_submitted),
      proposalDecline: b01(d.proposal_decline),
      winProbability: num(d.win_probability),
      proposalReviewers,

      contractAgreedToProceed: b01(d.contract_agreed_to_proceed),
      contractDecline: b01(d.contract_decline),
      leadTL: d.lead_tl ?? '',
      tl: d.tl_name ?? '',
      needPQP: b01(d.need_quality_plan_pqp),
      contractReviewers,

      // ✅ ใช้ deriveStatus
      status: this.deriveStatus(d),

      createdAt: d.created_at ?? '',
      updatedAt: d.updated_at ?? '',

      submittedAt: d.submitted_at ?? undefined,
      proposalReviewedAt: d.proposal_reviewed_at ?? undefined,
      contractReviewedAt: d.contract_reviewed_at ?? undefined,
      currentStage,
      currentApprovalRole: currentApproval?.role ?? null,
    };
  }

  onApprove(): void {
    if (!this.approvalDecision) {
      this.showAlert('error', 'Please select an approval decision');
      return;
    }

    const id = this.review?.id;
    if (!id) {
      this.showAlert('error', 'Missing review id');
      return;
    }

    if (!this.reviewRaw) {
      this.showAlert('error', 'Missing review data (raw). Please reload page.');
      return;
    }

    const isApprove = this.approvalDecision === 'approve';
    const currentStage = this.currentStageFromApi(this.reviewRaw);
    const currentUserCode = getCurrentUserCode();
    const currentApproval = this.currentApprovalFromApi(this.reviewRaw, currentStage);

    if (!currentStage) {
      this.showAlert('error', 'This review is not waiting for approval.');
      return;
    }

    if (!currentUserCode) {
      this.showAlert('error', 'Missing current user code.');
      return;
    }

    if (currentStage === 'proposal' && isApprove && !this.reviewRaw?.win_probability && this.winProbability === null) {
      this.showAlert('error', 'Please enter % Win probability.');
      return;
    }

    if (currentStage === 'contract' && currentApproval?.role === 'MD_DI' && isApprove && this.needPQP === null) {
      this.showAlert('error', 'Please select Need to proceed a Project Quality Plan.');
      return;
    }

    if (currentStage === 'contract' && currentApproval?.role !== 'MD_DI' && !isApprove) {
      this.showAlert('error', 'Only MD/DI can decline contract review.');
      return;
    }

        const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm review',
      message: 'Are you sure you want to submit this review decision?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Confirm', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;

      this.isLoading = true;

    const request$ = currentStage === 'proposal'
      ? this.proposalContractReviewService.submitProposalReview(id, {
          approver_code: currentUserCode,
          proposal_decision: isApprove ? 'submitted' : 'declined',
          win_probability: this.winProbability ?? this.reviewRaw?.win_probability,
          comment: this.approvalComments,
        })
      : this.proposalContractReviewService.submitContractReview(id, {
          approver_code: currentUserCode,
          ...(currentApproval?.role === 'MD_DI'
            ? {
                contract_decision: isApprove ? 'proceed' : 'declined',
                need_quality_plan_pqp: this.needPQP === true ? 'Yes' : 'No',
              }
            : {}),
          comment: this.approvalComments,
        });

    request$
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (res: any) => {
          const data = res?.data ?? res;
          this.reviewRaw = data;
          this.review = this.mapApiToViewModel(data, id);
          this.showAlert('success', 'Review updated successfully!');

          setTimeout(() => {
            this.router.navigate(['/proposal-contract-review/list'], {
              queryParams: { tab: 'action' },
            });
          }, 600);
        },
        error: (err) => {
          console.error('[APPROVE] update error:', err);
          this.showAlert('error', err?.error?.message || 'Update status failed!');
        },
      });

    });
  }

  getNeedPqpRadioValue(): 'yes' | 'no' | null {
    if (this.needPQP === true) {
      return 'yes';
    }

    if (this.needPQP === false) {
      return 'no';
    }

    return null;
  }

  setNeedPQP(value: 'yes' | 'no' | string): void {
    this.needPQP = value === 'yes';
  }

  private currentStageFromApi(d: any): 'proposal' | 'contract' | null {
    const explicit = d?.current_stage;
    if (explicit === 'proposal' || explicit === 'contract') return explicit;
    if (d?.status === 'pending_proposal_review') return 'proposal';
    if (d?.status === 'pending_contract_review') return 'contract';
    return null;
  }

  private currentApprovalFromApi(d: any, stage: 'proposal' | 'contract' | null): any | null {
    const currentUserCode = getCurrentUserCode();
    if (!stage || !currentUserCode || !Array.isArray(d?.approvals)) return null;
    return d.approvals.find((approval: any) =>
      approval.stage === stage &&
      approval.approver_code === currentUserCode &&
      approval.decision === 'pending'
    ) ?? null;
  }

  private reviewersFromApi(d: any, stage: 'proposal' | 'contract', fallback: Array<{ name: string; date: string }>): Array<{ name: string; date: string }> {
    const approvals = Array.isArray(d?.approvals)
      ? d.approvals
          .filter((approval: any) => approval.stage === stage)
          .sort((a: any, b: any) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
          .map((approval: any) => ({
            name: approval.approver_code,
            date: approval.acted_at,
          }))
          .filter((approval: any) => !!approval.name)
      : [];

    return approvals.length ? approvals : fallback.filter((x: any) => !!x.name) as Array<{ name: string; date: string }>;
  }

  onBack(): void {
    this.router.navigate(['/proposal-contract-review/list'], { queryParams: { tab: 'action' } });
  }

  showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => (this.alert = null), 5000);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'proposal_reviewed':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'contract_reviewed':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'declined':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'submitted':
        return 'Submitted';
      case 'proposal_reviewed':
        return 'Proposal Reviewed';
      case 'contract_reviewed':
        return 'Contract Reviewed';
      case 'approved':
        return 'Approved';
      case 'declined':
        return 'Declined';
      default:
        return status;
    }
  }

  formatDate(dateString: string): string {
    return formatDateDisplay(dateString);
  }

  formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);
  }
}
