import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatCardModule } from '@angular/material/card';

import { Router, ActivatedRoute } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { SupplierEvaluationService } from 'app/core/services/supplier-evaluation.service';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { ViewActionsComponent } from 'app/core/components/view-actions';

export interface SupplierEvaluation {
  id: string;
  supplierName: string;
  projectName?: string;
  projectNo?: string;
  departmentInfo?: string; // Department / Purchased Value / Duration
  evaluatedDate: string;
  averageRating: number;
  status: 'draft' | 'submitted' | 'evaluated' | 'approved' | 'rejected';
  evaluatedBy?: string | null;
  evaluatedByDate?: string | null;
  evaluatedByStatus?: 'pending' | 'reject' | 'approve' | null;
  approvedBy?: string | null;
  approvedByDate?: string | null;
  approvedByStatus?: 'pending' | 'reject' | 'approve' | null;
  acknowledgedBy?: string | null;
  acknowledgedByDate?: string | null;
  acknowledgedByStatus?: 'pending' | 'reject' | 'approve' | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationCriterion {
  no: number;
  item: string;
  rating: number;
  comment: string;
}

@Component({
  selector: 'app-supplier-evaluation-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatCardModule,
    FuseAlertComponent,
    ViewActionsComponent
  ],
  templateUrl: './supplier-evaluation-view.component.html',
  styleUrls: ['./supplier-evaluation-view.component.scss'],
  styles: [`
    .document-check-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.375rem 0;
      transition: all 0.2s ease;
    }

    .document-check-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.25rem;
      height: 1.25rem;
      border: 1px solid rgb(203 213 225);
      border-radius: 0.25rem;
      background: white;
      font-size: 0.875rem;
      font-weight: 800;
      color: rgb(37 99 235);
      flex-shrink: 0;
    }

    .document-check-row.active .document-check-box {
      border-color: rgb(34 197 94);
      color: rgb(22 163 74);
    }

    .document-check-row.active.danger .document-check-box {
      border-color: rgb(34 197 94);
      color: rgb(22 163 74);
    }

    :host-context(.dark) .document-check-box {
      border-color: rgb(71 85 105);
      background: rgb(30 41 59);
    }
  `]
})
export class SupplierEvaluationViewComponent implements OnInit, OnDestroy {
  private readonly defaultCriteriaItems = [
    'Quality and Accuracy of Document',
    'Timeliness of Documentation',
    'Understanding of MTL\'s Needs',
    'Cooperation and Responsiveness of Frontline Staff',
    'Timeliness of Delivery',
    'Quality of Products',
    'Meet EMS / OHSMS Requirements',
    'Others'
  ];

  evaluation: SupplierEvaluation | null = null;
  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();
  private _unsubscribeAll: Subject<any> = new Subject<any>();

  // Anti-corruption (แสดงผลอย่างเดียว)
  antiCorruption: 'yes' | 'no' | '' = '';

  // ตาราง 8 ข้อ
  criteria: EvaluationCriterion[] = [];

  // คอมเมนต์สรุป
  summaryComment = '';

  // Decision
  decision: 'maintain' | 'remove' | '' = '';

  // Sign-off
  signOff = {
    evaluatedBy: '',
    evaluatedDate: '',
    approvedBy: '',
    approvedDate: '',
    acknowledgedBy: '',
    acknowledgedDate: ''
  };

