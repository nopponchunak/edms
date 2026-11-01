import { Component, OnInit, Inject, OnDestroy } from '@angular/core';
import { formatDateDisplay, formatDateTimeDisplay, formatDateTimeNoSecondsDisplay } from 'app/core/utils/date-format.util';
import { CommonModule, DOCUMENT } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { Router, ActivatedRoute } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ApiService } from 'app/core/services/api.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { forkJoin, map, Subject, switchMap, takeUntil } from 'rxjs';
import { ViewActionsComponent } from 'app/core/components/view-actions';

export interface SubConsultantAssessment {
  id: number;
  form_code: string;
  to: string;
  circ: string;
  scope_of_service: string;

  // Information used for Assessment
  info_company_profile_biodata?: number | null;
  info_project_reference_certificates?: number | null;
  info_site_visit?: number | null;
  info_previous_assessment_record?: number | null;
  info_previous_evaluation_record?: number | null;
  info_iso_certificates?: number | null;

  company: string;
  score_experience_since_establishment: number;
  score_fully_qualified_staff: number;
  score_completed_similar_projects: number;
  item1_total_score: number;
  ems_iso_14001: number | null;
  ems_ohsas_18001: number | null;
  ems_iso_45001: number | null;
  recommendation: string;
  recommendation_reason: string | null;
  assessed_by: string | null;
  assessed_by_date: string | null;
  approved_by: string | null;
  approved_by_date: string | null;
  acknowledged_by: string | null;
  acknowledged_by_date: string | null;
  assessed_by_status?: string | null;
  approved_by_status?: string | null;
  acknowledged_by_status?: string | null;
  decision_sub_consultant_list?: number | boolean | string | null;
  remark?: string | null;
  status: string;
  create_by: string | null;
  update_by: string | null;
  created_at: string;
  updated_at: string;
  references: Array<{
    id: number;
    seq: number;
    reference_name: string;
    opinion: string;
  }>;
  files?: Array<{
    id?: number;
    name: string;
    path: string;
    create_by?: string;
    created_at?: string;
  }>;
}

type AssessmentInformationKey =
  | 'info_company_profile_biodata'
  | 'info_project_reference_certificates'
  | 'info_site_visit'
  | 'info_previous_assessment_record'
  | 'info_previous_evaluation_record'
  | 'info_iso_certificates';

type AssessmentScoreKey =
  | 'score_experience_since_establishment'
  | 'score_fully_qualified_staff'
  | 'score_completed_similar_projects';

@Component({
  selector: 'app-sub-consultant-assessment-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
    FuseAlertComponent,
    ViewActionsComponent
  ],
  templateUrl: './sub-consultant-assessment-view.component.html',
  styleUrls: ['./sub-consultant-assessment-view.component.scss']
})
export class SubConsultantAssessmentViewComponent implements OnInit, OnDestroy {
  readonly assessmentInformationOptions = [
    { key: 'info_company_profile_biodata', label: 'Company Profile / Biodata' },
    { key: 'info_project_reference_certificates', label: 'Project Reference / Certificates' },
    { key: 'info_site_visit', label: 'Site Visit' },
    { key: 'info_previous_assessment_record', label: 'Previous Assessment Record' },
    { key: 'info_previous_evaluation_record', label: 'Previous Evaluation Record' },
    { key: 'info_iso_certificates', label: 'ISO Certificates' }
  ] as const;

  readonly assessmentAreas = [
    {
      label: 'Experience since establishment',
      scoreKey: 'score_experience_since_establishment' as const,
      criteria: ['1-2 years', '3-5 years', '6-10 years', '10+ years']
    },
    {
      label: 'Fully qualified staff',
      scoreKey: 'score_fully_qualified_staff' as const,
      criteria: ['1-4 persons', '5-10 persons', '11-50 persons', '50+ persons']
    },
    {
      label: 'Satisfactorily completed projects similar to that MTL would use them for',
      scoreKey: 'score_completed_similar_projects' as const,
      criteria: ['0-1 projects', '2-4 projects', '5-10 projects', '10+ projects']
    }
  ] as const;

