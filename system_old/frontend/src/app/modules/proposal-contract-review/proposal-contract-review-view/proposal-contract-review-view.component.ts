import { Component, OnInit } from '@angular/core';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, ActivatedRoute } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ViewActionsComponent } from 'app/core/components/view-actions/view-actions.component';

import {
  ProposalContractReviewProject,
  ProposalContractReviewService,
} from 'app/core/services/proposal-contract-review.service';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, map, switchMap, takeUntil } from 'rxjs/operators';
import { EmployeeService } from 'app/core/services/employee.service';
import { ProjectTypeService } from 'app/core/services/project-type.service';
import { Subject } from 'rxjs';
import { OnDestroy } from '@angular/core';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ApiConfig } from 'app/core/config/api.config';

export interface ProposalContractReview {
  id: string;

  projectName: string;
  projectNo: string;
  proposalNumber: string;
  projectType: string;
  location: string;
  locationCity: string;
  locationCountry: string;

  proposalAttached: boolean;
  enquiryFrom: boolean;
  feeCalculationAttached: boolean;

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
  proposalReviewers: Array<{ name: string; date: string; status: string }>;

  contractAgreedToProceed: boolean;
  contractDecline: boolean;
  leadTL: string;
  tl: string;
  needPQP: boolean;
  contractReviewers: Array<{ name: string; date: string; status: string }>;

  attachments: ProposalContractReviewAttachment[];
  enquiryAttachments: ProposalContractReviewAttachment[];
  feeAttachments: ProposalContractReviewAttachment[];
  approvalWorkflow: ProposalContractReviewApprovalWorkflow;

  status: string;
  createdAt: string;
  updatedAt: string;

  submittedAt?: string;
  proposalReviewedAt?: string;
  contractReviewedAt?: string;
  currentStage?: 'proposal' | 'contract' | null;
  currentApprovalRole?: string | null;

  mtProjects: ProposalContractReviewProject[];
}

export interface ProposalContractReviewApprovalWorkflow {
  requestedBy: {
    person: string;
    date: string | null;
  };
  proposalSteps: ProposalContractReviewApprovalStep[];
  contractSteps: ProposalContractReviewApprovalStep[];
}

export interface ProposalContractReviewApprovalStep {
  label: string;
  role: string;
  person: string;
  date: string | null;
  status: string | null;
  comment: string;
}

export interface ProposalContractReviewAttachment {
  name: string;
  path: string;
  type: string;
}

type ApiGetByIdResponse = {
  code: string;
  status: boolean;
  message: string;
  data: any;
};

@Component({
  selector: 'app-proposal-contract-review-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
    MatTooltipModule,
    FuseAlertComponent,
    ViewActionsComponent,
  ],
  templateUrl: './proposal-contract-review-view.component.html',
  styleUrls: ['./proposal-contract-review-view.component.scss'],
})
export class ProposalContractReviewViewComponent implements OnInit, OnDestroy {
  review: ProposalContractReview | null = null;
  private reviewRaw: any = null;
  isLoading = false;
  isApprovalMode = false;
  alert: { type: FuseAlertType; message: string } | null = null;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();
  private projectTypeLookup = new Map<string, string>();
  private _unsubscribeAll: Subject<any> = new Subject<any>();

  approvalComments = '';
  approvalDecision: 'approve' | 'decline' | null = null;
  winProbability: number | null = null;
  needPQP: boolean | null = null;

