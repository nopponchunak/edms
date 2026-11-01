import { Component, OnInit, OnDestroy } from '@angular/core';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ApiService } from 'app/core/services/api.service';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { forkJoin, map, Subject, switchMap, takeUntil } from 'rxjs';
import { ViewActionsComponent } from 'app/core/components/view-actions';

export interface SingleSourceJustificationView {
  id: number;
  subConsultantSupplierName: string;
  itemsSupplied: string;
  justificationType: 'single_source' | 'price_justification' | 'single-source' | 'price-justification';
  circumstances: string;
  alternativesConsidered: number;
  alternativesReason?: string | null;
  comments?: string | null;
  rationale: string;
  assessedBy?: string | null;
  assessedByDate?: string | null;
  assessedByStatus?: string | null;
  correspondingPO?: string | null;
  verifyBy?: string | null;
  verifyByDate?: string | null;
  verifyByStatus?: string | null;
  verifyByComment?: string | null;
  approvedBy?: string | null;
  approvedByDate?: string | null;
  approvedByStatus?: string | null;
  approvedByComments?: string | null;
  acknowledgedBy?: string | null;
  acknowledgedByDate?: string | null;
  acknowledgedByStatus?: string | null;
  acknowledgedByComments?: string | null;
  createBy: string | null;
  updateBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  attachments?: string[];
}

interface ActionCommentItem {
  actionLabel: string;
  comment: string;
}

@Component({
  selector: 'app-single-source-justification-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    FuseAlertComponent,
    ViewActionsComponent
  ],
  templateUrl: './single-source-justification-view.component.html',
  styleUrls: ['./single-source-justification-view.component.scss']
})
export class SingleSourceJustificationViewComponent implements OnInit, OnDestroy {
  justification: SingleSourceJustificationView | null = null;
  actionComments: ActionCommentItem[] = [];
  isLoading = false;
  justificationId: string | null = null;
  projectTypes: any[] = [];