  // แนบเอกสาร (โหลดจาก API หรือว่าง)
  attachments: { name: string; type?: string; sizeKB?: number; url?: string }[] = [];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private supplierEvaluationService: SupplierEvaluationService,
    private employeeService: EmployeeService
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe(params => {
      if (params['id']) {
        this.loadEvaluation(params['id']);
      }
    });
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  /** โหลดข้อมูลจาก API */
  private loadEvaluation(id: string): void {
    this.isLoading = true;

    forkJoin({
      data: this.supplierEvaluationService.findOne(id),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    }).pipe(
      switchMap(({ data, employeeLookup, employeeLookupWithTitle }) => {
        const codes = [
          data.evaluatedBy,
          data.approvedBy,
          data.acknowledgedBy,
          data.create_by,
          data.update_by
        ].filter(code => !!code);
        return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
          switchMap(updatedLookup => {
            return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
              map(updatedLookupWithTitle => ({ data, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
            );
          })
        );
      }),
      takeUntil(this._unsubscribeAll)
    ).subscribe({
      next: ({ data, employeeLookup, employeeLookupWithTitle }) => {
        this.employeeLookup = employeeLookup;
        this.employeeLookupWithTitle = employeeLookupWithTitle;
        // Map API data to component properties
        this.evaluation = {
          id: data.id,
          supplierName: data.supplierName,
          projectName: data.projectName,
          projectNo: data.projectNo,
          departmentInfo: data.departmentValueDuration,
          evaluatedDate: data.evaluatedDate,
          averageRating: data.averageRating,
          status: data.decision === 'maintain' ? 'approved' : 'evaluated',
          evaluatedBy: data.evaluatedBy || null,
          evaluatedByDate: data.evaluatedByDate || null,
          evaluatedByStatus: data.evaluatedByStatus || null,
          approvedBy: data.approvedBy || null,
          approvedByDate: data.approvedByDate || null,
          approvedByStatus: data.approvedByStatus || null,
          acknowledgedBy: data.acknowledgedBy || null,
          acknowledgedByDate: data.acknowledgedByDate || null,
          acknowledgedByStatus: data.acknowledgedByStatus || null,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        };

        // Anti-corruption flag
        this.antiCorruption = data.antiCorruptionFlag ? 'yes' : 'no';

        // Map items array to criteria
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
          this.criteria = data.items.map((item: any, index: number) => ({
            no: index + 1,
            item: item.item_name || '',
            rating: item.rating || 0,
            comment: item.comment || ''
          }));
        } else {
          // If items is null or empty, create empty criteria array
          this.criteria = [];
        }

        // Summary comment (not in API response, leave empty or use averageComment if available)
        this.summaryComment = '';

        // Decision
        this.decision = data.decision || '';

        // Sign-off
        this.signOff = {
          evaluatedBy: data.evaluatedBy || '',
          evaluatedDate: data.evaluatedDate || '',
          approvedBy: data.approvedBy || '',
          approvedDate: data.approvedDate || '',
          acknowledgedBy: data.acknowledgedBy || '',
          acknowledgedDate: data.acknowledgedDate || ''
        };

        this.attachments = Array.isArray(data.attachments) && data.attachments.length > 0
          ? data.attachments.map((path: string) => ({
              name: path.split('/').pop() || path,
              type: 'File',
              url: getAttachmentUrl(path)
            }))
          : [];

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading supplier evaluation:', error);
        this.isLoading = false;
        this.alert = {
          type: 'error',
          message: error?.error?.message || 'Failed to load supplier evaluation. Please try again.'
        };
        // Navigate back to list after error
        setTimeout(() => {
          this.router.navigate(['/supplier-evaluation']);
        }, 3000);
      }
    });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
  }

  /** คำนวณค่าเฉลี่ย */
  get averageScore(): number {
    if (!this.criteria || this.criteria.length === 0) {
      return 0;
    }
    const sum = this.criteria.reduce((acc, c) => acc + (c.rating || 0), 0);
    return +(sum / this.criteria.length).toFixed(1);
  }

  onBack(): void {
    this.router.navigate(['/supplier-evaluation']);
  }

  onEdit(): void {
    if (this.evaluation) {
      this.router.navigate(['/supplier-evaluation/edit', this.evaluation.id]);
    }
  }

