import { Component, OnInit } from '@angular/core';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { Router, ActivatedRoute } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { SupplierAssessmentService } from 'app/core/services/supplier-assessment.service';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { forkJoin, map, Subject, switchMap, takeUntil } from 'rxjs';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { OnDestroy } from '@angular/core';

export interface AssessmentArea {
  area: string;
  score: number;
  criteriaPoor: string;
  criteriaFair: string;
  criteriaGood: string;
  criteriaExcellent: string;
}

export interface AssessmentReference {
  name: string;
  opinion: string;
}

export interface AssessmentAttachment {
  name: string;
  type?: string;
  sizeKB?: number;
  /** Full URL for opening the file (env + path) */
  url?: string;
}

export interface SupplierAssessment {
  id: string;
  supplierName: string;
  assessmentDate: string;
  totalScore: number;
  status: 'draft' | 'submitted' | 'assessed' | 'approved' | 'rejected';
  assessedBy: string;
  approvedBy: string;
  comments: string;
  createdAt: string;
  updatedAt: string;

  // Section 1 – Assessment details
  itemsSupplied: string;
  infoCompanyProfile: boolean;
  infoProjectReference: boolean;
  infoSiteVisit: boolean;
  infoPreviousAssessmentRecord: boolean;
  infoPreviousEvaluationRecord: boolean;
  infoIsoCertificates: boolean;

  // Section 1 – table
  assessmentAreas: AssessmentArea[];

  // Section 2 – references
  references: AssessmentReference[];

  // Section 3 – recommendation
  recommendation: 'accept' | 'not_accept';
  recommendationReason: string;

  // Sign-off section
  assessedDate: string;
  assessedByDate?: string | null;
  assessedByStatus?: 'pending' | 'reject' | 'approve' | null;
  approvedDate: string;
  approvedByDate?: string | null;
  approvedByStatus?: 'pending' | 'reject' | 'approve' | null;
  acknowledgedBy: string;
  acknowledgedDate: string;
  acknowledgedByDate?: string | null;
  acknowledgedByStatus?: 'pending' | 'reject' | 'approve' | null;

  // Approved supplier list
  approvedForList: 'yes' | 'no';
  approvedForListRemark: string;

  // Attachments
  attachments?: AssessmentAttachment[];
}