  // Alert properties
  alert: { type: FuseAlertType; message: string } | null = null;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();
  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private employeeService: EmployeeService
  ) {}

  ngOnInit(): void {
    this.justificationId = this.route.snapshot.paramMap.get('id');
    if (this.justificationId) {
      this.loadJustification();
    }
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private loadJustification(): void {
    if (!this.justificationId) {
      this.showAlert('error', 'Invalid justification ID');
      return;
    }

    this.isLoading = true;

    forkJoin({
      response: this.apiService.getSingleSourceJustification(this.justificationId),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle(),
      projectTypesResp: this.apiService.getProjectTypes()
    }).pipe(
      switchMap(({ response, employeeLookup, employeeLookupWithTitle, projectTypesResp }) => {
        const data = response?.data;
        if (!data) return forkJoin({ response: Promise.resolve(response), employeeLookup: Promise.resolve(employeeLookup), employeeLookupWithTitle: Promise.resolve(employeeLookupWithTitle), projectTypesResp: Promise.resolve(projectTypesResp) });

        const codes = [
          data.assessed_by,
          data.verify_by,
          data.approved_by,
          data.acknowledged_by,
          data.create_by,
          data.update_by
        ].filter(code => !!code);

        return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
          switchMap(updatedLookup => {
            return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
              map(updatedLookupWithTitle => ({ response, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle, projectTypesResp }))
            );
          })
        );
      }),
      takeUntil(this._unsubscribeAll)
    ).subscribe({
      next: ({ response, employeeLookup, employeeLookupWithTitle, projectTypesResp }) => {
        this.employeeLookup = employeeLookup;
        this.employeeLookupWithTitle = employeeLookupWithTitle;
        
        if (projectTypesResp?.status && Array.isArray(projectTypesResp.data)) {
          this.projectTypes = projectTypesResp.data;
        }

        if (response.status && response.data) {
          const data = response.data;
          this.justification = {
            id: data.id,
            subConsultantSupplierName: data.sub_consultant_supplier_name || '',
            itemsSupplied: data.items_supplied || '',
            justificationType: data.justification_type || 'single_source',
            circumstances: data.circumstances_selection || '',
            alternativesConsidered: data.alternatives_considered || 0,
            alternativesReason: data.reason_no_alternatives,
            comments: data.comments,
            rationale: data.rationale_selection || '',
            assessedBy: data.assessed_by,
            assessedByDate: data.assessed_by_date,
            assessedByStatus: data.assessed_by_status,
            correspondingPO: data.corresponding_po_no,
            verifyBy: data.verify_by,
            verifyByDate: data.verify_by_date,
            verifyByStatus: data.verify_by_status,
            verifyByComment: data.verify_by_comment,
            approvedBy: data.approved_by,
            approvedByDate: data.approved_by_date,
            approvedByStatus: data.approved_by_status,
            approvedByComments: data.approved_by_comments,
            acknowledgedBy: data.acknowledged_by,
            acknowledgedByDate: data.acknowledged_by_date,
            acknowledgedByStatus: data.acknowledged_by_status,
            acknowledgedByComments: data.acknowledged_by_comments,
            createBy: data.create_by,
            updateBy: data.update_by,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            deletedAt: data.deleted_at,
            attachments: Array.isArray(data.attachments) ? data.attachments : []
          };
          this.actionComments = this.buildActionComments(this.justification);
        } else {
          this.showAlert('error', response.message || 'Failed to load justification');
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading justification:', error);
        this.showAlert('error', 'Failed to load justification. Please try again.');
      this.isLoading = false;
      }
    });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
  }

  getItemSuppliedLabel(code: string): string {
    if (!code || code === '-') return '-';
    const projectType = this.projectTypes.find((pt: any) => pt.code === code);
    if (projectType) {
      return `${projectType.code} - ${projectType.name}`;
    }
    return code;
  }

  onEdit(): void {
    if (this.justificationId) {
      this.router.navigate(['/single-source-justification/edit', this.justificationId]);
    }
  }

  onBack(): void {
    this.router.navigate(['/single-source-justification']);
  }

  onPrint(): void {
    if (!this.justification) {
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
          <title>Single Source / Price Justification</title>
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

  private getPrintHtml(): string {
    if (!this.justification) {
      return '';
    }

    const j = this.justification;

    return `
      <div class="page">
        <header class="page-header">
          <div class="header-left">
            <div class="company-name">Meinhardt (Thailand) Ltd.</div>
          </div>
          <div class="header-right">
            <div class="logo">
              <img src="/erpAsset 2alogo.png" alt="MEINHARDT" />
              <div class="form-number">27 - FORM MTPC-09</div>
            </div>
          </div>
        </header>

        <h1 class="form-title">SINGLE SOURCE / PRICE JUSTIFICATION FORM</h1>

        <div class="main-border-box">
          <div class="row">
            <span class="label">Sub-Consultant / Supplier Name:</span>
            <span class="value dotted-line">${this.escapeHtml(j.subConsultantSupplierName || '')}</span>
          </div>

          <div class="row">
            <span class="label">Item (s) Supplied:</span>
            <span class="value dotted-line">${this.escapeHtml(this.getItemSuppliedLabel(j.itemsSupplied) || '')}</span>
          </div>

          <div class="row type-selection">
            <div class="checkbox-wrapper">
              <span class="checkbox">${(j.justificationType === 'single_source' || j.justificationType === 'single-source') ? '&#9745;' : '&#9744;'}</span>
              <span class="cb-label">Single Source Justification</span>
            </div>
            <div class="checkbox-wrapper ml-12">
              <span class="checkbox">${(j.justificationType === 'price_justification' || j.justificationType === 'price-justification') ? '&#9745;' : '&#9744;'}</span>
              <span class="cb-label">Price Justification</span>
            </div>
          </div>

          <div class="section-block">
            <div class="label">Circumstances leading to the selection of the Sub-Consultant/Supplier using Single Source / Price Justification Procurement:</div>
            <div class="value-block dotted-lines-area">
              ${this.renderMultiLineDots(j.circumstances, 4)}
            </div>
          </div>

          <div class="row items-center mt-2">
            <span class="label">Any alternatives considered?</span>
            <div class="checkbox-wrapper ml-10 mr-12">
              <span class="checkbox">${j.alternativesConsidered > 0 ? '&#9745;' : '&#9744;'}</span>
              <span class="cb-label">Yes</span>
            </div>
            <div class="checkbox-wrapper">
              <span class="checkbox">${j.alternativesConsidered === 0 ? '&#9745;' : '&#9744;'}</span>
              <span class="cb-label">No</span>
            </div>
          </div>

          <div class="row mt-2">
            <span class="label">Comments:</span>
            <span class="value dotted-line">${this.escapeHtml(j.comments || '')}</span>
          </div>
          <div class="dotted-line-wrap mt-px"></div>

          <div class="section-block mt-3">
            <div class="label">Rationale for selecting the Sub-Consultant / Supplier:</div>
            <div class="value-block dotted-lines-area">
              ${this.renderMultiLineDots(j.rationale, 5)}
            </div>
          </div>

          <div class="row mt-4">
            <span class="label">Assessed by:</span>
            <span class="value dotted-line person-name">${this.escapeHtml(this.getEmployeeLabel(j.createBy) || '')}</span>
            <span class="label-hint">(ADM / Purchase)</span>
            <span class="label ml-4">Date:</span>
            <span class="value dotted-line date-field">${this.escapeHtml(this.formatPrintDate(j.createdAt))}</span>
          </div>

          <div class="row mt-2 mb-1">
            <span class="label">Corresponding PO# if approved</span>
            <span class="value dotted-line">${this.escapeHtml(j.correspondingPO || '')}</span>
          </div>
        </div>

        <div class="approval-box mt-3">
          <div class="row">
            <span class="label">Verified by:</span>
            <span class="value dotted-line person-name">${this.escapeHtml(this.getApprovedEmployeeLabel(j.verifyBy, j.verifyByStatus))}</span>
            <span class="label-hint">(TL / AD / DI)</span>
            <span class="label ml-4">Date:</span>
            <span class="value dotted-line date-field">${this.escapeHtml(this.getApprovedPrintDate(j.verifyByDate, j.verifyByStatus))}</span>
          </div>
          <div class="section-block mt-1">
            <div class="label">Comments:</div>
            <div class="value-block dotted-lines-area">
              ${this.renderMultiLineDots(this.getApprovedPrintText(j.verifyByComment, j.verifyByStatus), 2)}
            </div>
          </div>
        </div>

        <div class="approval-box mt-3">
          <div class="row">
            <span class="label">Approved by:</span>
            <span class="value dotted-line person-name">${this.escapeHtml(this.getApprovedEmployeeLabel(j.approvedBy, j.approvedByStatus))}</span>
            <span class="label-hint">(DI / MD)</span>
            <span class="label ml-4">Date:</span>
            <span class="value dotted-line date-field">${this.escapeHtml(this.getApprovedPrintDate(j.approvedByDate, j.approvedByStatus))}</span>
          </div>
          <div class="section-block mt-1">
            <div class="label">Comments:</div>
            <div class="value-block dotted-lines-area">
              ${this.renderMultiLineDots(this.getApprovedPrintText(j.approvedByComments, j.approvedByStatus), 2)}
            </div>
          </div>
        </div>

        <div class="approval-box mt-3">
          <div class="row">
            <span class="label">Acknowledged by:</span>
            <span class="value dotted-line person-name">${this.escapeHtml(this.getApprovedEmployeeLabel(j.acknowledgedBy, j.acknowledgedByStatus))}</span>
            <span class="label-hint">(IMR)</span>
            <span class="label ml-4">Date:</span>
            <span class="value dotted-line date-field">${this.escapeHtml(this.getApprovedPrintDate(j.acknowledgedByDate, j.acknowledgedByStatus))}</span>
          </div>
          <div class="section-block mt-1">
            <div class="label">Comments:</div>
            <div class="value-block dotted-lines-area">
              ${this.renderMultiLineDots(this.getApprovedPrintText(j.acknowledgedByComments, j.acknowledgedByStatus), 2)}
            </div>
          </div>
        </div>

        <footer class="page-footer">
          <div class="footer-left">
            <div>M:/MTL_INDEX/IMS DOCUMENTATION/7. IMR DOCUMENTS/FORMS/</div>
            <div>DBS/DIEE/D3DE/8FCB89ECF3953D97593AEAD084E248B14C2BA6032B0DE4EDCB8/REV.A(15/05/2021)/CC/IMR</div>
          </div>
          <div class="footer-right">
            Page 1 of 1
          </div>
        </footer>
      </div>
    `;
  }

  private renderMultiLineDots(text: string | null | undefined, minLines: number): string {
    const content = text || '';
    const lines = content.split('\\n');
    let html = '';
    
    // Render existing lines with dotted underline
    for (let i = 0; i < Math.max(lines.length, minLines); i++) {
        const lineText = lines[i] || '';
        html += `<div class="dotted-line-wrap"><span class="line-text">${this.escapeHtml(lineText)}</span></div>`;
    }
    
    return html;
  }

  private formatPrintDate(dateString?: string | null): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
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

  private getApprovedPrintText(value: string | null | undefined, status: string | null | undefined): string {
    return this.isApprovedStatus(status) ? value || '' : '';
  }

  private isApprovedStatus(status: string | null | undefined): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'approve' || normalized === 'approved';
  }

  private escapeHtml(value: string | null | undefined): string {
    if (!value) return '';
    return String(value)
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
        color: #000;
        background: #fff;
        font-size: 9.5pt;
        line-height: 1.25;
      }
      .page {
        width: 210mm;
        height: 297mm;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        padding: 8mm 12mm 6mm 12mm;
      }
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 3mm;
      }
      .company-name {
        font-size: 10pt;
        font-weight: 700;
      }
      .logo {
        position: relative;
        text-align: right;
      }
      .logo img {
        height: 28px;
        margin-bottom: 0.5mm;
      }
      .form-number {
        font-size: 7.5pt;
        font-weight: 700;
      }
      .form-title {
        text-align: center;
        font-size: 11pt;
        font-weight: 700;
        color: #1b55a5;
        margin-bottom: 5mm;
        text-transform: uppercase;
      }
      .main-border-box {
        border: 1px solid #000;
        padding: 3mm 5mm;
        margin-bottom: 0;
      }
      .approval-box {
        border: 1px solid #000;
        padding: 2mm 5mm;
        margin-top: -1px; /* Overlap borders */
      }
      .row {
        display: flex;
        align-items: flex-end;
        margin-bottom: 2mm;
        width: 100%;
      }
      .items-center { align-items: center; }
      .label {
        font-weight: 400;
        margin-right: 1.5mm;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .label-hint {
        font-size: 8.5pt;
        margin-left: 1.5mm;
        flex-shrink: 0;
      }
      .value {
        flex: 1;
        min-height: 1.25em;
        padding: 0 1mm;
        display: inline-flex;
        align-items: center;
        position: relative;
        top: 1px;
      }
      .dotted-line {
        border-bottom: 0.5pt dotted #777;
      }
      .person-name { min-width: 50mm; }
      .date-field { min-width: 30mm; }
      
      .type-selection {
        padding-left: 10mm;
        margin: 2mm 0;
      }
      .cb-label {
        font-size: 9.5pt;
        color: #333;
      }
      .checkbox-wrapper {
        display: flex;
        align-items: center;
        gap: 1.5mm;
      }
      .checkbox {
        font-size: 13pt;
        line-height: 1;
        width: 12pt;
        height: 12pt;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #000;
      }
      .section-block {
        margin-bottom: 2mm;
      }
      .section-block .label {
        display: block;
        margin-bottom: 0.8mm;
        white-space: normal;
        font-weight: 400;
      }
      .dotted-lines-area {
        width: 100%;
      }
      .dotted-line-wrap {
        width: 100%;
        border-bottom: 0.5pt dotted #777;
        min-height: 1.45em;
        position: relative;
        margin-bottom: 0.2mm;
      }
      .line-text {
        position: absolute;
        bottom: 1.5px;
        left: 0;
        width: 100%;
      }
      .mt-px { margin-top: 1px; }
      .ml-12 { margin-left: 12mm; }
      .ml-8 { margin-left: 8mm; }
      .ml-4 { margin-left: 4mm; }
      .mr-12 { margin-right: 12mm; }
      .mt-1 { margin-top: 1mm; }
      .mt-2 { margin-top: 2mm; }
      .mt-4 { margin-top: 4mm; }
      .mt-6 { margin-top: 6mm; }
      .mb-2 { margin-bottom: 1mm; }
      
      .page-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        margin-top: auto;
        padding-top: 2mm;
        font-size: 6.5pt;
        color: #333;
      }
      .footer-left {
        max-width: 160mm;
      }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `;
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'draft':
        return 'gray';
      case 'assessed':
        return 'blue';
      case 'verified':
        return 'orange';
      case 'approved':
        return 'green';
      case 'acknowledged':
        return 'purple';
      case 'rejected':
        return 'red';
      default:
        return 'gray';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'assessed':
        return 'Assessed';
      case 'verified':
        return 'Verified';
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

  getJustificationTypeLabel(type: string): string {
    switch (type) {
      case 'single_source':
      case 'single-source':
        return 'Single Source Justification';
      case 'price_justification':
      case 'price-justification':
        return 'Price Justification';
      default:
        return type;
    }
  }

  formatDate(date: Date | string | null | undefined): string {
    return formatDateDisplay(date);
  }

  formatDateTime(date: Date | string | null | undefined): string {
    return formatDateTimeDisplay(date);
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

  private buildActionComments(justification: SingleSourceJustificationView): ActionCommentItem[] {
    const actionComments: ActionCommentItem[] = [];

    if (justification.verifyByComment?.trim()) {
      actionComments.push({
        actionLabel: 'Verification Comments',
        comment: justification.verifyByComment.trim()
      });
    }

    if (justification.approvedByComments?.trim()) {
      actionComments.push({
        actionLabel: 'Approval Comments (DI / MD)',
        comment: justification.approvedByComments.trim()
      });
    }

    if (justification.acknowledgedByComments?.trim()) {
      actionComments.push({
        actionLabel: 'Acknowledgement Comments (IMR)',
        comment: justification.acknowledgedByComments.trim()
      });
    }

    return actionComments;
  }

  private showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => {
      this.alert = null;
    }, 5000);
  }

  /** For template: build full URL for attachment path */
  getAttachmentUrl = getAttachmentUrl;
}
