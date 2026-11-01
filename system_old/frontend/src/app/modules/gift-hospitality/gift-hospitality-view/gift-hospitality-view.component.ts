import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatCardModule } from '@angular/material/card';
import { catchError, forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { GiftHospitalityService } from 'app/core/services/gift-hospitality.service';
import { AuthService } from 'app/core/services/auth.service';
import { GiftHospitality } from 'app/core/models/gift-hospitality.model';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { ApprovalWorkflowComponent, ApprovalWorkflowStep } from 'app/core/components/approval-workflow';
import { EmployeeService } from 'app/core/services/employee.service';
import { SignatureSetting, SignatureSettingService } from 'app/core/services/signature-setting.service';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  escapeSignatureHtml,
  formatPoSignatureId,
  getSignatureLookupRefsFromValues,
  getSignaturePrintHtml,
} from 'app/core/utils/signature-print.util';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';

@Component({
  selector: 'app-gift-hospitality-view',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatCardModule,
    ApprovalWorkflowComponent,
    ViewActionsComponent,
    MatTooltipModule,
  ],
  templateUrl: './gift-hospitality-view.component.html',
  styleUrls: ['./gift-hospitality-view.component.scss'],
})
export class GiftHospitalityViewComponent implements OnInit, OnDestroy {
  readonly requestTypes = [
    { value: 'gift', label: 'Gift' },
    { value: 'hospitality', label: 'Hospitality' }
  ] as const;

  giftHospitality: GiftHospitality | null = null;
  loading = false;
  currentUserId: string | null = null;
  showApprovalForm = false;
  approvalDecision = false;
  approvalComments = '';
  attachments: Array<{ name: string; url: string }> = [];
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();
  activeSignatureSettings = new Map<string, SignatureSetting>();
  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private giftHospitalityService: GiftHospitalityService,
    private employeeService: EmployeeService,
    private signatureSettingService: SignatureSettingService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe(params => {
      if (params['id']) {
        this.loadGiftHospitality(params['id']);
      }
    });

