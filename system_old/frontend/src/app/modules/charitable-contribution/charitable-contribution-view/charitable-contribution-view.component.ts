import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap, takeUntil, Subject } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { CharitableContributionService } from 'app/core/services/charitable-contribution.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { SignatureSetting, SignatureSettingService } from 'app/core/services/signature-setting.service';
import { CharitableContribution, FormStatus, RequestType, ApprovalDecision } from 'app/core/models/charitable-contribution.model';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { ApprovalWorkflowComponent, ApprovalWorkflowStep } from 'app/core/components/approval-workflow';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import {
    escapeSignatureHtml,
    formatPoSignatureId,
    getSignatureLookupRefsFromValues,
    getSignaturePrintHtml,
} from 'app/core/utils/signature-print.util';

@Component({
    selector: 'app-charitable-contribution-view',
    standalone: true,
    imports: [
        CommonModule,
        MatButtonModule,
        MatCardModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatChipsModule,
        MatDividerModule,
        FuseAlertComponent,
        ApprovalWorkflowComponent,
        ViewActionsComponent
    ],
    templateUrl: './charitable-contribution-view.component.html',
    styleUrls: ['./charitable-contribution-view.component.scss']
})
export class CharitableContributionViewComponent implements OnInit, OnDestroy {
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    readonly requestTypes = [
        { value: RequestType.CHARITABLE_CONTRIBUTION, label: 'Charitable Contribution' },
        { value: RequestType.SPONSORSHIP, label: 'Sponsorship' }
    ] as const;

    request: CharitableContribution | null = null;
    loading = false;
    showAlert = false;
    alert: { type: FuseAlertType; message: string } = {
        type: 'success',
        message: ''
    };
    
    // Expose enums to template
    FormStatus = FormStatus;
    RequestType = RequestType;
    ApprovalDecision = ApprovalDecision;

    /** Map employee code -> standardized display name for Workflow Status */
    private employeeLookup = new Map<string, string>();
    private employeeLookupWithTitle = new Map<string, string>();
    private activeSignatureSettings = new Map<string, SignatureSetting>();

    constructor(
        private route: ActivatedRoute,
        public router: Router,
        private charitableContributionService: CharitableContributionService,
        private employeeService: EmployeeService,
        private signatureSettingService: SignatureSettingService
    ) {}