  assessment: SubConsultantAssessment | null = null;
  assessmentId: string | null = null;
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
    private apiService: ApiService,
    private employeeService: EmployeeService,
    @Inject(DOCUMENT) private document: Document
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe(params => {
      if (params['id']) {
        this.assessmentId = params['id'];
        this.loadAssessment(params['id']);
      }
    });
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private loadAssessment(id: string): void {
    this.isLoading = true;
    this.alert = null;

    forkJoin({
      response: this.apiService.getSubConsultantAssessment(id),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    }).pipe(
      switchMap(({ response, employeeLookup, employeeLookupWithTitle }) => {
        const data = (response as any)?.data;
        if (!data) return forkJoin({ response: Promise.resolve(response), employeeLookup: Promise.resolve(employeeLookup), employeeLookupWithTitle: Promise.resolve(employeeLookupWithTitle) });

        const codes = [
          data.assessed_by,
          data.approved_by,
          data.acknowledged_by,
          data.create_by,
          data.update_by
        ].filter(code => !!code);

        return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
          switchMap(updatedLookup => {
            return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
              map(updatedLookupWithTitle => ({ response, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
            );
          })
        );
      }),
      takeUntil(this._unsubscribeAll)
    ).subscribe({
      next: ({ response, employeeLookup, employeeLookupWithTitle }) => {
        this.employeeLookup = employeeLookup;
        this.employeeLookupWithTitle = employeeLookupWithTitle;
        if (response.status && response.data) {
          this.assessment = {
            ...response.data,
            to: response.data.to ? response.data.to.replace(/\s*\(.*?\)\s*/g, '') : response.data.to,
            assessed_by_status: response.data.assessed_by_status?.toLowerCase() ?? null,
            approved_by_status: response.data.approved_by_status?.toLowerCase() ?? null,
            acknowledged_by_status: response.data.acknowledged_by_status?.toLowerCase() ?? null,
            status: response.data.status?.toLowerCase() ?? 'draft'
          };
          this.isLoading = false;
        } else {
          this.alert = {
            type: 'error',
            message: response.message || 'Failed to load assessment'
          };
          this.isLoading = false;
        }
      },
      error: (error) => {
        console.error('Error loading assessment:', error);
        this.alert = {
          type: 'error',
          message: error?.error?.message || 'Failed to load assessment. Please try again.'
        };
        this.isLoading = false;
      }
    });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
  }

  onBack(): void {
    this.router.navigate(['/sub-consultant-assessment']);
  }

  onEdit(): void {
    if (this.assessment) {
      this.router.navigate(['/sub-consultant-assessment/edit', this.assessment.id]);
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'assessed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'acknowledged':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'pending':
        return 'Pending';
      case 'assessed':
        return 'Assessed';
      case 'approved':
        return 'Approved';
      case 'acknowledged':
        return 'Acknowledged';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }

  getRecommendationLabel(recommendation: string): string {
    switch (recommendation) {
      case 'accept':
        return 'Accept';
      case 'not_accept':
        return 'Not Accept';
      default:
        return recommendation;
    }
  }

  getRecommendationBadgeClass(recommendation: string): string {
    switch (recommendation) {
      case 'accept':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'not_accept':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getOpinionLabel(opinion: string): string {
    switch (opinion) {
      case 'good':
        return 'Good';
      case 'neutral':
        return 'Neutral';
      case 'poor':
        return 'Poor';
      default:
        return opinion;
    }
  }

  getOpinionBadgeClass(opinion: string): string {
    switch (opinion) {
      case 'good':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'neutral':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'poor':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  formatDate(dateString: string | null | undefined): string {
    return formatDateTimeNoSecondsDisplay(dateString);
  }

  private getApprovedEmployeeLabel(ref: string | number | null | undefined, status: string | null | undefined): string {
    return this.isApprovedStatus(status) ? this.getEmployeeLabel(ref) : '';
  }

  private getApprovedPrintDate(dateString: string | null | undefined, status: string | null | undefined): string {
    return this.isApprovedStatus(status) ? this.formatDate(dateString) : '';
  }

  private isApprovedStatus(status: string | null | undefined): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'approve' || normalized === 'approved';
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

  get meetsMinimumScore(): boolean {
    return this.assessment ? (this.assessment.item1_total_score || 0) >= 15 : false;
  }

  get hasPositiveReference(): boolean {
    return this.assessment ? this.assessment.references.some(ref => ref.opinion === 'good') : false;
  }

  isAssessmentInfoChecked(key: AssessmentInformationKey): boolean {
    return this.assessment?.[key] === 1;
  }

  getAssessmentScore(key: AssessmentScoreKey): number | string {
    return this.assessment?.[key] ?? '-';
  }

  get hasCompliance(): boolean {
    if (!this.assessment) {
      return false;
    }

    return this.assessment.ems_iso_14001 === 1
      || this.assessment.ems_ohsas_18001 === 1
      || this.assessment.ems_iso_45001 === 1;
  }

  getReferenceLabel(index: number): string {
    return String.fromCharCode(97 + index);
  }

  onPrint(): void {
    if (!this.assessment) {
      return;
    }

    // Open print dialog in new window
    const printWindow = this.document.defaultView?.open('', '_blank');
    if (!printWindow) {
      return;
    }

    // Get the print component HTML
    const printComponent = this.document.createElement('app-sub-consultant-assessment-print');
    printComponent.setAttribute('ng-reflect-assessment', JSON.stringify(this.assessment));

    // Create a temporary container
    const container = this.document.createElement('div');
    container.innerHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sub-Consultant Assessment Form</title>
          <style>
            ${this.getPrintStyles()}
          </style>
        </head>
        <body>
          ${this.getPrintHTML()}
        </body>
      </html>
    `;

    printWindow.document.write(container.innerHTML);
    printWindow.document.close();

    // Wait for content to load then print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    };
  }

  private getPrintHTML(): string {
    if (!this.assessment) return '';

    const assessment = this.assessment;
    const references = assessment.references || [];
    const hasCompliance = assessment.ems_iso_14001 === 1 || assessment.ems_iso_45001 === 1 || assessment.ems_ohsas_18001 === 1;
    const subConsultantListDecision = this.getSubConsultantListDecision(assessment);
    const approvedToSubConsultantList = subConsultantListDecision === true;
    const notApprovedToSubConsultantList = subConsultantListDecision === false;

    // Generate references HTML - ensure at least 2 references
    let referencesHTML = '';
    for (let i = 0; i < Math.max(2, references.length); i++) {
      const ref = references[i];
      const label = String.fromCharCode(97 + i);
      const name = ref?.reference_name || '';
      const opinion = ref?.opinion === 'good' ? 'positive' : ref?.opinion === 'poor' ? 'negative' : ref?.opinion === 'neutral' ? 'neutral' : 'negative, neutral, positive';
      referencesHTML += `
        <div class="ref-item">
          <span class="ref-label">${label})</span>
          <span>Name:</span>
          <span class="dotted-line">${name}</span>
        </div>
        <div class="ref-opinion">Opinion: ${opinion}</div>
      `;
    }

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
              <div>Circ:</div>
              <div class="dotted-short">${assessment.circ || ''}</div>
            </td>
            <td class="header-right">
              <div class="form-code">${assessment.form_code || '/AM/T6SC'}</div>
              <div class="logo"><img src="/erpAsset 2alogo.png" alt="MEINHARDT" style="height: 20px; max-width: 150px;" /></div>
              <div class="form-number">10 - FORM MTSC-01</div>
            </td>
          </tr>
        </table>

        <!-- Title -->
        <div class="title">SUB-CONSULTANT ASSESSMENT FORM</div>

        <!-- Main Content Box -->
        <div class="content-box">
          <!-- Scope -->
          <div class="row">
            <span class="label">Scope of service required:</span>
            <span class="dotted-line">${assessment.scope_of_service || ''}</span>
          </div>

          <!-- Information used -->
          <div class="row">
            <span class="label">Information used for Assessment:</span>
            <span class="checkbox">${assessment.info_company_profile_biodata === 1 ? '☑' : '☐'}</span> Company Profile / Biodata
            <span class="checkbox ml">${assessment.info_previous_assessment_record === 1 ? '☑' : '☐'}</span> Previous Assessment Record
          </div>
          <div class="row indent">
            <span class="checkbox">${assessment.info_project_reference_certificates === 1 ? '☑' : '☐'}</span> Project Reference / Certificates
            <span class="checkbox ml">${assessment.info_previous_evaluation_record === 1 ? '☑' : '☐'}</span> Previous Evaluation Record
          </div>
          <div class="row indent">
            <span class="checkbox">${assessment.info_site_visit === 1 ? '☑' : '☐'}</span> Site Visit
            <span class="checkbox ml">${assessment.info_iso_certificates === 1 ? '☑' : '☐'}</span> ISO Certificates
          </div>

          <!-- Assessment -->
          <div class="section-title">Assessment:</div>
          <div class="row">
            <span class="label">1.</span>
            <span>Company:</span>
            <span class="dotted-line">${assessment.company || ''}</span>
          </div>

          <!-- Table -->
          <table class="score-table">
            <thead>
              <tr>
                <th rowspan="2" class="col-area">Assessment Areas</th>
                <th rowspan="2" class="col-score">Score<br>(1 to 10)</th>
                <th colspan="4">Criteria of Scores</th>
              </tr>
              <tr>
                <th>1-2</th>
                <th>3-5</th>
                <th>6-8</th>
                <th>9-10</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>•  Experience since establishment</td>
                <td class="center">${assessment.score_experience_since_establishment || ''}</td>
                <td class="center">1-2</td>
                <td class="center">3-5</td>
                <td class="center">6-10</td>
                <td class="center">10 + years</td>
              </tr>
              <tr>
                <td>•  Fully qualified staff</td>
                <td class="center">${assessment.score_fully_qualified_staff || ''}</td>
                <td class="center">1-4</td>
                <td class="center">5-10</td>
                <td class="center">11-50</td>
                <td class="center">50 + Persons</td>
              </tr>
              <tr>
                <td>•  Satisfactorily completed projects similar to that MTL would use them for</td>
                <td class="center">${assessment.score_completed_similar_projects || ''}</td>
                <td class="center">0-1</td>
                <td class="center">2-4</td>
                <td class="center">5-10</td>
                <td class="center">10+Projects</td>
              </tr>
            </tbody>
          </table>

          <div class="total-row">
            <span class="total-label">Total Score  =</span>
            <span class="total-value">${assessment.item1_total_score || ''}</span>
            <span class="total-note">(must exceed 15)</span>
          </div>

          <!-- Compliance -->
          <div class="row">
            <span class="label">2.</span>
            <span>Compliance to EMS and OHSMS:</span>
          </div>
          <div class="compliance-row">
            <div class="compliance-line">
              <span>•  Obtained certificates of ISO 14001 and/or OHSAS 18001/ISO 45001</span>
              <span class="checkbox ml">${hasCompliance ? '☑' : '☐'}</span> Yes
              <span class="checkbox ml">${!hasCompliance ? '☑' : '☐'}</span> No
            </div>
          </div>

          <!-- References -->
          <div class="row">
            <span class="label">3.</span>
            <span>References</span>
          </div>
          <div class="row italic">Contact at least one external reference and record name and opinion</div>
          ${referencesHTML}

          <!-- Recommendation -->
          <div class="section-title underline">Recommendation:</div>
          <div class="row">
            <span class="checkbox">${assessment.recommendation === 'accept' ? '☑' : '☐'}</span>
            <span>Accept (Score in item 1 must be 15 or better and must have at least one good positive reference.)</span>
          </div>
          <div class="row">
            <span class="checkbox">${assessment.recommendation === 'not_accept' ? '☑' : '☐'}</span>
            <span>Not accept</span>
          </div>
          <div class="row">
            <span class="label">Reason:</span>
            <span class="dotted-line">${assessment.recommendation_reason || ''}</span>
          </div>
          <div class="dotted-full"></div>
          <div class="dotted-full"></div>
          <div class="dotted-full"></div>
          <div class="dotted-full"></div>

          <!-- Assessed By -->
          <div class="signature-row">
            <span>Assessed By:</span>
            <span class="dotted-sig">${this.getEmployeeLabel(assessment.assessed_by)}</span>
            <span class="role">(DI/ TL)</span>
            <span>Date:</span>
            <span class="dotted-date">${this.formatDate(assessment.assessed_by_date)}</span>
          </div>

          <!-- Approval Question -->
          <div class="row">
            <span>Is the above Sub-Consultant approved to go on the Sub-Consultant List?</span>
          </div>
          <div class="row">
            <span class="checkbox">${approvedToSubConsultantList ? '☑' : '☐'}</span> Yes
            <span class="checkbox ml">${notApprovedToSubConsultantList ? '☑' : '☐'}</span> No
          </div>

          <!-- Remark -->
          <div class="row">
            <span class="label">Remark:</span>
            <span class="dotted-line">${assessment.remark || ''}</span>
          </div>
          <div class="dotted-full"></div>
          <div class="dotted-full"></div>
          <div class="dotted-full"></div>
          <div class="dotted-full"></div>

          <!-- Approved By -->
          <div class="signature-row">
            <span>Approved By:</span>
            <span class="dotted-sig">${this.getApprovedEmployeeLabel(assessment.approved_by, assessment.approved_by_status)}</span>
            <span class="role">(MD/DI)</span>
            <span>Date:</span>
            <span class="dotted-date">${this.getApprovedPrintDate(assessment.approved_by_date, assessment.approved_by_status)}</span>
          </div>

          <!-- Acknowledged By -->
          <div class="signature-row">
            <span>Acknowledged By:</span>
            <span class="dotted-sig">${this.getApprovedEmployeeLabel(assessment.acknowledged_by, assessment.acknowledged_by_status)}</span>
            <span class="role">(IMR)</span>
            <span>Date:</span>
            <span class="dotted-date">${this.getApprovedPrintDate(assessment.acknowledged_by_date, assessment.acknowledged_by_status)}</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <span>Z:/MR/MYDOCUMENTS/IMS DOCUMENT/IMS DOCUMENTATION/FORMS/378ED149E70FBF78D47A09A570CF48F2E365C4C58A321C787CDCE5D4D4CAF1EA.DOC/ REV.D (03/12/2020)/CC/MR</span>
          <span class="page-num">Page 1 of 1</span>
        </div>
      </div>
    `;
  }

  private getSubConsultantListDecision(assessment: Partial<SubConsultantAssessment>): boolean | null {
    const decision = assessment.decision_sub_consultant_list;
    if (decision !== null && decision !== undefined && decision !== '') {
      const normalized = String(decision).toLowerCase();
      if (decision === true || decision === 1 || normalized === '1' || normalized === 'true' || normalized === 'yes') {
        return true;
      }
      if (decision === false || decision === 0 || normalized === '0' || normalized === 'false' || normalized === 'no') {
        return false;
      }
    }

    const approvedStatus = String(assessment.approved_by_status || '').toLowerCase();
    if (approvedStatus === 'approved' || approvedStatus === 'approve') {
      return true;
    }
    if (approvedStatus === 'rejected' || approvedStatus === 'reject') {
      return false;
    }

    return null;
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
      .content-box { border: 1px solid #000; padding: 10px 12px; page-break-inside: avoid; break-inside: avoid; }

      /* Rows - Body 10-11 pt (Regular) */
      .row { margin: 5px 0; font-size: 10pt; }
      .indent { margin-left: 180px; }
      .label { font-weight: bold; margin-right: 5px; }
      .dotted-line { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 300px; margin-left: 5px; }
      .dotted-full { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; width: 100%; height: 1px; margin: 8px 0; }
      .checkbox { font-size: 12pt; margin-right: 3px; }
      .ml { margin-left: 30px; }
      .italic { font-style: italic; font-size: 10pt; }

      /* Section Title - 11-12 pt (Bold) */
      .section-title { font-weight: bold; font-size: 12pt; margin: 8px 0 5px 0; }
      .section-title.underline { text-decoration: underline; }

      /* Score Table - 10-11 pt (Regular) */
      .score-table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 10pt; }
      .score-table th, .score-table td { border: 1px solid #000; padding: 5px 6px; }
      .score-table th { background: #f5f5f5; font-weight: bold; text-align: center; }
      .score-table .col-area { width: 45%; text-align: left; }
      .score-table .col-score { width: 12%; text-align: center; }
      .score-table td.center { text-align: center; }

      /* Total */
      .total-row { margin: 10px 0; text-align: center; font-size: 10pt; }
      .total-label { font-weight: bold; }
      .total-value { border-bottom: 1px solid #000; display: inline-block; min-width: 50px; text-align: center; font-weight: bold; }
      .total-note { margin-left: 10px; font-size: 10pt; }

      /* References */
      .ref-item { margin: 5px 0 0 20px; font-size: 10pt; }
      .ref-label { font-weight: bold; margin-right: 5px; }
      .ref-opinion { margin: 3px 0 6px 40px; font-size: 10pt; }

      /* Compliance */
      .compliance-row { margin: 5px 0 5px 20px; font-size: 10pt; }
      .compliance-line { display: flex; align-items: baseline; flex-wrap: nowrap; }

      /* Signatures */
      .signature-row { margin: 10px 0; font-size: 10pt; display: flex; align-items: baseline; gap: 5px; }
      .dotted-sig { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 150px; }
      .dotted-date { border-bottom: 1px dotted #000; border-style: dotted; border-width: 0 0 1px 0; display: inline-block; min-width: 100px; }
      .role { font-size: 10pt; margin: 0 10px; }

      /* Footer */
      .footer { margin-top: auto; padding-top: 6px; border-top: 1px solid #ccc; font-size: 7pt; color: #666; display: flex; justify-content: space-between; }
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