@Component({
  selector: 'app-supplier-assessment-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    FuseAlertComponent,
    ViewActionsComponent
  ],
  templateUrl: './supplier-assessment-view.component.html',
  styleUrls: ['./supplier-assessment-view.component.scss']
})
export class SupplierAssessmentViewComponent implements OnInit, OnDestroy {
  assessment: SupplierAssessment | null = null;
  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();
  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private supplierAssessmentService: SupplierAssessmentService,
    private employeeService: EmployeeService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      if (params['id']) {
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
      assessment: this.supplierAssessmentService.findOne(parseInt(id, 10)),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    }).pipe(
      switchMap(({ assessment, employeeLookup, employeeLookupWithTitle }) => {
        const codes = [
          assessment.assessedBy,
          assessment.approvedBy,
          assessment.acknowledgedBy,
          (assessment as any).createdBy,
          (assessment as any).updatedBy
        ].filter(code => !!code);

        return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
          switchMap(updatedLookup => {
            return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
              map(updatedLookupWithTitle => ({ assessment, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
            );
          })
        );
      }),
      takeUntil(this._unsubscribeAll)
    ).subscribe({
      next: ({ assessment, employeeLookup, employeeLookupWithTitle }) => {
        this.employeeLookup = employeeLookup;
        this.employeeLookupWithTitle = employeeLookupWithTitle;
        // Build informationUsedForAssessment array from boolean fields
        const informationUsed: string[] = [];
        if (assessment.informationUsedForAssessment.includes('company_profile')) {
          informationUsed.push('company_profile');
        }
        if (assessment.informationUsedForAssessment.includes('project_reference')) {
          informationUsed.push('project_reference');
        }
        if (assessment.informationUsedForAssessment.includes('site_visit')) {
          informationUsed.push('site_visit');
        }
        if (assessment.informationUsedForAssessment.includes('previous_assessment_record')) {
          informationUsed.push('previous_assessment_record');
        }
        if (assessment.informationUsedForAssessment.includes('previous_evaluation_record')) {
          informationUsed.push('previous_evaluation_record');
        }
        if (assessment.informationUsedForAssessment.includes('iso_certificates')) {
          informationUsed.push('iso_certificates');
        }

        // Build assessment areas from scores
        const assessmentAreas: AssessmentArea[] = [
          {
            area: 'Experience since establishment',
            score: assessment.experienceScore,
            criteriaPoor: '1–2',
            criteriaFair: '3–5',
            criteriaGood: '6–8',
            criteriaExcellent: '9–10'
          },
          {
            area: 'Fully qualified staff',
            score: assessment.qualifiedStaffScore,
            criteriaPoor: '1–2',
            criteriaFair: '3–5',
            criteriaGood: '6–8',
            criteriaExcellent: '9–10'
          },
          {
            area: 'Product compliances with accepted standards',
            score: assessment.productComplianceScore,
            criteriaPoor: 'Poor',
            criteriaFair: 'Fair',
            criteriaGood: 'Good',
            criteriaExcellent: 'Excellent'
          }
        ];

        // Build references array
        const references: AssessmentReference[] = assessment.references.map(ref => ({
          name: ref.name,
          opinion: ref.opinion === 'positive' ? 'Positive' : ref.opinion === 'negative' ? 'Negative' : 'Neutral'
        }));

        // Determine status
        let status: 'draft' | 'submitted' | 'assessed' | 'approved' | 'rejected' = 'submitted';
        if (assessment.approvedBy && assessment.approvedDate) {
          status = 'approved';
        } else if (assessment.assessedBy && assessment.assessedDate) {
          status = 'assessed';
        } else if (assessment.recommendation === 'not_accept') {
          status = 'rejected';
        }

        this.assessment = {
          id: String(assessment.id),
          supplierName: assessment.companyName,
          assessmentDate: assessment.assessedDate ? assessment.assessedDate.toISOString().split('T')[0] : '',
          totalScore: assessment.totalScore,
          status: status,
          assessedBy: assessment.assessedBy,
          approvedBy: assessment.approvedBy || '',
          comments: assessment.approvedRemark || '',
          createdAt: assessment.createdAt ? assessment.createdAt.toISOString().split('T')[0] : '',
          updatedAt: assessment.updatedAt ? assessment.updatedAt.toISOString().split('T')[0] : '',
          itemsSupplied: assessment.itemsSupplied,
          infoCompanyProfile: assessment.informationUsedForAssessment.includes('company_profile'),
          infoProjectReference: assessment.informationUsedForAssessment.includes('project_reference'),
          infoSiteVisit: assessment.informationUsedForAssessment.includes('site_visit'),
          infoPreviousAssessmentRecord: assessment.informationUsedForAssessment.includes('previous_assessment_record'),
          infoPreviousEvaluationRecord: assessment.informationUsedForAssessment.includes('previous_evaluation_record'),
          infoIsoCertificates: assessment.informationUsedForAssessment.includes('iso_certificates'),
          assessmentAreas: assessmentAreas,
          references: references,
          recommendation: assessment.recommendation,
          recommendationReason: assessment.reason || '',
          assessedDate: assessment.assessedDate ? assessment.assessedDate.toISOString().split('T')[0] : '',
          assessedByDate:
            assessment.assessedByDate ||
            (assessment.assessedDate ? assessment.assessedDate.toISOString() : null),
          assessedByStatus: assessment.assessedByStatus || null,
          approvedDate: assessment.approvedDate ? assessment.approvedDate.toISOString().split('T')[0] : '',
          approvedByDate:
            assessment.approvedByDate ||
            (assessment.approvedDate ? assessment.approvedDate.toISOString() : null),
          approvedByStatus: assessment.approvedByStatus || null,
          acknowledgedBy: assessment.acknowledgedBy || '',
          acknowledgedDate: assessment.acknowledgedDate ? assessment.acknowledgedDate.toISOString().split('T')[0] : '',
          acknowledgedByDate:
            assessment.acknowledgedByDate ||
            (assessment.acknowledgedDate ? assessment.acknowledgedDate.toISOString() : null),
          acknowledgedByStatus: assessment.acknowledgedByStatus || null,
          approvedForList: assessment.approvedForSupplierList ? 'yes' : 'no',
          approvedForListRemark: assessment.approvedRemark || '',
          attachments: (assessment.attachments && assessment.attachments.length)
            ? assessment.attachments.map((path: string) => ({
                name: path.split('/').pop() || path,
                type: 'File',
                url: getAttachmentUrl(path)
              }))
            : []
        };

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading supplier assessment:', error);
        this.isLoading = false;
        this.alert = {
          type: 'error',
          message: 'Failed to load supplier assessment. Please try again.'
        };
      }
    });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
  }

  onBack(): void {
    this.router.navigate(['/supplier-assessment']);
  }

  onEdit(): void {
    if (this.assessment) {
      this.router.navigate(['/supplier-assessment/edit', this.assessment.id]);
    }
  }

  onPrint(): void {
    if (!this.assessment) {
      return;
    }

    try {
      const printMarkup = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Supplier Assessment Form</title>
            <style>${this.getPrintStyles()}</style>
          </head>
          <body>
            ${this.getPrintHtml()}
          </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        return;
      }

      printWindow.document.open();
      printWindow.document.write(printMarkup);
      printWindow.document.close();

      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }, 300);
      };
    } catch (error) {
      console.error('Failed to generate supplier assessment print view:', error);
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'assessed':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
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
      case 'submitted':
        return 'Submitted';
      case 'assessed':
        return 'Assessed';
      case 'approve':
      case 'approved':
        return 'Approved';
      case 'reject':
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }

  formatDate(dateString?: string | Date | null): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string | null | undefined): string {
    return formatDateTimeDisplay(dateString);
  }

  getByStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'Pending';
      case 'reject':
      case 'rejected': return 'Rejected';
      case 'approve':
      case 'approved': return 'Approved';
      default: return status;
    }
  }

  getByStatusColor(status: string | null | undefined): string {
    if (!status) return 'bg-yellow-100 text-yellow-800';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approve':
      case 'approved': return 'bg-green-100 text-green-800';
      case 'reject':
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  private getPrintHtml(): string {
    if (!this.assessment) {
      return '';
    }

    const assessment = this.assessment;
    const references = [...(assessment.references || [])];
    while (references.length < 2) {
      references.push({ name: '', opinion: '' });
    }

    const logoUrl = `${window.location.origin}/images/logo/meinhardt-logo.svg`;

    return `
      <div class="page">
        <table class="header-table">
          <tr>
            <td class="header-left">
              <div class="header-label">To :</div>
              <div class="company-name">Meinhardt (Thailand) Ltd.</div>
            </td>
            <td class="header-center">
              <div class="header-label">Circ:</div>
              <div class="dotted-short"></div>
            </td>
            <td class="header-right">
              <div class="form-code">/AM/T6PC</div>
              <div class="logo"><img src="${logoUrl}" alt="MEINHARDT" /></div>
              <div class="form-number">27 - FORM MTPC-01</div>
            </td>
          </tr>
        </table>

        <div class="title">SUPPLIER ASSESSMENT FORM</div>

        <div class="content-box">
          <div class="line-row">
            <span class="field-label">Item(s) supplied:</span>
            <span class="line-fill">${this.escapeHtml(assessment.itemsSupplied || '')}</span>
          </div>

          <div class="info-grid">
            <div class="info-label">Information used for Assessment:</div>
            <div class="info-columns">
              <div class="info-column">
                <div class="check-row">${this.getCheckboxHtml(assessment.infoCompanyProfile)}<span>Company Profile / Biodata</span></div>
                <div class="check-row">${this.getCheckboxHtml(assessment.infoProjectReference)}<span>Project Reference / Certificates</span></div>
                <div class="check-row">${this.getCheckboxHtml(assessment.infoSiteVisit)}<span>Site Visit</span></div>
              </div>
              <div class="info-column">
                <div class="check-row">${this.getCheckboxHtml(assessment.infoPreviousAssessmentRecord)}<span>Previous Assessment Record</span></div>
                <div class="check-row">${this.getCheckboxHtml(assessment.infoPreviousEvaluationRecord)}<span>Previous Evaluation Record</span></div>
                <div class="check-row">${this.getCheckboxHtml(assessment.infoIsoCertificates)}<span>ISO Certificates</span></div>
              </div>
            </div>
          </div>

          <div class="section-title underline">Assessment:</div>

          <div class="line-row section-line">
            <span class="section-index">1.</span>
            <span class="field-label">Company:</span>
            <span class="line-fill">${this.escapeHtml(assessment.supplierName || '')}</span>
          </div>

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
                <td>&bull; Experience since establishment</td>
                <td class="center">${this.escapeHtml(String(assessment.assessmentAreas[0]?.score ?? ''))}</td>
                <td class="center">1-2</td>
                <td class="center">3-5</td>
                <td class="center">6-10</td>
                <td class="center">10 + years</td>
              </tr>
              <tr>
                <td>&bull; Fully qualified staff</td>
                <td class="center">${this.escapeHtml(String(assessment.assessmentAreas[1]?.score ?? ''))}</td>
                <td class="center">1-4</td>
                <td class="center">5-10</td>
                <td class="center">11-20</td>
                <td class="center">20 + staff</td>
              </tr>
              <tr>
                <td>&bull; Product compliances with accepted standards</td>
                <td class="center">${this.escapeHtml(String(assessment.assessmentAreas[2]?.score ?? ''))}</td>
                <td class="center">Poor</td>
                <td class="center">Fair</td>
                <td class="center">Good</td>
                <td class="center">Excellent</td>
              </tr>
            </tbody>
          </table>

          <div class="total-row">
            <span class="total-label">Total Score</span>
            <span class="equals">=</span>
            <span class="total-value">${this.escapeHtml(String(assessment.totalScore || ''))}</span>
          </div>
          <div class="total-note">(must exceed 15)</div>

          <div class="section-block">
            <div class="section-line">
              <span class="section-index">2.</span>
              <span class="field-label block-title">References</span>
            </div>
            <div class="note-text">Contact at least one external reference and record name and opinion</div>

            ${references.map((reference, index) => `
              <div class="reference-block">
                <div class="line-row">
                  <span class="reference-index">${index === 0 ? 'a)' : 'b)'}</span>
                  <span class="field-label">Name:</span>
                  <span class="line-fill">${this.escapeHtml(reference.name || '')}</span>
                </div>
                <div class="line-row opinion-row">
                  <span class="opinion-label">Opinion:</span>
                  <span class="line-fill">${this.escapeHtml(reference.opinion ? reference.opinion.toLowerCase() : 'negative, neutral, positive')}</span>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="section-title underline">Recommendation:</div>
          <div class="check-line">
            ${this.getCheckboxHtml(assessment.recommendation === 'accept')}
            <span>Accept (Score in item 1 must be 15 or better and must have at least one good positive reference.)</span>
          </div>
          <div class="check-line">
            ${this.getCheckboxHtml(assessment.recommendation === 'not_accept')}
            <span>Not accept</span>
          </div>

          <div class="reason-block">
            <div class="line-row">
              <span class="field-label">Reason:</span>
              <span class="line-fill">${this.escapeHtml(assessment.recommendationReason || '')}</span>
            </div>
            <div class="dotted-full"></div>
            <div class="dotted-full"></div>
          </div>

          <div class="signature-row">
            <span>Assessed By:</span>
            <span class="dotted-sig">${this.escapeHtml(this.getEmployeeLabel(assessment.assessedBy))}</span>
            <span class="role">(DI/ TL)</span>
            <span>Date:</span>
            <span class="dotted-date">${this.escapeHtml(this.formatDate(assessment.assessedByDate || assessment.assessedDate))}</span>
          </div>

          <div class="approval-box">
            <div class="approval-question">Is the above Supplier approved to go on the Approved Supplier List?</div>
            <div class="yes-no-row">
              <div class="check-line short">${this.getCheckboxHtml(assessment.approvedForList === 'yes')}<span>Yes</span></div>
              <div class="check-line short">${this.getCheckboxHtml(assessment.approvedForList === 'no')}<span>No</span></div>
            </div>

            <div class="remark-block">
              <div class="line-row">
                <span class="field-label">Remark:</span>
                <span class="line-fill">${this.escapeHtml(assessment.approvedForListRemark || '')}</span>
              </div>
              <div class="dotted-full"></div>
              <div class="dotted-full"></div>
            </div>

            <div class="signature-row">
              <span>Approved By:</span>
              <span class="dotted-sig">${this.escapeHtml(this.getApprovedEmployeeLabel(assessment.approvedBy, assessment.approvedByStatus))}</span>
              <span class="role">(MD/DI)</span>
              <span>Date:</span>
              <span class="dotted-date">${this.escapeHtml(this.getApprovedPrintDate(assessment.approvedByDate || assessment.approvedDate, assessment.approvedByStatus))}</span>
            </div>

            <div class="signature-row">
              <span>Acknowledged By:</span>
              <span class="dotted-sig">${this.escapeHtml(this.getApprovedEmployeeLabel(assessment.acknowledgedBy, assessment.acknowledgedByStatus))}</span>
              <span class="role">(IMR)</span>
              <span>Date:</span>
              <span class="dotted-date">${this.escapeHtml(this.getApprovedPrintDate(assessment.acknowledgedByDate || assessment.acknowledgedDate, assessment.acknowledgedByStatus))}</span>
            </div>
          </div>
        </div>

        <div class="footer">
          <span>M:\\MTL_INDEX\\IMS DOCUMENTATION\\FORMS\\SUPPLIER ASSESSMENT\\27-03.DOC\\REV E (4/8/2012)\\CC/MR</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    `;
  }

  private getPrintStyles(): string {
    return `
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #ffffff; color: #000000; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.28; }
      .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 8mm 10mm 6mm; }
      .header-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; }
      .header-table td { vertical-align: top; }
      .header-left { width: 40%; }
      .header-center { width: 20%; }
      .header-right { width: 40%; text-align: right; }
      .header-label { margin-bottom: 6mm; }
      .company-name { font-size: 13pt; font-weight: 700; }
      .dotted-short { display: inline-block; width: 38mm; min-height: 12px; border-bottom: 1px dotted #666; }
      .form-code { margin-bottom: 3px; }
      .logo img { width: 52mm; max-height: 12mm; object-fit: contain; }
      .form-number { font-size: 9pt; }
      .title { text-align: center; font-size: 15pt; font-weight: 700; color: #1f5ea8; margin: 0 0 6mm; }
      .content-box { border: 1px solid #000; padding: 8px 10px 10px; }
      .line-row, .check-line, .signature-row { display: flex; align-items: baseline; gap: 6px; }
      .line-row { margin-bottom: 6px; }
      .field-label { white-space: nowrap; }
      .line-fill { flex: 1; min-height: 14px; border-bottom: 1px dotted #666; padding: 0 3px 1px; }
      .info-grid { display: grid; grid-template-columns: 205px 1fr; column-gap: 4px; margin: 10px 0 8px; }
      .info-columns { display: grid; grid-template-columns: 1fr 1fr; column-gap: 18px; }
      .info-column { display: flex; flex-direction: column; gap: 2px; }
      .check-row { display: flex; align-items: center; gap: 8px; min-height: 18px; }
      .checkbox { width: 12px; height: 12px; border: 1px solid #000; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; line-height: 1; }
      .checkbox.checked::after { content: "X"; }
      .section-title { margin: 8px 0 6px; font-weight: 700; }
      .underline { text-decoration: underline; }
      .section-line { margin-bottom: 6px; }
      .section-index, .reference-index { width: 20px; display: inline-block; }
      .block-title { font-weight: 700; }
      .score-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 9.5pt; }
      .score-table th, .score-table td { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; }
      .score-table th { text-align: center; font-weight: 700; }
      .score-table .col-area { width: 44%; }
      .score-table .col-score { width: 12%; }
      .center { text-align: center; }
      .total-row { display: flex; justify-content: center; align-items: center; gap: 10px; margin: 10px 0 2px; }
      .total-label { font-weight: 700; }
      .equals { font-weight: 700; }
      .total-value { min-width: 52px; text-align: center; border-bottom: 1px solid #000; font-weight: 700; }
      .total-note { text-align: center; font-size: 9pt; margin-bottom: 10px; }
      .section-block { margin-top: 6px; }
      .note-text { margin: 2px 0 8px 26px; }
      .reference-block { margin-bottom: 8px; }
      .opinion-row { margin-left: 26px; }
      .opinion-label { min-width: 46px; }
      .reason-block, .remark-block { margin-top: 8px; }
      .dotted-full { width: 100%; border-bottom: 1px dotted #666; margin-top: 10px; }
      .signature-row { margin-top: 12px; }
      .dotted-sig { flex: 1; min-width: 0; border-bottom: 1px dotted #666; padding: 0 3px 1px; }
      .dotted-date { width: 120px; border-bottom: 1px dotted #666; padding: 0 3px 1px; }
      .role { min-width: 70px; text-align: center; }
      .approval-box { margin-top: 10px; border-top: 1px solid #000; padding-top: 10px; }
      .approval-question { margin-bottom: 8px; }
      .yes-no-row { display: flex; gap: 24px; margin-bottom: 8px; }
      .check-line.short { gap: 6px; }
      .footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 6px; font-size: 6.5pt; }
      @page { size: A4 portrait; margin: 0; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { width: 210mm; min-height: 297mm; }
      }
    `;
  }

  private getCheckboxHtml(isChecked: boolean): string {
    return `<span class="checkbox${isChecked ? ' checked' : ''}"></span>`;
  }

  private getApprovedEmployeeLabel(ref: string | number | null | undefined, status: string | null | undefined): string {
    return this.isApprovedStatus(status) ? this.getEmployeeLabel(ref) : '';
  }

  private getApprovedPrintDate(dateString: string | Date | null | undefined, status: string | null | undefined): string {
    return this.isApprovedStatus(status) ? this.formatDate(dateString) : '';
  }

  private isApprovedStatus(status: string | null | undefined): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'approve' || normalized === 'approved';
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