    ngOnInit(): void {
        this.loadRequest();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    loadRequest(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (!id) {
            this.router.navigate(['/charitable-contributions']);
            return;
        }

        this.loading = true;
        forkJoin({
            contribution: this.charitableContributionService.findOne(id),
            employeeLookup: this.employeeService.getEmployeeLookupMap(),
            employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
        }).pipe(
            switchMap(({ contribution, employeeLookup, employeeLookupWithTitle }) => {
                const codes = [
                    contribution.acscBy,
                    contribution.acslBy,
                    contribution.imsAcknowledgedBy,
                    contribution.approverBy,
                    contribution.approverBy2,
                    contribution.createBy,
                    contribution.updateBy
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
                                contribution,
                                employeeLookup: lookups.employeeLookup,
                                employeeLookupWithTitle: lookups.employeeLookupWithTitle,
                                activeSignatureSettings,
                            }))
                        );
                    })
                );
            }),
            takeUntil(this._unsubscribeAll)
        ).subscribe({
            next: ({ contribution, employeeLookup, employeeLookupWithTitle, activeSignatureSettings }) => {
                this.request = contribution;
                this.employeeLookup = employeeLookup;
                this.employeeLookupWithTitle = employeeLookupWithTitle;
                this.activeSignatureSettings = activeSignatureSettings;
                this.loading = false;
            },
            error: (error) => {
                this.loading = false;
                this.showAlert = true;
                this.alert = {
                    type: 'error',
                    message: 'Failed to load request details. Please try again.'
                };
            }
        });
    }

    /** แสดงผู้อนุมัติในรูปแบบ standardized lookup */
    getApproverDisplayLabel(code: string | number | null | undefined): string {
        const employee = this.request?.workflowEmployeeNames?.[String(code ?? '').trim()];
        if (employee?.name) return employee.name;
        return this.employeeService.formatEmployeeReference(code, this.employeeLookup, '-');
    }

    getRequestTypeLabel(type: RequestType): string {
        return type === RequestType.CHARITABLE_CONTRIBUTION ? 'Charitable Contribution' : 'Sponsorship';
    }

    getStatusLabel(status: FormStatus): string {
        const statusLabels: { [key in FormStatus]: string } = {
            [FormStatus.DRAFT]: 'Draft',
            [FormStatus.SUBMITTED]: 'Submitted',
            [FormStatus.VERIFIED]: 'Verified',
            [FormStatus.ACKNOWLEDGED]: 'Acknowledged',
            [FormStatus.APPROVED]: 'Approved',
            [FormStatus.REJECTED]: 'Rejected',
            [FormStatus.COMPLETED]: 'Completed'
        };
        return statusLabels[status] || status;
    }

    getStatusColor(status: FormStatus): string {
        const statusColors: { [key in FormStatus]: string } = {
            [FormStatus.DRAFT]: 'bg-gray-100 text-gray-800',
            [FormStatus.SUBMITTED]: 'bg-blue-100 text-blue-800',
            [FormStatus.VERIFIED]: 'bg-yellow-100 text-yellow-800',
            [FormStatus.ACKNOWLEDGED]: 'bg-orange-100 text-orange-800',
            [FormStatus.APPROVED]: 'bg-green-100 text-green-800',
            [FormStatus.REJECTED]: 'bg-red-100 text-red-800',
            [FormStatus.COMPLETED]: 'bg-green-100 text-green-800'
        };
        return statusColors[status] || 'bg-gray-100 text-gray-800';
    }

    getApprovalDecisionLabel(decision: ApprovalDecision): string {
        return decision === ApprovalDecision.APPROVED ? 'Approved' : 'Rejected';
    }

    getApprovalDecisionColor(decision: ApprovalDecision): string {
        return decision === ApprovalDecision.APPROVED ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
    }

    formatCurrency(amount: number, currencyCode: string | null | undefined = 'THB'): string {
        return new Intl.NumberFormat('th-TH', {
            style: 'currency',
            currency: currencyCode || 'THB'
        }).format(amount);
    }

    formatDate(dateString: string | null | undefined): string {
        return formatDateDisplay(dateString);
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

    canEdit(): boolean {
        return this.request?.status === FormStatus.DRAFT;
    }

    editRequest(): void {
        this.router.navigate(['/charitable-contributions/edit', this.request?.id]);
    }

    backToList(): void {
        this.router.navigate(['/charitable-contributions']);
    }

    printRequest(): void {
        if (!this.request) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Charitable Contribution / Sponsorship - ${this.request.id}</title>
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
        if (!this.request) return '';
        const r = this.request;
        const totalAmount = (r.valueAmount || 0) + (r.vatAmount || 0);

        // Find comments from history
        const acknowledgedComment = this.isApprovedStatus(r.acslByStatus)
            ? this.getWorkflowComment('acknowledged') || this.getWorkflowComment('acknowledge') || ''
            : '';
        const approvedComment = this.isApprovedStatus(r.approverByStatus)
            ? this.getWorkflowComment('approved') || this.getWorkflowComment('approve') || ''
            : '';

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
                        <div class="ref-links">/ CA / MJR / File</div>
                        <div class="logo">
                            <img src="/erpAsset 2alogo.png" alt="MEINHARDT" />
                            <div class="form-no">1 FORM ACCC - 01</div>
                        </div>
                    </div>
                </header>

                <h1 class="main-title">REQUEST FOR CHARITABLE CONTRIBUTION/ SPONSORSHIP</h1>

                <div class="form-container">
                    <div class="request-type-row">
                        <div class="checkbox-group">
                            <span class="checkbox">${r.requestType === RequestType.CHARITABLE_CONTRIBUTION ? '&#9745;' : '&#9744;'}</span>
                            <span class="checkbox-label">Charitable Contribution</span>
                        </div>
                        <div class="checkbox-group ml-40">
                            <span class="checkbox">${r.requestType === RequestType.SPONSORSHIP ? '&#9745;' : '&#9744;'}</span>
                            <span class="checkbox-label">Sponsorship</span>
                        </div>
                    </div>

                    <div class="field-section mt-4">
                        <div class="field-label">Description of Event:</div>
                        <div class="dotted-multi-line">
                            ${this.renderMultiLineDots(r.eventDescription, 4)}
                        </div>
                    </div>

                    <div class="field-section mt-2">
                        <div class="field-label">Purpose of Event:</div>
                        <div class="dotted-multi-line">
                            ${this.renderMultiLineDots(r.eventPurpose, 4)}
                        </div>
                    </div>

                    <div class="field-row mt-6">
                        <span class="label">Name of Organizer of Event or Sponsorship Receiver:</span>
                        <span class="value dotted-line">${this.escapeHtml(r.organizerName)}</span>
                    </div>

                    <div class="field-row mt-4">
                        <span class="label">Description of Charitable Contribution or Sponsorship:</span>
                        <span class="value dotted-line">${this.escapeHtml(r.contributionDescription)}</span>
                    </div>

                    <div class="field-row mt-6">
                        <span class="label">Value of Charitable Contribution or Sponsorship (${this.escapeHtml(r.currencyCode || 'THB')}):</span>
                        <span class="value dotted-line">${this.formatCurrencyNoSymbol(r.valueAmount)}</span>
                    </div>

                    <div class="field-row mt-4">
                        <span class="label">Proposed Date:</span>
                        <span class="value dotted-line date-field">${this.formatPrintDate(r.proposedDate)}</span>
                    </div>

                    <div class="field-row mt-6">
                        <span class="label label-fixed">Requested By :</span>
                        <span class="value dotted-line name-field">${this.escapeHtml(this.getApproverDisplayLabel(r.createBy))}</span>
                        <div class="date-wrapper">
                            <span class="label">Date:</span>
                            <span class="value dotted-line date-field">${this.formatPrintDate(r.createdAt)}</span>
                        </div>
                    </div>

                    <div class="field-row mt-4">
                        <span class="label label-fixed">Verified By :</span>
                        <span class="value dotted-line name-field-with-hint">${this.getApprovedApproverSignature(r.acscBy, r.acscByStatus, r.acscByDate)}</span>
                        <span class="label-hint">(ACSC)</span>
                        <div class="date-wrapper">
                            <span class="label">Date:</span>
                            <span class="value dotted-line date-field">${this.getApprovedPrintDate(r.acscByDate, r.acscByStatus)}</span>
                        </div>
                    </div>

                    <div class="field-row mt-4">
                        <span class="label label-fixed">Acknowledged By :</span>
                        <span class="value dotted-line name-field-with-hint">${this.getApprovedApproverSignature(r.acslBy, r.acslByStatus, r.acslByDate)}</span>
                        <span class="label-hint">(CA)</span>
                        <div class="date-wrapper">
                            <span class="label">Date:</span>
                            <span class="value dotted-line date-field">${this.getApprovedPrintDate(r.acslByDate, r.acslByStatus)}</span>
                        </div>
                    </div>

                    <div class="field-row mt-6">
                        <span class="label label-fixed">Comments:</span>
                        <span class="value dotted-line">${this.escapeHtml(acknowledgedComment)}</span>
                    </div>

                    <div class="bottom-section mt-4">
                        <div class="approval-row">
                            <span class="label label-fixed">Approve?</span>
                            <div class="checkbox-group ml-10 text-base">
                                <span class="checkbox">${r.approverByStatus?.startsWith('approve') ? '&#9745;' : '&#9744;'}</span>
                                <span class="label">Yes</span>
                            </div>
                            <div class="checkbox-group ml-20 text-base">
                                <span class="checkbox">${r.approverByStatus?.startsWith('reject') ? '&#9745;' : '&#9744;'}</span>
                                <span class="label">No</span>
                            </div>
                        </div>

                        <div class="field-section mt-4">
                            <div class="field-label label-fixed">Comments:</div>
                            <div class="dotted-multi-line">
                                ${this.renderMultiLineDots(approvedComment, 3)}
                            </div>
                        </div>

                        <div class="field-row mt-6">
                            <span class="label label-fixed">Approved By :</span>
                            <span class="value dotted-line name-field-with-hint">${this.getApprovedApproverSignature(r.approverBy, r.approverByStatus, r.approverByDate)}</span>
                            <span class="label-hint">(MD/ DI)</span>
                            <div class="date-wrapper">
                                <span class="label">Date:</span>
                                <span class="value dotted-line date-field">${this.getApprovedPrintDate(r.approverByDate, r.approverByStatus)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <footer class="page-footer">
                    <div class="footer-path">2 /MR/MYDOCUMENTS/IMS DOCUMENT/STAFF MANUAL/8A2AF7D2BE6F7BA692E231F8BE7EC7FAF2934887DD541E255C47659271650AE2.DOC/REV.E(15/05/2022)/CC/ANS</div>
                    <div class="footer-page">Page 1 of 1</div>
                </footer>
            </div>
        `;
    }

    private getPrintStyles(): string {
        return `
            @font-face {
                font-family: 'testimonia-font';
                src: url('/fonts/testimonia/Testimonia-3zp8X.ttf') format('truetype');
                font-weight: normal;
                font-style: normal;
                font-display: swap;
            }
            
            * { box-sizing: border-box; margin: 0; padding: 0; }
            @page { size: A4; margin: 0; }
            body {
                font-family: 'Arial', sans-serif;
                color: #000;
                background: #fff;
                font-size: 10pt;
                line-height: 1.3;
            }
            .page {
                width: 210mm;
                height: 297mm;
                margin: 0 auto;
                padding: 10mm 12mm;
                display: flex;
                flex-direction: column;
                position: relative;
            }
            header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 2mm;
                font-size: 9pt;
            }
            .copies-to { margin-bottom: 2mm; }
            .company-name { font-size: 11pt; font-weight: bold; }
            .header-center { flex: 1; text-align: center; padding-top: 10mm; }
            .header-right { text-align: right; }
            .ref-links { font-size: 8pt; margin-bottom: 1mm; }
            .logo { display: flex; flex-direction: column; align-items: flex-end; }
            .logo img { height: 35px; margin-bottom: 1mm; }
            .form-no { font-weight: bold; font-size: 8.5pt; }
            
            .main-title {
                text-align: center;
                font-size: 12pt;
                font-weight: bold;
                color: #1b55a5;
                margin: 4mm 0 8mm 0;
                text-decoration: none;
            }

            .form-container {
                border: 1px solid #000;
                padding: 6mm 10mm;
                flex: 1;
            }

            .request-type-row {
                display: flex;
                margin-bottom: 4mm;
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
            .field-label { margin-bottom: 2mm; }
            .field-row {
                display: flex;
                align-items: flex-end;
                width: 100%;
            }
            .label { white-space: nowrap; }
            .label-fixed { min-width: 35mm; display: inline-block; }
            .label-hint { font-size: 9pt; margin-left: 1mm; min-width: 15mm; }
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
            .name-field-with-hint {
                flex: 0 1 75mm;
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
                min-width: 55mm;
                margin-left: 4mm;
            }
            .date-field { flex: 0 0 40mm; }

            .bottom-section {
                border-top: 0px solid #000;
                padding-top: 2mm;
            }
            .approval-row {
                display: flex;
                align-items: center;
            }

            .page-footer {
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                padding-top: 3mm;
                font-size: 6.5pt;
                color: #555;
            }
            .footer-path { max-width: 170mm; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }

            .ml-10 { margin-left: 10mm; }
            .ml-20 { margin-left: 20mm; }
            .ml-40 { margin-left: 40mm; }
            .ml-60 { margin-left: 60mm; }
            .mt-2 { margin-top: 2mm; }
            .mt-4 { margin-top: 4mm; }
            .mt-6 { margin-top: 6mm; }
            .text-left { text-align: left; }
            .font-bold { font-weight: bold; }
            
            @media print {
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .page { margin: 0; border: none; }
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

    private getApprovedApproverDisplayLabel(code: string | null | undefined, status: string | null | undefined): string {
        return this.isApprovedStatus(status) ? this.getApproverDisplayLabel(code) : '';
    }

    private getApprovedApproverSignature(
        code: string | null | undefined,
        status: string | null | undefined,
        actionDate: string | null | undefined
    ): string {
        return this.isApprovedStatus(status) ? this.getSignaturePrintValue(code, actionDate) : '';
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
        const label = this.getApproverDisplayLabel(ref);
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

    private getApprovedPrintDate(dateString: string | null | undefined, status: string | null | undefined): string {
        return this.isApprovedStatus(status) ? this.formatPrintDate(dateString) : '';
    }

    private isApprovedStatus(status: string | null | undefined): boolean {
        const normalized = String(status || '').trim().toLowerCase();
        return normalized === 'approve' || normalized === 'approved';
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

    private getWorkflowComment(status: string): string | null {
        if (!this.request?.approvalHistory) return null;
        const history = [...this.request.approvalHistory].reverse();
        const entry = history.find(h => h.status?.toLowerCase() === status.toLowerCase() || h.action?.toLowerCase().includes(status.toLowerCase()));
        return entry?.comments || null;
    }

    getTotalAmount(): number {
        return (this.request?.valueAmount || 0) + (this.request?.vatAmount || 0);
    }

    isRequestTypeSelected(type: RequestType): boolean {
        return this.request?.requestType === type;
    }

    get workflowSteps(): ApprovalWorkflowStep[] {
        if (!this.request) return [];

        const steps: ApprovalWorkflowStep[] = [
            {
                key: 'request',
                title: 'Request (EE and above)',
                assignee: this.getApproverDisplayLabel(this.request.createBy),
                date: this.formatDateTime(this.request.createdAt),
                status: 'submitted'
            },
            {
                key: 'acsc',
                title: 'Verify (ACSC)',
                assignee: this.getApproverDisplayLabel(this.request.acscBy),
                date: this.formatDateTime(this.request.acscByDate),
                status: this.request.acscByStatus
            },
            {
                key: 'acsl',
                title: 'Acknowledge 1 (ACSL)',
                assignee: this.getApproverDisplayLabel(this.request.imsAcknowledgedBy),
                date: this.formatDateTime(this.request.imsAcknowledgedByDate),
                status: this.request.imsAcknowledgedBy
                    ? this.request.imsAcknowledgedByStatus
                    : 'unassigned'
            },
            {
                key: 'approver',
                title: 'Approve (DI/MD)',
                assignee: this.getApproverDisplayLabel(this.request.approverBy),
                date: this.formatDateTime(this.request.approverByDate),
                status: this.request.approverByStatus
            }
        ];

        if (this.request.approverBy2) {
            steps.push({
                key: 'approver2',
                title: 'Approve 2 (DI)',
                assignee: this.getApproverDisplayLabel(this.request.approverBy2),
                date: this.formatDateTime(this.request.approverBy2Date),
                status: this.request.approverBy2Status
            });
        }

        steps.push({
            key: 'accounts',
            title: 'Acknowledge 2 (CA - JN)',
            assignee: this.getApproverDisplayLabel(this.request.acslBy),
            date: this.formatDateTime(this.request.acslByDate),
            status: this.request.acslByStatus
        });

        return steps;
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
}