  private readonly fallbackProjectTypes = [
    { id: 'A', code: 'A', name: 'Commercial-Office' },
    { id: 'B', code: 'B', name: 'Commercial-General' },
    { id: 'C', code: 'C', name: 'Industrial' },
    { id: 'D', code: 'D', name: 'Institutional' },
    { id: 'E', code: 'E', name: 'Leisure/Recreation/Tourism' },
    { id: 'H', code: 'H', name: 'Infrastructure/Utilities' },
    { id: 'I', code: 'I', name: 'Residential' },
    { id: 'K', code: 'K', name: 'Miscellaneous' },
    { id: 'L', code: 'L', name: 'Geotechnical' },
    { id: 'M', code: 'M', name: 'Environmental' },
    { id: 'Q', code: 'Q', name: 'Aviation' },
    { id: 'R', code: 'R', name: 'Accredited Checking & Value Engineering' },
    { id: 'S', code: 'S', name: 'Healthcare' },
    { id: 'T', code: 'T', name: 'Fitout' },
    { id: 'U', code: 'U', name: 'Building Audit' },
    { id: 'V', code: 'V', name: 'PM/CM' },
  ];

  // Options arrays for document-style checkbox display
  allProjectDetailOptions = [
    'Concept & Detail Design',
    'Value Engineering',
    'Engineering Audit',
    'Construction Supervision',
    'Tender Evaluation',
    'Others',
  ];

  allDisciplineOptions = [
    'C&S',
    'M&E',
    'Façade',
    'Lighting',
    'Transportation',
    'Others',
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private proposalContractReviewService: ProposalContractReviewService,
    private employeeService: EmployeeService,
    private projectTypeService: ProjectTypeService,
    private fuseConfirmationService: FuseConfirmationService,
    private apiConfig: ApiConfig
  ) {}