    this.authService.currentUser$.pipe(takeUntil(this._unsubscribeAll)).subscribe(user => {
      this.currentUserId = user?.id || null;
      this.checkIfCanApprove();
    });
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private loadGiftHospitality(id: string): void {
    this.loading = true;
    forkJoin({
      giftHospitality: this.giftHospitalityService.findOne(id),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    })
      .pipe(
        switchMap(({ giftHospitality, employeeLookup, employeeLookupWithTitle }) => {
          const codes = [
            giftHospitality.mtlReceivingStaffBy,
            giftHospitality.verifiedBy,
            giftHospitality.acknowledgedBy,
            giftHospitality.imsAcknowledgedBy,
            giftHospitality.approvedBy,
            (giftHospitality as any).create_by,
            (giftHospitality as any).update_by
          ].filter(code => !!code);
          return forkJoin({
            employeeLookup: this.employeeService.ensureEmployeesInLookup(employeeLookup, codes),
            employeeLookupWithTitle: this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes),
          }).pipe(
            switchMap((lookups) => {
              const signatureLookupRefs = getSignatureLookupRefsFromValues(codes, lookups.employeeLookup);

              return this.signatureSettingService.getActiveMapByCodes(signatureLookupRefs).pipe(
                catchError(() => of(new Map<string, SignatureSetting>())),
                map((activeSignatureSettings) => ({
                  giftHospitality,
                  employeeLookup: lookups.employeeLookup,
                  employeeLookupWithTitle: lookups.employeeLookupWithTitle,
                  activeSignatureSettings,
                }))
              );
            })
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe({
        next: ({ giftHospitality, employeeLookup, employeeLookupWithTitle, activeSignatureSettings }) => {
          this.giftHospitality = giftHospitality;
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          this.activeSignatureSettings = activeSignatureSettings;
          this.attachments = this.buildAttachments(this.giftHospitality.attachments);
          this.checkIfCanApprove();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading gift/hospitality:', error);
          this.snackBar.open('Error loading request', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
  }

  private checkIfCanApprove(): void {
    if (!this.giftHospitality || !this.hasCurrentUserIdentity()) {
      this.showApprovalForm = false;
      return;
    }

    const canVerify = this.isPendingWorkflowStatus(this.giftHospitality.verifiedByStatus) &&
                     this.isCurrentAssignee(this.giftHospitality.verifiedBy, this.giftHospitality.verifiedById);
    const canAcknowledge1 = this.isApprovedStatus(this.giftHospitality.verifiedByStatus) &&
                           this.isPendingWorkflowStatus(this.giftHospitality.imsAcknowledgedByStatus) &&
                           this.isCurrentAssignee(this.giftHospitality.imsAcknowledgedBy);
    const canApprove = this.isApprovedStatus(this.giftHospitality.verifiedByStatus) &&
                      this.isApprovedStatus(this.giftHospitality.imsAcknowledgedByStatus) &&
                      this.isPendingWorkflowStatus(this.giftHospitality.approvedByStatus) &&
                      this.isCurrentAssignee(this.giftHospitality.approvedBy, this.giftHospitality.approvedById);
    const canAcknowledge = this.isApprovedStatus(this.giftHospitality.verifiedByStatus) &&
                          this.isApprovedStatus(this.giftHospitality.imsAcknowledgedByStatus) &&
                          this.isApprovedStatus(this.giftHospitality.approvedByStatus) &&
                          this.isPendingWorkflowStatus(this.giftHospitality.acknowledgedByStatus) &&
                          this.isCurrentAssignee(this.giftHospitality.acknowledgedBy, this.giftHospitality.acknowledgedById);

    this.showApprovalForm = canVerify || canAcknowledge1 || canAcknowledge || canApprove;
  }

  private isCurrentAssignee(
    assignee: string | number | null | undefined,
    legacyId?: string | number | null
  ): boolean {
    const candidates = [getCurrentUserCode(), this.currentUserId]
      .filter((value): value is string => !!value)
      .map((value) => String(value));
    return candidates.includes(String(assignee ?? '')) || candidates.includes(String(legacyId ?? ''));
  }

  private hasCurrentUserIdentity(): boolean {
    return !!getCurrentUserCode() || !!this.currentUserId;
  }

  verify(): void {
    if (!this.giftHospitality) return;

    const comments = prompt('Enter verification comments (optional):') || '';
    this.giftHospitalityService.verify(this.giftHospitality.id, { comments })
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          this.snackBar.open('Request verified successfully', 'Close', { duration: 3000 });
          this.loadGiftHospitality(this.giftHospitality!.id);
        },
        error: (error) => {
          console.error('Error verifying request:', error);
          this.snackBar.open('Error verifying request', 'Close', { duration: 3000 });
        }
      });
  }

  acknowledge(): void {
    if (!this.giftHospitality) return;

    const comments = prompt('Enter acknowledgment comments (optional):') || '';
    this.giftHospitalityService.acknowledge(this.giftHospitality.id, { comments })
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          this.snackBar.open('Request acknowledged successfully', 'Close', { duration: 3000 });
          this.loadGiftHospitality(this.giftHospitality!.id);
        },
        error: (error) => {
          console.error('Error acknowledging request:', error);
          this.snackBar.open('Error acknowledging request', 'Close', { duration: 3000 });
        }
      });
  }

  acknowledge1(): void {
    if (!this.giftHospitality) return;

    const comments = prompt('Enter ACSL acknowledgment comments (optional):') || '';
    this.giftHospitalityService.action(
      this.giftHospitality.id,
      'ims_acknowledged_by_status',
      'approved',
      comments
    )
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          this.snackBar.open('ACSL acknowledgment completed successfully', 'Close', { duration: 3000 });
          this.loadGiftHospitality(this.giftHospitality!.id);
        },
        error: (error) => {
          console.error('Error acknowledging request as ACSL:', error);
          this.snackBar.open('Error processing ACSL acknowledgment', 'Close', { duration: 3000 });
        }
      });
  }

  approve(): void {
    if (!this.giftHospitality) return;

    this.giftHospitalityService.approve(this.giftHospitality.id, {
      approvedDecision: this.approvalDecision,
      comments: this.approvalComments
    })
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          this.snackBar.open(`Request ${this.approvalDecision ? 'approved' : 'rejected'} successfully`, 'Close', { duration: 3000 });
          this.loadGiftHospitality(this.giftHospitality!.id);
          this.showApprovalForm = false;
          this.approvalComments = '';
        },
        error: (error) => {
          console.error('Error approving request:', error);
          this.snackBar.open('Error processing approval', 'Close', { duration: 3000 });
        }
      });
  }

  printRequest(): void {
    if (!this.giftHospitality) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Gift/Hospitality Request - ${this.giftHospitality.id}</title>
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
      void this.waitForPrintWindowSignatureFont(printWindow).then(() => {
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }, 100);
      });
    };
  }

  private getPrintHtml(): string {
    if (!this.giftHospitality) return '';
    const r = this.giftHospitality;
    
    // Combine verification and acknowledgment comments for the first comment section
    const verifiedComment = this.isApprovedStatus(r.verifiedByStatus) ? r.verifiedComments || '' : '';
    const acknowledgedComment = this.isApprovedStatus(r.acknowledgedByStatus) ? r.acknowledgedComments || '' : '';
    const initialComments = [verifiedComment, acknowledgedComment].filter(c => !!c).join('\n');
    const approvedComment = this.isApprovedStatus(r.approvedByStatus) ? r.approvedComments || '' : '';
    
    return `
      <div class="page">
        <header class="page-header">
          <div class="header-left">
            <div class="copies-to">Copies to :</div>
            <div class="company-name">Meinhardt (Thailand) Ltd.</div>
          </div>
          <div class="header-center">
            <div class="circ">Circ:</div>
          </div>
          <div class="header-right">
            <div class="ref-links">CA / MJR / File</div>
            <div class="logo">
              <img src="/erpAsset 2alogo.png" alt="MEINHARDT" />
              <div class="form-no">4 FORM ACGH - 01</div>
            </div>
          </div>
        </header>

        <h1 class="main-title">REQUEST FOR RECEIVING OF GIFT/ HOSPITALITY</h1>

        <div class="form-container">
          <div class="request-type-row">
            <div class="checkbox-group">
              <span class="checkbox">${r.requestType === 'gift' ? '&#9745;' : '&#9744;'}</span>
              <span class="checkbox-label">Gift</span>
            </div>
            <div class="checkbox-group ml-60">
              <span class="checkbox">${r.requestType === 'hospitality' ? '&#9745;' : '&#9744;'}</span>
              <span class="checkbox-label">Hospitality</span>
            </div>
          </div>

          <div class="field-section mt-2">
            <div class="field-label">Description of Gift/ Hospitality:</div>
            <div class="dotted-multi-line">
              ${this.renderMultiLineDots(r.description, 3)}
            </div>
          </div>

          <div class="field-section mt-2">
            <div class="field-label">Purpose of the Gift/ Hospitality giving:</div>
            <div class="dotted-multi-line">
              ${this.renderMultiLineDots(r.purpose, 3)}
            </div>
          </div>

          <div class="field-row mt-4">
            <span class="label">Value of Gift/ Hospitality (THB):</span>
            <span class="value dotted-line">${this.formatCurrencyNoSymbol(r.value)}</span>
          </div>

          <div class="field-row mt-4">
            <span class="label label-fixed-medium">Company of Giver:</span>
            <span class="value dotted-line name-field-medium">${this.escapeHtml(r.companyOfGiver)}</span>
            <div class="date-wrapper">
              <span class="label">Proposed Date:</span>
              <span class="value dotted-line date-field">${this.formatPrintDate(r.proposedDate)}</span>
            </div>
          </div>

          <div class="field-row mt-4">
            <span class="label">MTL's receiving Staff:</span>
            <span class="value dotted-line">${this.escapeHtml(this.getEmployeeLabel(r.mtlReceivingStaffBy))}</span>
          </div>

          <div class="field-row mt-4">
            <span class="label label-fixed">Requested By :</span>
            <span class="value dotted-line name-field">${this.escapeHtml(this.getEmployeeLabel(r.createBy))}</span>
            <div class="date-wrapper">
              <span class="label">Date:</span>
              <span class="value dotted-line date-field">${this.formatPrintDate(r.createdAt)}</span>
            </div>
          </div>

          <div class="field-row mt-4">
            <span class="label label-fixed">Verified By :</span>
            <span class="value dotted-line name-field-with-hint">${this.getApprovedEmployeeSignature(r.verifiedBy, r.verifiedByStatus, r.verifiedByDate)}</span>
            <span class="label-hint">(ACSC)</span>
            <div class="date-wrapper">
              <span class="label">Date:</span>
              <span class="value dotted-line date-field">${this.getApprovedPrintDate(r.verifiedByDate, r.verifiedByStatus)}</span>
            </div>
          </div>

          <div class="field-row mt-4">
            <span class="label label-fixed">Acknowledged By :</span>
            <span class="value dotted-line name-field-with-hint">${this.getApprovedEmployeeSignature(r.acknowledgedBy, r.acknowledgedByStatus, r.acknowledgedByDate)}</span>
            <span class="label-hint">(CA)</span>
            <div class="date-wrapper">
              <span class="label">Date:</span>
              <span class="value dotted-line date-field">${this.getApprovedPrintDate(r.acknowledgedByDate, r.acknowledgedByStatus)}</span>
            </div>
          </div>

          <div class="field-section mt-4">
            <div class="field-label label-fixed">Comments:</div>
            <div class="dotted-multi-line">
              ${this.renderMultiLineDots(initialComments, 2)}
            </div>
          </div>

          <div class="bottom-section mt-4">
            <div class="approval-row">
              <span class="label label-fixed">Approve?</span>
              <div class="checkbox-group ml-10 text-base">
                <span class="checkbox">${r.approvedByStatus === 'approve' ? '&#9745;' : '&#9744;'}</span>
                <span class="label">Yes</span>
              </div>
              <div class="checkbox-group ml-20 text-base">
                <span class="checkbox">${r.approvedByStatus === 'reject' ? '&#9745;' : '&#9744;'}</span>
                <span class="label">No</span>
              </div>
            </div>

            <div class="field-section mt-3">
              <div class="field-label label-fixed">Comments:</div>
              <div class="dotted-multi-line">
                ${this.renderMultiLineDots(approvedComment, 3)}
              </div>
            </div>

            <div class="field-row mt-4">
              <span class="label label-fixed">Approved By :</span>
              <span class="value dotted-line name-field-with-hint">${this.getApprovedEmployeeSignature(r.approvedBy, r.approvedByStatus, r.approvedByDate)}</span>
              <span class="label-hint">(MD/ DI/ TL)</span>
              <div class="date-wrapper">
                <span class="label">Date:</span>
                <span class="value dotted-line date-field">${this.getApprovedPrintDate(r.approvedByDate, r.approvedByStatus)}</span>
              </div>
            </div>
          </div>
        </div>

        <footer class="page-footer">
          <div class="footer-path">Z:\\MR\\MYDOCUMENTS\\IMS DOCUMENT\\STAFF MANUAL\\81AE93AFFACCF50B4D91EAAE7BEDED6B3B19E7EF938F64212EB0B759882B51E11B.DOC/REV.2(DATE: 1 NOVEMBER 2017)/CC/INK/MR</div>
          <div class="footer-page">Page 1 of 1</div>
        </footer>
      </div>
    `;
  }

  private getPrintStyles(): string {
    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      @font-face {
        font-family: 'testimonia-font';
        src: url('/fonts/testimonia/Testimonia-3zp8X.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }
      @page { size: A4; margin: 0; }
      body {
        font-family: 'Arial', sans-serif;
        color: #000;
        background: #fff;
        font-size: 9.5pt;
        line-height: 1.25;
      }
      .page {
        width: 210mm;
        height: 297mm;
        margin: 0 auto;
        padding: 8mm 10mm;
        display: flex;
        flex-direction: column;
        position: relative;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1.5mm;
        font-size: 8.5pt;
      }
      .copies-to { margin-bottom: 2mm; }
      .company-name { font-size: 11pt; font-weight: bold; }
      .header-center { flex: 1; text-align: center; padding-top: 5mm; }
      .header-right { text-align: right; }
      .ref-links { font-size: 9pt; margin-bottom: 1mm; font-weight: bold; }
      .logo { display: flex; flex-direction: column; align-items: flex-end; }
      .logo img { height: 32px; margin-bottom: 1mm; }
      .form-no { font-weight: bold; font-size: 8.5pt; }
      
      .main-title {
        text-align: center;
        font-size: 12pt;
        font-weight: bold;
        color: #1b55a5;
        margin: 2mm 0 4mm 0;
      }

      .form-container {
        border: 1px solid #000;
        padding: 5mm 8mm;
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .request-type-row {
        display: flex;
        margin-bottom: 2mm;
      }
      .checkbox-group {
        display: flex;
        align-items: center;
        gap: 3mm;
      }
      .checkbox {
        font-size: 16pt;
        line-height: 1;
        width: 14pt;
        height: 14pt;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      
      .field-section { width: 100%; }
      .field-label { margin-bottom: 1mm; }
      .field-row {
        display: flex;
        align-items: flex-end;
        width: 100%;
      }
      .label { white-space: nowrap; }
      .label-fixed { min-width: 32mm; display: inline-block; }
      .label-fixed-medium { min-width: 40mm; display: inline-block; }
      .label-hint { font-size: 9pt; margin-left: 1mm; min-width: 25mm; }
      .value {
        flex: 1;
        padding: 0 1mm;
        min-height: 1.3em;
        position: relative;
        top: 1px;
      }
      .dotted-line {
        border-bottom: 1px dotted #777;
      }
      .dotted-multi-line { width: 100%; }
      .dot-line-wrap {
        width: 100%;
        border-bottom: 1px dotted #777;
        min-height: 1.6em;
        position: relative;
      }
      .line-content {
        position: absolute;
        bottom: 1px;
        left: 0;
        width: 100%;
      }

      .name-field { flex: 1; }
      .name-field-medium { flex: 0 1 80mm; }
      .name-field-with-hint {
        flex: 0 1 70mm;
        position: relative;
        display: block;
        min-height: 22px;
        overflow: visible;
        padding-bottom: 1px;
      }
      .signature-print-block {
        position: absolute;
        left: 50%;
        bottom: 2px;
        display: flex;
        min-width: 34mm;
        max-width: 100%;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        isolation: isolate;
        line-height: 1;
        transform: translateX(-50%);
        pointer-events: none;
      }
      .signature-watermark {
        position: absolute;
        left: 52%;
        right: auto;
        bottom: 1.1mm;
        z-index: 0;
        width: 4.5mm;
        height: 4.5mm;
        display: block;
        object-fit: contain;
        opacity: 0.09;
        transform: translateX(-50%);
        pointer-events: none;
      }
      .signature-name {
        position: relative;
        z-index: 1;
        font-family: 'testimonia-font', cursive;
        font-size: 22px;
        font-weight: 700;
        line-height: 0.78;
        color: #174ea6;
        white-space: nowrap;
      }
      .signature-id {
        position: relative;
        z-index: 1;
        margin-top: -1px;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        color: #174ea6;
        white-space: nowrap;
      }
      .date-wrapper {
        display: flex;
        align-items: flex-end;
        min-width: 50mm;
        margin-left: 4mm;
      }
      .date-field { flex: 0 0 35mm; }

      .bottom-section {
        margin-top: auto;
        padding-top: 4mm;
      }
      .approval-row {
        display: flex;
        align-items: center;
      }

      .page-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding-top: 2mm;
        font-size: 6pt;
        color: #000;
        font-family: 'Arial Narrow', sans-serif;
      }
      .footer-path { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-right: 10mm; }
      .footer-page { margin-left: 10mm; }

      .ml-10 { margin-left: 10mm; }
      .ml-20 { margin-left: 20mm; }
      .ml-40 { margin-left: 40mm; }
      .ml-60 { margin-left: 60mm; }
      .mt-1 { margin-top: 1mm; }
      .mt-2 { margin-top: 2mm; }
      .mt-3 { margin-top: 3mm; }
      .mt-4 { margin-top: 4mm; }
      .mt-6 { margin-top: 6mm; }
      .text-left { text-align: left; }
      .font-bold { font-weight: bold; }
      
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { margin: 0; border: none; padding: 10mm; }
      }
    `;
  }

  private renderMultiLineDots(text: string | null | undefined, minLines: number): string {
    const content = text || '';
    const lines = content.split('\n');
    let html = '';
    for (let i = 0; i < Math.max(lines.length, minLines); i++) {
        const lineText = lines[i] || '';
        html += `<div class="dot-line-wrap"><span class="line-content">${this.escapeHtml(lineText)}</span></div>`;
    }
    return html;
  }

  private formatPrintDate(dateString: string | null | undefined): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = `${date.getDate()}`.padStart(2, '0');
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private getApprovedEmployeeLabel(ref: string | number | null | undefined, status: string | null | undefined): string {
    return this.isApprovedStatus(status) ? this.getEmployeeLabel(ref) : '';
  }

  private getApprovedEmployeeSignature(
    ref: string | number | null | undefined,
    status: string | null | undefined,
    actionDate: string | null | undefined
  ): string {
    return this.isApprovedStatus(status) ? this.getSignaturePrintValue(ref, actionDate) : '';
  }

  private getSignaturePrintValue(
    ref: string | number | null | undefined,
    actionDate: string | Date | null | undefined
  ): string {
    const fallbackName = this.getEmployeeNameForSignature(ref);
    return getSignaturePrintHtml(ref, actionDate, {
      activeSignatureSettings: this.activeSignatureSettings,
      employeeLookup: this.employeeLookup,
      fallbackName,
    }) || this.getFallbackSignaturePrintHtml(fallbackName, ref, actionDate);
  }

  private getFallbackSignaturePrintHtml(
    fallbackName: string,
    ref: string | number | null | undefined,
    actionDate: string | Date | null | undefined
  ): string {
    if (!fallbackName) {
      return '';
    }

    const signId = formatPoSignatureId(ref, actionDate);
    return `
      <span class="signature-print-block">
        <img class="signature-watermark" src="/favicon-32x32.png" alt="" />
        <span class="signature-name">${escapeSignatureHtml(fallbackName)}</span>
        ${signId ? `<span class="signature-id">${escapeSignatureHtml(signId)}</span>` : ''}
      </span>
    `;
  }

  private getEmployeeNameForSignature(ref: string | number | null | undefined): string {
    const label = this.getEmployeeLabel(ref);
    if (!label || label === '-') {
      return '';
    }

    const labelWithoutTitle = label.split('|')[0].trim();
    const nameParts = labelWithoutTitle.split(',');
    if (nameParts.length > 1) {
      return nameParts.slice(1).join(',').trim();
    }

    return labelWithoutTitle;
  }

  private getApprovedPrintDate(value: string | null | undefined, status: string | null | undefined): string {
    return this.isApprovedStatus(status) ? this.formatPrintDate(value) : '';
  }

  private isApprovedStatus(status: string | null | undefined): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'approve' || normalized === 'approved';
  }

  private isPendingWorkflowStatus(status: string | null | undefined): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === '' || normalized === 'pending';
  }

  private async waitForPrintWindowSignatureFont(printWindow: Window): Promise<void> {
    const fonts = printWindow.document.fonts;
    if (!fonts?.load) {
      return;
    }

    try {
      await Promise.all([
        fonts.load('18px testimonia-font'),
        fonts.ready,
      ]);
    } catch {
      // Continue printing if the browser cannot report font readiness.
    }
  }

  private formatCurrencyNoSymbol(amount: number | null | undefined): string {
    if (amount === null || amount === undefined) return '0.00';
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
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

  onEdit(): void {
    if (this.giftHospitality) {
      this.router.navigate(['/gift-hospitality/edit', this.giftHospitality.id]);
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'verified':
        return 'bg-blue-100 text-blue-800';
      case 'acknowledged':
        return 'bg-purple-100 text-purple-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getDisplayStatus(): string {
    if (!this.giftHospitality) {
      return 'pending';
    }

    const statuses = [
      this.giftHospitality.verifiedByStatus,
      this.giftHospitality.imsAcknowledgedByStatus,
      this.giftHospitality.approvedByStatus,
      this.giftHospitality.acknowledgedByStatus,
    ];

    const normalized = statuses
      .filter((status) => !!status)
      .map((status) => String(status).toLowerCase());

    if (normalized.some((status) => status === 'reject' || status === 'rejected')) {
      return 'rejected';
    }

    if (
      statuses.every((status) => {
        const value = (status || '').toLowerCase();
        return value === 'approve' || value === 'approved';
      })
    ) {
      return 'approved';
    }

    return this.giftHospitality.status || 'pending';
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'verified':
        return 'Verified';
      case 'acknowledged':
        return 'Acknowledged';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
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
      case 'reject':
      case 'rejected':
        return 'Rejected';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
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
      case 'reject':
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getRequestTypeText(type: string): string {
    return type === 'gift' ? 'Gift' : 'Hospitality';
  }

  isRequestTypeSelected(type: 'gift' | 'hospitality'): boolean {
    return this.giftHospitality?.requestType === type;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }

  formatDate(dateString: string | null | undefined): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string | null | undefined): string {
    return formatDateTimeDisplay(dateString);
  }

  get workflowSteps(): ApprovalWorkflowStep[] {
    if (!this.giftHospitality) return [];

    return [
      {
        key: 'verify',
        title: 'ACSC Verification',
        assignee: this.getEmployeeLabel(this.giftHospitality.verifiedBy) || '-',
        date: this.formatDateTime(this.giftHospitality.verifiedByDate) || '-',
        status: this.giftHospitality.verifiedByStatus,
        actionLabel: 'Verify Request',
        actionColor: 'primary',
        showAction: this.getCurrentAction() === 'verify'
      },
      {
        key: 'ims',
        title: 'Acknowledge 1 (ACSL)',
        assignee: this.getEmployeeLabel(this.giftHospitality.imsAcknowledgedBy) || '-',
        date: this.formatDateTime(this.giftHospitality.imsAcknowledgedByDate) || '-',
        status: this.giftHospitality.imsAcknowledgedByStatus,
        actionLabel: 'Acknowledge Request',
        actionColor: 'accent',
        showAction: this.getCurrentAction() === 'ims'
      },
      {
        key: 'approve',
        title: 'TL/DI/MD Approval',
        assignee: this.getEmployeeLabel(this.giftHospitality.approvedBy) || '-',
        date: this.formatDateTime(this.giftHospitality.approvedByDate) || '-',
        status: this.giftHospitality.approvedByStatus,
        actionLabel: 'Approve Request',
        actionColor: 'success',
        showAction: this.getCurrentAction() === 'approve'
      },
      {
        key: 'acknowledge',
        title: 'Acknowledge 2 (Accounts CA)',
        assignee: this.getEmployeeLabel(this.giftHospitality.acknowledgedBy) || '-',
        date: this.formatDateTime(this.giftHospitality.acknowledgedByDate) || '-',
        status: this.giftHospitality.acknowledgedByStatus,
        actionLabel: 'Acknowledge Request',
        actionColor: 'accent',
        showAction: this.getCurrentAction() === 'acknowledge'
      }
    ];
  }

  onWorkflowAction(stepKey: string): void {
    switch (stepKey) {
      case 'verify':
        this.verify();
        break;
      case 'acknowledge':
        this.acknowledge();
        break;
      case 'ims':
        this.acknowledge1();
        break;
      case 'approve':
        this.approve();
        break;
    }
  }


    getCurrentAction(): string {
    if (!this.giftHospitality || !this.hasCurrentUserIdentity()) return '';

    if (this.isPendingWorkflowStatus(this.giftHospitality.verifiedByStatus) && this.isCurrentAssignee(this.giftHospitality.verifiedBy, this.giftHospitality.verifiedById)) {
      return 'verify';
    }
    if (this.isApprovedStatus(this.giftHospitality.verifiedByStatus) &&
        this.isPendingWorkflowStatus(this.giftHospitality.imsAcknowledgedByStatus) &&
        this.isCurrentAssignee(this.giftHospitality.imsAcknowledgedBy)) {
      return 'ims';
    }
    if (this.isApprovedStatus(this.giftHospitality.verifiedByStatus) &&
        this.isApprovedStatus(this.giftHospitality.imsAcknowledgedByStatus) &&
        this.isPendingWorkflowStatus(this.giftHospitality.approvedByStatus) &&
        this.isCurrentAssignee(this.giftHospitality.approvedBy, this.giftHospitality.approvedById)) {
      return 'approve';
    }
    if (this.isApprovedStatus(this.giftHospitality.verifiedByStatus) &&
        this.isApprovedStatus(this.giftHospitality.imsAcknowledgedByStatus) &&
        this.isApprovedStatus(this.giftHospitality.approvedByStatus) &&
        this.isPendingWorkflowStatus(this.giftHospitality.acknowledgedByStatus) &&
        this.isCurrentAssignee(this.giftHospitality.acknowledgedBy, this.giftHospitality.acknowledgedById)) {
      return 'acknowledge';
    }
    return '';
  }

  getWorkflowIcon(status: string | null | undefined): string {
    if (!status) return 'schedule';
    switch (status.toLowerCase()) {
      case 'approved':
      case 'approve': return 'check';
      case 'rejected':
      case 'reject': return 'close';
      default: return 'schedule';
    }
  }

  getWorkflowIconClass(status: string | null | undefined): string {
    if (!status) return 'text-yellow-600 dark:text-yellow-400';
    switch (status.toLowerCase()) {
      case 'approved':
      case 'approve': return 'text-green-600 dark:text-green-400';
      case 'rejected':
      case 'reject': return 'text-red-600 dark:text-red-400';
      default: return 'text-yellow-600 dark:text-yellow-400';
    }
  }

  private buildAttachments(raw: unknown): Array<{ name: string; url: string }> {
    if (Array.isArray(raw)) {
      return raw.map((item: any) => {
        const path = typeof item === 'string' ? item : (item?.url || item?.path || '');
        if (!path) return null;
        const url = getAttachmentUrl(path);
        return {
          name: path.split('/').pop() || path,
          url,
        };
      }).filter(Boolean);
    }
    return [];
  }
}