  onPrint(): void {
    if (!this.evaluation) {
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Supplier Evaluation Form</title>
          <meta charset="utf-8" />
          <style>${this.getPrintStyles()}</style>
        </head>
        <body>
          ${this.getPrintHtml()}
        </body>
      </html>
    `);
    printWindow.document.close();

    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    };
  }

  // ===== Helper UI =====

  private getPrintHtml(): string {
    if (!this.evaluation) {
      return '';
    }

    const rows = this.getPrintCriteriaRows()
      .map((criterion, index) => `
        <tr>
          <td class="item-cell"><span class="item-no">${index + 1}.</span><span class="item-name">${this.escapeHtml(criterion.item)}</span></td>
          <td class="rating-cell">${criterion.rating > 0 ? this.escapeHtml(String(criterion.rating)) : ''}</td>
          <td class="comment-cell">${this.escapeHtml(criterion.comment || '')}</td>
        </tr>
      `)
      .join('');

    return `
      <div class="page">
        <table class="header-table">
          <tr>
            <td class="header-left">
              <div>To :</div>
              <div class="company-name">Meinhardt (Thailand) Ltd.</div>
            </td>
            <td class="header-center">
              <div>Circ:</div>
            </td>
            <td class="header-right">
              <div class="form-code">/QMP/T6PC</div>
              <div class="logo"><img src="/erpAsset 2alogo.png" alt="MEINHARDT" /></div>
              <div class="form-number">27 - FORM MTPC-04</div>
            </td>
          </tr>
        </table>

        <div class="title">SUPPLIER EVALUATION FORM</div>

        <div class="content-box">
          <div class="field-row">
            <span class="field-label">Supplier Name:</span><span class="field-value">${this.escapeHtml(this.evaluation.supplierName || '')}</span>
          </div>

          <div class="field-row dual-row">
            <div class="field-group project-name-group">
              <span class="field-label">Project Name:</span><span class="field-value">${this.escapeHtml(this.evaluation.projectName || '')}</span>
            </div>
            <div class="field-group project-no-group">
              <span class="field-label">Project No.:</span><span class="field-value">${this.escapeHtml(this.evaluation.projectNo || '')}</span>
            </div>
          </div>

          <div class="field-row">
            <span class="field-label">Department / Purchased Value / Duration:</span><span class="field-value">${this.escapeHtml(this.evaluation.departmentInfo || '')}</span>
          </div>

          <div class="question-block">
            <div class="question-text">
              Are there any reasonable grounds to believe that the Supplier has violated or failed to comply with Meinhardt's Anti-Corruption programme and/or applicable laws?
            </div>
            <div class="checkbox-row">
              <span class="checkbox-option"><span class="checkbox">${this.antiCorruption === 'yes' ? '&#9745;' : '&#9744;'}</span>Yes – remove from approved list</span>
              <span class="checkbox-option"><span class="checkbox">${this.antiCorruption === 'no' ? '&#9745;' : '&#9744;'}</span>No – proceed below</span>
            </div>
          </div>

          <div class="table-wrap">
            <div class="section-b-marker">B</div>
            <table class="score-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="rating-head">Rating</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="average-row">
                  <td class="average-label">Average</td>
                  <td class="rating-cell">${this.formatPrintAverage(this.evaluation.averageRating)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="rating-scale">
            <span class="rating-scale-label">Rating:</span>
            <span>Poor (0-4)</span>
            <span>Satisfactory (5-7)</span>
            <span>Good (8-10)</span>
          </div>

          <div class="decision-row">
            <div class="decision-option">
              <span class="checkbox">${this.decision === 'maintain' ? '&#9745;' : '&#9744;'}</span>
              <span>Supplier to be maintained in approved lists (Average Rating ≥ 5)</span>
            </div>
            <div class="decision-option">
              <span class="checkbox">${this.decision === 'remove' ? '&#9745;' : '&#9744;'}</span>
              <span>Supplier to be removed from approved lists (Average Rating &lt; 5)</span>
            </div>
          </div>

          <div class="signature-row">
            <span class="signature-label">Evaluated by:</span><span class="signature-value">${this.escapeHtml(this.getApprovedEmployeeLabel(this.evaluation.evaluatedBy, this.evaluation.evaluatedByStatus))}</span><span class="signature-label date-label">Date:</span><span class="date-value">${this.escapeHtml(this.getApprovedPrintDate(this.evaluation.evaluatedByDate, this.evaluation.evaluatedByStatus))}</span>
          </div>
          <div class="signature-role-row"><span>(ADM)</span></div>

          <div class="signature-row">
            <span class="signature-label">Approved by:</span><span class="signature-value">${this.escapeHtml(this.getApprovedEmployeeLabel(this.evaluation.approvedBy, this.evaluation.approvedByStatus))}</span><span class="signature-label date-label">Date:</span><span class="date-value">${this.escapeHtml(this.getApprovedPrintDate(this.evaluation.approvedByDate, this.evaluation.approvedByStatus))}</span>
          </div>
          <div class="signature-role-row"><span>(MD/ DI/ TL)</span></div>

          <div class="signature-row">
            <span class="signature-label">Acknowledged by:</span><span class="signature-value">${this.escapeHtml(this.getApprovedEmployeeLabel(this.evaluation.acknowledgedBy, this.evaluation.acknowledgedByStatus))}</span><span class="signature-label date-label">Date:</span><span class="date-value">${this.escapeHtml(this.getApprovedPrintDate(this.evaluation.acknowledgedByDate, this.evaluation.acknowledgedByStatus))}</span>
          </div>
          <div class="signature-role-row"><span>(IMR)</span></div>
        </div>

        <div class="footer">
          <div class="footer-ref">M:\MTL_INDEX\IMS DOCUMENTATION\FORMS\SUPPLIER EVALUATION FORM\MTPC-04</div>
          <div class="page-num">Page 1 of 1</div>
        </div>
      </div>
    `;
  }

  private getPrintCriteriaRows(): EvaluationCriterion[] {
    return this.defaultCriteriaItems.map((itemName, index) => {
      const existing = this.criteria[index];
      return {
        no: index + 1,
        item: existing?.item || itemName,
        rating: Number(existing?.rating || 0),
        comment: existing?.comment || ''
      };
    });
  }

  private formatPrintAverage(value: number): string {
    if (!Number.isFinite(value)) {
      return '';
    }

    return value.toFixed(2);
  }

  private formatPrintDate(dateString?: string | null): string {
    if (!dateString) {
      return '';
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return dateString;
    }

    const day = `${date.getDate()}`.padStart(2, '0');
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private getApprovedEmployeeLabel(ref: string | number | null | undefined, status: string | null | undefined): string {
    return this.isApprovedStatus(status) ? this.getEmployeeLabel(ref) || '' : '';
  }

  private getApprovedPrintDate(dateString: string | null | undefined, status: string | null | undefined): string {
    return this.isApprovedStatus(status) ? this.formatPrintDate(dateString) : '';
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

  private getPrintStyles(): string {
    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      @page { size: A4; margin: 0; }
      body {
        font-family: Arial, sans-serif;
        color: #111;
        background: #fff;
        font-size: 10pt;
        line-height: 1.18;
      }
      .page {
        width: 210mm;
        height: 297mm;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        padding: 11mm 12mm 7mm 12mm;
      }
      .header-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 11mm;
      }
      .header-table td {
        vertical-align: top;
      }
      .header-left { width: 42%; }
      .header-center { width: 18%; text-align: center; }
      .header-right { width: 40%; text-align: right; }
      .company-name {
        margin-top: 5mm;
        font-size: 11.5pt;
        font-weight: 700;
      }
      .form-code { font-size: 9pt; margin-bottom: 1mm; }
      .logo img {
        height: 20px;
        max-width: 150px;
        object-fit: contain;
        display: inline-block;
      }
      .form-number { font-size: 8pt; margin-top: 1mm; font-weight: 700; }
      .title {
        text-align: center;
        font-size: 11.5pt;
        font-weight: 700;
        color: #1b55a5;
        margin-bottom: 12mm;
      }
      .content-box {
        flex: 1;
      }
      .field-row {
        display: flex;
        align-items: flex-end;
        gap: 0;
        margin-bottom: 6mm;
        white-space: nowrap;
      }
      .dual-row {
        justify-content: space-between;
      }
      .field-group {
        display: flex;
        align-items: flex-end;
        gap: 0;
      }
      .project-name-group { width: 69%; }
      .project-no-group { width: 25%; }
      .field-label {
        white-space: nowrap;
        font-size: 10pt;
      }
      .field-value {
        border-bottom: 1px dotted #777;
        min-height: 10px;
        padding: 0 1px 1px;
        flex: 1;
        display: inline-flex;
        align-items: flex-end;
        overflow: hidden;
      }
      .question-block {
        margin: 2mm 0 5mm;
      }
      .question-text {
        margin-bottom: 4mm;
        line-height: 1.2;
      }
      .checkbox-row {
        display: flex;
        justify-content: flex-start;
        gap: 31mm;
        flex-wrap: wrap;
        padding-left: 14mm;
      }
      .checkbox-option,
      .decision-option {
        display: inline-flex;
        align-items: center;
        gap: 2mm;
        font-size: 10pt;
      }
      .checkbox {
        font-size: 13pt;
        line-height: 1;
        width: 12px;
        display: inline-block;
      }
      .table-wrap { position: relative; margin-top: 4mm; }
      .section-b-marker {
        position: absolute;
        left: -6px;
        top: 160px;
        font-size: 16px;
        font-weight: 700;
      }
      .score-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .score-table th,
      .score-table td {
        border: 1px solid #777;
        padding: 0 4px;
        vertical-align: middle;
      }
      .score-table th {
        text-align: center;
        font-weight: 700;
        height: 18px;
        line-height: 18px;
      }
      .item-cell {
        width: 55%;
        padding-left: 8px !important;
        white-space: nowrap;
      }
      .item-name {
        display: inline;
        white-space: nowrap;
      }
      .item-no {
        display: inline-block;
        min-width: 18px;
        margin-right: 8px;
      }
      .rating-head,
      .rating-cell {
        width: 12%;
        text-align: center;
      }
      .comment-cell {
        width: 33%;
      }
      .score-table tbody tr {
        height: 33px;
      }
      .average-row td {
        font-weight: 700;
        height: 35px;
      }
      .average-label {
        text-align: center;
      }
      .rating-scale {
        display: flex;
        gap: 12mm;
        align-items: center;
        margin: 7mm 0 5mm 1mm;
        font-size: 10pt;
      }
      .rating-scale-label {
        font-weight: 400;
      }
      .decision-row {
        display: flex;
        flex-direction: column;
        gap: 4mm;
        margin-bottom: 8mm;
        padding-left: 20mm;
      }
      .signature-row {
        display: flex;
        align-items: flex-end;
        gap: 0;
        margin-bottom: 1mm;
        font-size: 10pt;
      }
      .signature-label,
      .date-label {
        white-space: nowrap;
      }
      .signature-value,
      .date-value {
        border-bottom: 1px dotted #777;
        min-height: 10px;
        padding: 0 1px 1px;
        display: inline-flex;
        align-items: flex-end;
      }
      .signature-value {
        width: 111mm;
      }
      .date-value {
        width: 59mm;
      }
      .signature-role-row {
        width: 100%;
        text-align: center;
        font-size: 9pt;
        margin-bottom: 5mm;
      }
      .footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        margin-top: auto;
        padding-top: 4mm;
        font-size: 4.8pt;
      }
      .footer-ref {
        max-width: 155mm;
      }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `;
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'evaluated':
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
      case 'evaluated':
        return 'Evaluated';
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

  formatDate(dateString?: string | null): string {
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

  getRatingRangeCellClass(
    rating: number,
    min: number,
    max: number,
    tone: 'red' | 'yellow' | 'green'
  ): string {
    return 'text-gray-700 dark:text-gray-300';
  }

  getAverageScoreLabel(score: number): string {
    if (score >= 8) {
      return 'Good (8-10)';
    }

    if (score >= 5) {
      return 'Satisfactory (5-7)';
    }

    return 'Poor (0-4)';
  }
}