  ngOnInit(): void {
    this.isApprovalMode = this.router.url.includes('/proposal-contract-review/review/');

    this.route.paramMap.pipe(takeUntil(this._unsubscribeAll)).subscribe((params) => {
      const id = params.get('id');
      if (id) this.loadReview(id);
    });
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private loadReview(id: string): void {
    this.isLoading = true;
    this.alert = null;
    this.review = null;
    this.reviewRaw = null;
    this.approvalDecision = null;
    this.approvalComments = '';
    this.winProbability = null;
    this.needPQP = null;

    forkJoin({
      response: this.proposalContractReviewService
        .getById(id)
        .pipe(
          catchError((err) => {
            console.error('[REVIEW] getById error', err);
            this.alert = {
              type: 'error',
              message: err?.error?.message || 'Failed to load review',
            };
            return of(null);
          })
        ),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle(),
      projectTypes: this.projectTypeService
        .page({ page: 1, perPage: 300, is_active: 1 })
        .pipe(catchError(() => of({ items: this.fallbackProjectTypes })))
    })
      .pipe(
        switchMap(({ response, employeeLookup, employeeLookupWithTitle, projectTypes }) => {
          const data = response?.data || response;
          if (!data) return forkJoin({ response: of(response), employeeLookup: of(employeeLookup), employeeLookupWithTitle: of(employeeLookupWithTitle), projectTypes: of(projectTypes) });

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
                map(updatedLookupWithTitle => ({ response, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle, projectTypes }))
              );
            })
          );
        }),
        finalize(() => (this.isLoading = false)),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe(({ response: res, employeeLookup, employeeLookupWithTitle, projectTypes }: { response: ApiGetByIdResponse | any; employeeLookup: Map<string, string>; employeeLookupWithTitle: Map<string, string>; projectTypes: any }) => {
        this.employeeLookup = employeeLookup;
        this.employeeLookupWithTitle = employeeLookupWithTitle;
        this.projectTypeLookup = this.buildProjectTypeLookup(projectTypes?.items ?? []);
        const data = res?.data ?? null;
        if (!data) {
          this.review = null;
          return;
        }
        this.reviewRaw = data;
        this.review = this.mapApiToViewModel(data);
      });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup, 'Not specified');
  }

  // -----------------------
  // Mapper (API -> View Model)
  // -----------------------
  private mapApiToViewModel(d: any): ProposalContractReview {
    const city = d.city ?? '';
    const country = d.country ?? '';
    const location = [city, country].filter(Boolean).join(', ');

    const estimatedValue = this.toNumber(d.estimated_total_fees);

    const projectDetails = this.buildProjectDetails(d);
    const disciplines = this.buildDisciplines(d);

    const proposalReviewers = this.buildReviewersFromApi(d, 'proposal', [
      { name: d.proposal_reviewer1, date: d.proposal_reviewer1_date, status: d.proposal_reviewer1_status },
      { name: d.proposal_reviewer2, date: d.proposal_reviewer2_date, status: d.proposal_reviewer2_status },
      { name: d.proposal_reviewer3, date: d.proposal_reviewer3_date, status: d.proposal_reviewer3_status },
    ]);

    const contractReviewers = this.buildReviewersFromApi(d, 'contract', [
      { name: d.contract_reviewer1, date: d.contract_reviewer1_date, status: d.contract_reviewer1_status },
      { name: d.contract_reviewer2, date: d.contract_reviewer2_date, status: d.contract_reviewer2_status },
      { name: d.contract_reviewer3, date: d.contract_reviewer3_date, status: d.contract_reviewer3_status },
    ]);

    const status = this.deriveStatus(d);
    const approvalWorkflow = this.buildApprovalWorkflow(d, proposalReviewers, contractReviewers);
    const currentStage = this.currentStageFromApi(d);
    const currentApproval = this.currentApprovalFromApi(d, currentStage);

    const attachments = this.normalizeAttachments(d.attachments);

    return {
      id: String(d.id),

      projectName: d.project_name ?? '-',
      projectNo: d.project_no ?? '-',
      proposalNumber: d.proposal_number ?? d.proposalNumber ?? '-',
      projectType: this.getProjectTypeLabel(d.project_type ?? d.projectType ?? d.project_type_id),
      location: location || '-',
      locationCity: city || '-',
      locationCountry: country || '-',

      proposalAttached: this.toBool(d.proposal_attached),
      enquiryFrom: this.toBool(d.enquiry_from),
      feeCalculationAttached: this.toBool(d.fee_calculation_attached),

      clientName: d.client_name ?? '-',
      clientContact: d.client_contact_name ?? '-',
      clientAddress: d.client_address ?? '-',
      clientTel: d.client_tel_no ?? '-',
      clientFax: d.client_fax_no ?? '-',

      architectName: d.architect_name ?? '-',
      architectContact: d.architect_contact_name ?? '-',
      architectAddress: d.architect_address ?? '-',
      architectTel: d.architect_tel_no ?? '-',
      architectFax: d.architect_fax_no ?? '-',

      projectDetails,
      disciplines,

      estimatedValue,
      currency: d.currency ?? 'THB',

      scopeClearlyDefined: this.toBool(d.scope_clearly_defined),
      scopeDetails: d.scope_details ?? '',

      adequateResources: this.toBool(d.staff_resources_available),
      resourcesDetails: d.resources_details ?? '',

      helpFromOtherOffices: this.toBool(d.help_from_other_offices),
      helpDetails: d.help_details ?? '',

      subConsultantsRequired: this.toBool(d.sub_consultants_required),
      subConsultantsDetails: d.sub_consultants_details ?? '',

      specialQARequirements: d.qa_requirements ?? '',
      specialConsiderations: d.special_considerations ?? '',
      comments: d.quality_comments ?? d.comments ?? '',

      governmentProject: this.toBool(d.is_government_project),
      mmclProject: this.toBool(d.is_mmcl_project),
      mtl: this.toBool(d.is_mtl_project),

      filledInBy: d.filled_in_by ?? '-',
      filledInDate: d.filled_in_date ?? '',

      proposalToBeSubmitted: this.toBool(d.proposal_to_be_submitted),
      proposalDecline: this.toBool(d.proposal_decline),
      winProbability: this.toNumber(d.win_probability),
      proposalReviewers,

      contractAgreedToProceed: this.toBool(d.contract_agreed_to_proceed),
      contractDecline: this.toBool(d.contract_decline),
      leadTL: d.lead_tl ?? '',
      tl: d.tl_name ?? '',
      needPQP: this.toBool(d.need_quality_plan_pqp),
      contractReviewers,

      attachments,
      enquiryAttachments: this.filterAttachmentsByType(attachments, ['enquiry']),
      feeAttachments: this.filterAttachmentsByType(attachments, ['fee', 'fee_calculation']),
      approvalWorkflow,

      status,
      createdAt: d.created_at ?? '',
      updatedAt: d.updated_at ?? '',

      submittedAt: d.submitted_at ?? undefined,
      proposalReviewedAt: d.proposal_reviewed_at ?? undefined,
      contractReviewedAt: d.contract_reviewed_at ?? undefined,
      currentStage,
      currentApprovalRole: currentApproval?.role ?? null,

      mtProjects: this.mapMtProjects(d.projects ?? d.mt_projects ?? d.mtProjects ?? []),
    };
  }

  private mapMtProjects(rows: any[]): ProposalContractReviewProject[] {
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map((row) => this.proposalContractReviewService.toProject(row));
  }

  private buildProjectDetails(d: any): string[] {
    const list: string[] = [];
    if (this.toBool(d.pd_concept_detail_design)) list.push('Concept & Detail Design');
    if (this.toBool(d.pd_value_engineering)) list.push('Value Engineering');
    if (this.toBool(d.pd_engineering_audit)) list.push('Engineering Audit');
    if (this.toBool(d.pd_construction_supervision)) list.push('Construction Supervision');
    if (this.toBool(d.pd_tender_evaluation)) list.push('Tender Evaluation');
    if (this.toBool(d.pd_others_flag) && d.pd_others_text) list.push(String(d.pd_others_text));
    return list.length ? list : ['-'];
  }

  private buildDisciplines(d: any): string[] {
    const list: string[] = [];
    if (this.toBool(d.disc_cs)) list.push('C&S');
    if (this.toBool(d.disc_me)) list.push('M&E');
    if (this.toBool(d.disc_facade)) list.push('Façade');
    if (this.toBool(d.disc_transportation)) list.push('Transportation');
    if (this.toBool(d.disc_lighting)) list.push('Lighting');
    if (this.toBool(d.disc_others_flag) && d.disc_others_text) list.push(String(d.disc_others_text));
    return list.length ? list : ['-'];
  }

  private buildReviewers(items: Array<{ name: any; date: any; status?: any }>): Array<{ name: string; date: string; status: string }> {
    return items
      .filter((x) => !!x.name)
      .map((x) => ({
        name: String(x.name),
        date: x.date ? String(x.date) : '',
        status: x.status ? String(x.status) : '',
      }));
  }

  private buildProjectTypeLookup(projectTypes: any[]): Map<string, string> {
    const lookup = new Map<string, string>();
    const rows = [
      ...this.fallbackProjectTypes,
      ...(Array.isArray(projectTypes) ? projectTypes : []),
    ];

    rows.forEach((type: any) => {
      const label = String(type?.name ?? '').trim();
      if (!label) return;
      const code = String(type?.code ?? type?.id ?? '').trim();
      const displayLabel = code ? `${code} - ${label}` : label;

      [type?.id, type?.code, type?.name]
        .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
        .forEach((value) => {
          const key = String(value).trim();
          lookup.set(key, displayLabel);

          if (/^\d+$/.test(key)) {
            lookup.set(String(Number(key)), displayLabel);
          }
        });
    });

    return lookup;
  }

  private getProjectTypeLabel(value: any): string {
    const key = String(value ?? '').trim();
    if (!key) return '-';

    if (this.projectTypeLookup.has(key)) {
      return this.projectTypeLookup.get(key) || key;
    }

    if (/^\d+$/.test(key)) {
      return this.projectTypeLookup.get(String(Number(key))) ?? key;
    }

    return key;
  }

  private normalizeAttachments(value: any): ProposalContractReviewAttachment[] {
    if (!value) {
      return [];
    }

    let rows = Array.isArray(value) ? value : [value];

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        rows = [value];
      }
    }

    return rows
      .map((file: any) => {
        const path = typeof file === 'string'
          ? file
          : file?.file_path
            ?? file?.filePath
            ?? file?.path
            ?? file?.file_url
            ?? file?.fileUrl
            ?? file?.url
            ?? '';

        const name = typeof file === 'string'
          ? this.fileNameFromPath(file)
          : file?.file_name
            ?? file?.fileName
            ?? file?.original_name
            ?? file?.originalName
            ?? file?.filename
            ?? file?.name
            ?? this.fileNameFromPath(path);

        return {
          name: String(name || path || 'Attachment').trim(),
          path: String(path || name || '').trim(),
          type: String(typeof file === 'string' ? 'general' : file?.type ?? file?.attachment_type ?? 'general').trim(),
        };
      })
      .filter((file) => !!file.path || !!file.name);
  }

  private filterAttachmentsByType(
    attachments: ProposalContractReviewAttachment[],
    acceptedTypes: string[]
  ): ProposalContractReviewAttachment[] {
    const normalizedTypes = acceptedTypes.map((type) => type.toLowerCase());
    return attachments.filter((file) => {
      const type = String(file.type ?? '').trim().toLowerCase();
      return normalizedTypes.some((acceptedType) => type === acceptedType || type.includes(acceptedType));
    });
  }

  openAttachment(file: ProposalContractReviewAttachment): void {
    const path = String(file?.path ?? '').trim();
    if (!path) return;

    window.open(this.resolveAttachmentUrl(path), '_blank', 'noopener,noreferrer');
  }

  private resolveAttachmentUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    const normalized = path.replace(/^\/+/, '');
    const baseUrl = this.apiConfig.apiUrl.replace(/\/+$/, '');
    return `${baseUrl}/${normalized.startsWith('storage/') ? normalized : `storage/${normalized}`}`;
  }

  private fileNameFromPath(path: any): string {
    const value = String(path ?? '').trim();
    if (!value) return '';

    const withoutQuery = value.split('?')[0];
    return decodeURIComponent(withoutQuery.split('/').filter(Boolean).pop() || value);
  }

  private deriveStatus(d: any): string {
    const explicitStatus = String(d.status ?? '').trim().toLowerCase();
    if (explicitStatus) return explicitStatus;

    if (this.toBool(d.proposal_decline) || this.toBool(d.contract_decline)) return 'declined';
    if (this.toBool(d.contract_agreed_to_proceed) || d.contract_reviewer1 || d.contract_reviewer1_date) return 'contract_reviewed';
    if (d.proposal_reviewer1 || d.proposal_reviewer1_date) return 'proposal_reviewed';
    if (this.toBool(d.proposal_to_be_submitted)) return 'submitted';
    return 'draft';
  }

  private toBool(v: any): boolean {
    const normalized = String(v ?? '').toLowerCase();
    return v === true || v === 1 || normalized === '1' || normalized === 'yes' || normalized === 'true';
  }

  private toNumber(v: any): number {
    const n = typeof v === 'string' ? Number(v) : Number(v ?? 0);
    return isNaN(n) ? 0 : n;
  }

  // -----------------------
  // UI Actions
  // -----------------------
  onBack(): void {
    if (this.isApprovalMode) {
      this.router.navigate(['/proposal-contract-review/list'], { queryParams: { tab: 'action' } });
      return;
    }

    this.router.navigate(['/proposal-contract-review']);
  }

  onEdit(): void {
    if (this.review) {
      this.router.navigate(['/proposal-contract-review/edit', this.review.id]);
    }
  }

  canCreatePqa(): boolean {
    return this.review?.status === 'contract_approved' && this.review?.needPQP === true;
  }

  canManageMtProjects(): boolean {
    return !!this.review && !this.isApprovalMode && (
      this.review.contractAgreedToProceed ||
      ['contract_approved', 'approved', 'contract_reviewed'].includes(String(this.review.status).toLowerCase())
    );
  }

  onCreatePqa(): void {
    if (!this.review) return;

    this.isLoading = true;
    this.proposalContractReviewService
      .createPqaFromReview(this.review.id)
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (res: any) => {
          const id = res?.data?.id;
          if (id) {
            this.router.navigate(['/project-quality-assurance-plan/view', id]);
          } else {
            this.router.navigate(['/project-quality-assurance-plan/list']);
          }
        },
        error: (err) => {
          this.alert = { type: 'error', message: err?.error?.message || 'Failed to create Project Quality Assurance Plan' };
        },
      });
  }

  onManageMtProjects(): void {
    if (!this.review) return;
    this.router.navigate(['/proposal-contract-review/projects', this.review.id]);
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
      this.showAlert('error', 'Missing review data. Please reload page.');
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

    if (!currentApproval) {
      this.showAlert('error', 'This review is not assigned to the current user or has already been approved.');
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
          this.review = this.mapApiToViewModel(data);
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

  showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => (this.alert = null), 5000);
  }

  private buildReviewersFromApi(d: any, stage: 'proposal' | 'contract', fallback: Array<{ name: any; date: any; status?: any }>): Array<{ name: string; date: string; status: string }> {
    const fromApprovals = Array.isArray(d?.approvals)
      ? d.approvals
          .filter((approval: any) => approval.stage === stage)
          .sort((a: any, b: any) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
          .map((approval: any) => ({
            name: approval.approver_code,
            date: approval.acted_at,
            status: approval.decision,
          }))
      : [];

    return this.buildReviewers(fromApprovals.length ? fromApprovals : fallback);
  }

  private buildApprovalWorkflow(
    d: any,
    proposalReviewers: Array<{ name: string; date: string; status: string }>,
    contractReviewers: Array<{ name: string; date: string; status: string }>
  ): ProposalContractReviewApprovalWorkflow {
    return {
      requestedBy: {
        person: d.filled_in_by ?? d.create_by ?? '',
        date: d.submitted_at ?? d.filled_in_date ?? d.created_at ?? null,
      },
      proposalSteps: this.buildApprovalWorkflowSteps(d, 'proposal', proposalReviewers),
      contractSteps: [
        ...this.buildLeadTlWorkflowSteps(d),
        ...this.buildApprovalWorkflowSteps(d, 'contract', contractReviewers),
      ],
    };
  }

  private buildLeadTlWorkflowSteps(d: any): ProposalContractReviewApprovalStep[] {
    const leadTL = String(d?.lead_tl ?? d?.leadTl ?? '').trim();
    if (!leadTL) {
      return [];
    }

    return [{
      label: 'Lead TL',
      role: '',
      person: leadTL,
      date: d?.updated_at ?? d?.updatedAt ?? null,
      status: 'assigned',
      comment: '',
    }];
  }

  private buildApprovalWorkflowSteps(
    d: any,
    stage: 'proposal' | 'contract',
    fallbackReviewers: Array<{ name: string; date: string; status: string }>
  ): ProposalContractReviewApprovalStep[] {
    const stageLabel = stage === 'proposal' ? 'Proposal Review' : 'Contract Review';
    const approvals = Array.isArray(d?.approvals)
      ? d.approvals
          .filter((approval: any) => approval.stage === stage)
          .sort((a: any, b: any) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
      : [];

    if (approvals.length) {
      return approvals.map((approval: any, index: number) => {
        const sequence = Number(approval.sequence ?? index + 1);

        return {
          label: `${stageLabel} ${sequence}`,
          role: this.getApprovalRoleLabel(approval.role, sequence),
          person: approval.approver_code ?? approval.approver_name ?? '',
          date: approval.acted_at ?? null,
          status: this.normalizeWorkflowStatus(approval.decision),
          comment: String(approval.comment ?? '').trim(),
        };
      });
    }

    return fallbackReviewers.map((reviewer, index) => {
      const sequence = index + 1;

      return {
        label: `${stageLabel} ${sequence}`,
        role: this.getApprovalRoleLabel(null, sequence),
        person: reviewer.name,
        date: reviewer.date || null,
        status: this.normalizeWorkflowStatus(reviewer.status),
        comment: '',
      };
    });
  }

  private getApprovalRoleLabel(role: any, sequence: number): string {
    const normalized = String(role ?? '').trim().toUpperCase();
    if (normalized === 'MD_DI' || normalized === 'MD/DI' || sequence === 1) return 'MD/DI';
    if (normalized === 'DI') return 'DI';
    return normalized ? normalized.replace(/_/g, '/') : '';
  }

  private normalizeWorkflowStatus(status: any): string | null {
    const normalized = String(status ?? '').trim().toLowerCase();
    if (!normalized) return 'pending';
    if (normalized === 'approve') return 'approved';
    if (normalized === 'decline' || normalized === 'reject' || normalized === 'rejected') return 'declined';
    return normalized;
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

  // -----------------------
  // Checkbox Helpers
  // -----------------------
  isProjectDetailSelected(option: string): boolean {
    if (!this.review) return false;
    return this.review.projectDetails.some(
      (d) => d.toLowerCase() === option.toLowerCase() || (option === 'Others' && !this.allProjectDetailOptions.slice(0, -1).some(o => d.toLowerCase() === o.toLowerCase()))
    );
  }

  isDisciplineSelected(option: string): boolean {
    if (!this.review) return false;
    return this.review.disciplines.some(
      (d) => d.toLowerCase() === option.toLowerCase() || (option === 'Others' && !this.allDisciplineOptions.slice(0, -1).some(o => d.toLowerCase() === o.toLowerCase()))
    );
  }

  // -----------------------
  // Helpers for template
  // -----------------------
  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'pending_proposal_review':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300';
      case 'pending_contract_review':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300';
      case 'proposal_reviewed':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'contract_reviewed':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'contract_approved':
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
      case 'draft':
        return 'Draft';
      case 'submitted':
        return 'Submitted';
      case 'pending_proposal_review':
        return 'Pending Proposal Review';
      case 'pending_contract_review':
        return 'Pending Contract Review';
      case 'proposal_reviewed':
        return 'Proposal Reviewed';
      case 'contract_reviewed':
        return 'Contract Reviewed';
      case 'contract_approved':
        return 'Contract Approved';
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

  formatDateTime(dateString: string | null | undefined | Date): string {
    return formatDateTimeDisplay(dateString);
  }

  getByStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending':
        return 'Pending';
      case 'approve':
      case 'approved':
        return 'Approved';
      case 'assigned':
        return 'Assigned';
      case 'decline':
      case 'declined':
      case 'reject':
      case 'rejected':
        return 'Declined';
      default:
        return status;
    }
  }

  getByStatusColor(status: string | null | undefined): string {
    if (!status) return 'bg-yellow-100 text-yellow-800';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approve':
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'assigned':
        return 'bg-blue-100 text-blue-800';
      case 'decline':
      case 'declined':
      case 'reject':
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getWorkflowIcon(status: string | null | undefined): string {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'approve' || statusLower === 'approved') return 'check';
    if (statusLower === 'decline' || statusLower === 'declined' || statusLower === 'reject' || statusLower === 'rejected') return 'close';
    if (statusLower === 'assigned') return 'person';
    return 'schedule';
  }

  getWorkflowIconClass(status: string | null | undefined): string {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'approve' || statusLower === 'approved') return 'text-green-600';
    if (statusLower === 'decline' || statusLower === 'declined' || statusLower === 'reject' || statusLower === 'rejected') return 'text-red-600';
    if (statusLower === 'assigned') return 'text-blue-600';
    return 'text-blue-600';
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
