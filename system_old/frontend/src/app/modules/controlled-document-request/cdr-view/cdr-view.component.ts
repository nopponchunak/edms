import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { ControlledDocumentRequestService } from 'app/core/services/controlled-document-request.service';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ApprovalWorkflowComponent, ApprovalWorkflowStep } from 'app/core/components/approval-workflow';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
    selector: 'app-cdr-view',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
        MatCardModule,
        MatProgressSpinnerModule,
        MatChipsModule,
        FuseAlertComponent,
        ApprovalWorkflowComponent,
        ViewActionsComponent,
        MatTooltipModule
    ],
    templateUrl: './cdr-view.component.html',
    styleUrls: ['./cdr-view.component.scss']
})
export class CdrViewComponent implements OnInit, OnDestroy {
    readonly categoryOptions = [
        { value: 'ims', label: 'IMS Documentation' },
        { value: 'acp', label: 'ACP Documentation' },
        { value: 'master_tech_specs', label: 'Master Technical Specifications' },
        { value: 'anti_corruption', label: 'Anti-Corruption Programme Booklet' },
        { value: 'other', label: 'Other' }
    ] as const;

    readonly requestForOptions = [
        { value: 'addition', label: 'Addition' },
        { value: 'amendment', label: 'Amendment' },
        { value: 'deletion', label: 'Deletion' },
        { value: 'copy', label: 'A copy' }
    ] as const;

    id: string | null = null;
    request: any = null;
    selectedCategories = new Set<string>();
    selectedRequestFor = new Set<string>();
    categoryViewOptions: Array<{ value: string; label: string; checked: boolean }> = [];
    requestForViewOptions: Array<{ value: string; label: string; checked: boolean }> = [];
    attachments: any[] = [];
    otherCategoryText = '-';
    showOtherCategory = false;
    statusClass = 'bg-yellow-100 text-yellow-800';
    isLoading = false;
    alert: { type: FuseAlertType; message: string } | null = null;
    employeeLookup = new Map<string, string>();
    employeeLookupWithTitle = new Map<string, string>();

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private cdrService: ControlledDocumentRequestService,
        private employeeService: EmployeeService
    ) {}

    ngOnInit(): void {
        this.id = this.route.snapshot.paramMap.get('id');
        if (this.id) {
            this.loadRequest();
        } else {
            this.router.navigate(['/controlled-document-request/list']);
        }
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    private loadRequest(): void {
        if (!this.id) return;

        this.isLoading = true;
        forkJoin({
            request: this.cdrService.findOne(this.id),
            employeeLookup: this.employeeService.getEmployeeLookupMap(),
            employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
        })
            .pipe(
                switchMap(({ request, employeeLookup, employeeLookupWithTitle }) => {
                    const req = request as any;
                    const data = (req.status !== undefined && req.data) ? req.data : req;
                    const codes = [
                        data.reviewed_by,
                        data.approved_by,
                        data.acknowledged_by,
                        data.requested_by,
                        data.create_by,
                        data.update_by,
                        data.acknowledged_by_2,
                        data.reviewed_by_2,
                        data.approved_by_2
                    ].filter(code => !!code);
                    return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
                        switchMap(updatedLookup => {
                            return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
                                map(updatedLookupWithTitle => ({ response: request, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
                            );
                        })
                    );
                }),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe({
                next: ({ response, employeeLookup, employeeLookupWithTitle }) => {
                    this.employeeLookup = employeeLookup;
                    this.employeeLookupWithTitle = employeeLookupWithTitle;
                    // Handle both response formats: { status, data } or direct data
                    if ((response as any).status !== undefined && (response as any).data) {
                        this.request = (response as any).data;
                    } else {
                        this.request = response;
                    }
                    this.selectedCategories = new Set(this.parseCsvValues((this.request as any)?.categories));
                    this.selectedRequestFor = new Set(this.parseCsvValues((this.request as any)?.request_for));
                    this.categoryViewOptions = this.categoryOptions.map(option => ({
                        ...option,
                        checked: this.selectedCategories.has(option.value)
                    }));
                    this.requestForViewOptions = this.requestForOptions.map(option => ({
                        ...option,
                        checked: this.selectedRequestFor.has(option.value)
                    }));
                    this.attachments = this.getAttachmentsFromRequest(this.request);
                    this.otherCategoryText = this.request?.other_text || this.request?.otherText || '-';
                    this.showOtherCategory = this.selectedCategories.has('other') || this.otherCategoryText !== '-';
                    this.statusClass = this.getStatusColor(this.request?.status);
                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Error loading request:', error);
                    this.alert = {
                        type: 'error',
                        message: error?.error?.message || 'Failed to load request. Please try again.'
                    };
                    this.isLoading = false;
                }
            });
    }

    getEmployeeLabel(ref: string | number | null | undefined): string {
        return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
    }

    getRecipientLabels(value: string | null | undefined): string {
        if (!value) return '-';
        return value
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
            .map(code => this.getEmployeeLabel(code))
            .join(', ');
    }

    formatDate(dateString: string | null | undefined | Date): string {
        return formatDateDisplay(dateString);
    }

    formatDateTime(dateString: string | null | undefined | Date): string {
        return formatDateTimeDisplay(dateString);
    }

    getCategoriesText(categories: string | null | undefined): string {
        if (!categories) return '-';
        const cats = categories.split(',').map(c => c.trim());
        const labels: { [key: string]: string } = {
            'ims': 'IMS',
            'acp': 'ACP',
            'master_tech_specs': 'Master Tech Specs',
            'anti_corruption': 'Anti-Corruption'
        };
        return cats.map(c => labels[c] || c).join(', ');
    }

    getRequestForText(requestFor: string | null | undefined): string {
        if (!requestFor) return '-';
        const reqs = requestFor.split(',').map(r => r.trim());
        const labels: { [key: string]: string } = {
            'addition': 'Addition',
            'amendment': 'Amendment',
            'deletion': 'Deletion',
            'copy': 'Copy'
        };
        return reqs.map(r => labels[r] || r).join(', ');
    }

    private parseCsvValues(value: string | null | undefined): string[] {
        if (!value) return [];
        return value.split(',').map(item => item.trim()).filter(Boolean);
    }

    private getAttachmentsFromRequest(request: any): any[] {
        const raw = request?.attachments;
        if (Array.isArray(raw)) {
            return raw.map((item: any) => {
                const path = typeof item === 'string' ? item : (item?.url || item?.path || '');
                if (!path) return null;
                return {
                    name: path.split('/').pop() || path,
                    url: getAttachmentUrl(path)
                };
            }).filter(Boolean);
        }
        return [];
    }

    getStatusText(status: string | null | undefined): string {
        if (!status) return 'Pending';
        const statusLower = status.toLowerCase();
        switch (statusLower) {
            case 'pending': return 'Pending';
            case 'reject': case 'rejected': return 'Rejected';
            case 'approve': case 'approved': return 'Approved';
            default: return status;
        }
    }

    getStatusColor(status: string | null | undefined): string {
        if (!status) return 'bg-yellow-100 text-yellow-800';
        const statusLower = status.toLowerCase();
        switch (statusLower) {
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            case 'approve': case 'approved': return 'bg-green-100 text-green-800';
            case 'reject': case 'rejected': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
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

    onEdit(): void {
        if (this.request?.id) {
            this.router.navigate(['/controlled-document-request/edit', this.request.id]);
        }
    }

    onPrint(): void {
        if (!this.request) {
            return;
        }

        const printWindow = window.open('', '_blank', 'width=1024,height=1448');
        if (!printWindow) {
            return;
        }

        const printMarkup = this.getPrintMarkup();

        printWindow.document.open();
        printWindow.document.write(printMarkup);
        printWindow.document.close();

        printWindow.onload = () => {
            window.setTimeout(() => {
                printWindow.focus();
                printWindow.print();
                printWindow.close();
            }, 250);
        };
    }

    get workflowSteps(): ApprovalWorkflowStep[] {
        if (!this.request) return [];

        return [
            {
                key: 'reviewed',
                title: 'Reviewed by',
                assignee: this.getEmployeeLabel(this.request.reviewed_by),
                date: this.formatDateTime(this.request.reviewed_by_date),
                status: this.request.reviewed_by_status,
                comments: this.request.review_comments
            },
            {
                key: 'approved',
                title: 'Approved by',
                assignee: this.getEmployeeLabel(this.request.approved_by),
                date: this.formatDateTime(this.request.approved_by_date),
                status: this.request.approved_by_status,
                comments: this.request.approved_comments
            },
            {
                key: 'acknowledged_2',
                title: 'Final Action',
                assignee: this.getEmployeeLabel(this.request.acknowledged_by),
                date: this.formatDateTime(this.request.acknowledged_by_date),
                status: this.request.acknowledged_by_status_2,
                comments: this.request.acknowledged_comments_2
            }
        ];
    }

    private getPrintMarkup(): string {
        const request = this.request || {};
        const categoryState = this.getPrintCategoryState();
        const requestForSet = new Set(this.parseCsvValues(request.request_for));
        const approvalStatus = String(request.approved_by_status || '').toLowerCase();
        const reviewStatus = String(request.reviewed_by_status || '').toLowerCase();
        const actionStatus = String(request.acknowledged_by_status_2 || '').toLowerCase();
        const isActioned = (status: string) => ['approved', 'approve', 'rejected', 'reject'].includes(status);
        const reviewComments = this.normalizePrintText(request.review_comments);
        const approvalComments = this.normalizePrintText(request.approval_comments || request.approved_comments);
        const reasonDescription = this.normalizePrintText(request.reason_description || request.reasonDescription);
        const attachDocument = this.getAttachDocumentText();
        const logoUrl = `${window.location.origin}/images/logo/meinhardt-logo.svg`;

        return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Controlled Document Request / Change</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #eef2f7;
      font-family: Arial, Helvetica, sans-serif;
      color: #111111;
    }

    body {
      padding: 0;
    }

    .page {
      width: 210mm;
      height: 297mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 9mm 11mm 6mm;
      position: relative;
      overflow: hidden;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 6mm;
    }

    .company {
      font-size: 4.8mm;
      font-weight: 700;
      color: #767676;
      margin-top: 3mm;
    }

    .logo-wrap {
      text-align: right;
      color: #7c7c7c;
      font-size: 3mm;
      font-weight: 700;
    }

    .logo-wrap img {
      width: 40mm;
      height: auto;
      display: block;
      margin-left: auto;
      margin-bottom: 0.6mm;
    }

    .title {
      text-align: center;
      color: #7ca0cf;
      font-size: 4.6mm;
      font-weight: 700;
      margin: 0 0 4.5mm;
      letter-spacing: 0.1px;
    }

    .frame {
      border: 0.25mm solid #9f9f9f;
    }

    .section {
      border-top: 0.25mm solid #9f9f9f;
      padding: 3mm 2mm 2.5mm;
      position: relative;
    }

    .section:first-child {
      border-top: 0;
    }

    .top-grid {
      padding: 3mm 2mm 3mm;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1.45fr 1fr;
      gap: 0 6mm;
    }

    .row {
      display: flex;
      align-items: baseline;
      margin-bottom: 3mm;
      min-width: 0;
    }

    .label {
      font-size: 3.45mm;
      font-weight: 700;
      white-space: nowrap;
      margin-right: 1.2mm;
    }

    .subnote {
      font-size: 2.5mm;
      color: #666666;
      margin-top: -2.2mm;
      margin-left: 18mm;
      font-style: italic;
    }

    .line {
      flex: 1;
      border-bottom: 0.28mm dotted #6b6b6b;
      min-height: 4.2mm;
      padding: 0 0.5mm 0.35mm;
      font-size: 3.2mm;
      line-height: 1.15;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .line.multiline {
      white-space: normal;
      min-height: 7mm;
      line-height: 1.25;
    }

    .checks {
      display: grid;
      grid-template-columns: 1fr 1fr 1.35fr;
      gap: 2.8mm 4mm;
      margin-top: 2.2mm;
    }

    .checks.request-for {
      grid-template-columns: repeat(4, 1fr);
      margin-top: 2.8mm;
      margin-bottom: 2.8mm;
      padding-left: 18mm;
    }

    .check {
      display: flex;
      align-items: center;
      gap: 2mm;
      min-width: 0;
      font-size: 3.2mm;
      font-weight: 700;
    }

    .box {
      width: 4.3mm;
      height: 4.3mm;
      border: 0.45mm solid #787878;
      background: #d8d8d8;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 3mm;
      font-weight: 700;
      line-height: 1;
    }

    .part-head {
      display: flex;
      align-items: baseline;
      gap: 6mm;
      margin-bottom: 2.8mm;
    }

    .part-no {
      font-size: 3.75mm;
      font-weight: 700;
      text-decoration: underline;
      white-space: nowrap;
    }

    .part-title {
      font-size: 3.75mm;
      font-weight: 700;
    }

    .part-title small {
      color: #5f84b9;
      font-size: 2.35mm;
      font-style: italic;
      font-weight: 600;
    }

    .field-pair {
      display: grid;
      grid-template-columns: 1.35fr 1fr;
      gap: 0 4.5mm;
      margin-bottom: 2.3mm;
      padding-left: 18mm;
    }

    .field-full {
      margin-bottom: 2.2mm;
    }

    .field-indent {
      padding-left: 18mm;
    }

    .text-block {
      margin-top: 0.6mm;
    }

    .ruled {
      border-bottom: 0.28mm dotted #6b6b6b;
      min-height: 5.5mm;
      padding: 0.2mm 0.5mm 0.5mm;
      font-size: 3.1mm;
      line-height: 1.2;
      margin-bottom: 1.1mm;
      word-break: break-word;
    }

    .ruled.tall {
      min-height: 12mm;
    }

    .ruled.mid {
      min-height: 7mm;
    }

    .sign-row {
      display: grid;
      grid-template-columns: 1.45fr 1fr;
      gap: 0 6mm;
      margin-top: 2.6mm;
    }

    .sign-row.action {
      margin-top: 3mm;
      padding-left: 0;
    }

    .footer {
      position: absolute;
      left: 11mm;
      right: 11mm;
      bottom: 3.5mm;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      color: #9aafc8;
      font-size: 1.9mm;
      font-weight: 700;
    }

    .footer .right {
      text-align: right;
    }

    .side-mark {
      position: absolute;
      right: -3.8mm;
      font-size: 6mm;
      font-weight: 700;
      letter-spacing: -0.3mm;
      color: #111111;
      line-height: 0.8;
      writing-mode: vertical-rl;
      text-orientation: upright;
    }

    .side-mark.top { top: 8mm; }
    .side-mark.part1 { top: 56mm; }
    .side-mark.part2 { top: 113mm; }
    .side-mark.part3 { top: 159mm; }
    .side-mark.part4 { top: 216mm; }

    @media print {
      html, body {
        background: #ffffff;
      }

      .page {
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="company">Meinhardt (Thailand) Ltd.</div>
      <div class="logo-wrap">
        <img src="${logoUrl}" alt="Meinhardt">
        <div>6 - FORM MTCD-01</div>
      </div>
    </div>

    <h1 class="title">CONTROLLED DOCUMENT REQUEST / CHANGE FORM</h1>

    <div class="frame">
      <div class="top-grid section">
        <div class="grid-2">
          <div>
            <div class="row">
              <div class="label">To:</div>
              <div class="line">${this.escapeHtml(this.getRecipientLabels(request.to))}</div>
            </div>
            <div class="row">
              <div class="label">From:</div>
              <div class="line">${this.escapeHtml(this.normalizePrintText(request.from))}</div>
            </div>
          </div>
          <div>
            <div class="row">
              <div class="label">Date:</div>
              <div class="line">${this.escapeHtml(this.formatDate(request.date))}</div>
            </div>
            <div class="row">
              <div class="label">CDR No.:</div>
              <div class="line">${this.escapeHtml(this.normalizePrintText(request.cdr_no || request.cdrNo))}</div>
            </div>
            <div class="subnote">(by IMS/ADM)</div>
          </div>
        </div>

        <div class="checks">
          <div class="check"><span class="box">${this.printCheckbox(categoryState.values.has('ims'))}</span><span>IMS Documentation</span></div>
          <div class="check"><span class="box">${this.printCheckbox(categoryState.values.has('acp'))}</span><span>ACP Documentation</span></div>
          <div class="check"><span class="box">${this.printCheckbox(categoryState.values.has('master_tech_specs'))}</span><span>Master Technical Specifications</span></div>
          <div class="check"><span class="box">${this.printCheckbox(categoryState.values.has('anti_corruption'))}</span><span>Anti-Corruption Programme Booklet</span></div>
          <div class="check" style="grid-column: 2 / 4;">
            <span class="box">${this.printCheckbox(categoryState.hasOther)}</span>
            <span>Other</span>
            <span class="line">${this.escapeHtml(categoryState.otherText)}</span>
          </div>
        </div>

        <div class="side-mark top">FI</div>
      </div>

      <div class="section">
        <div class="part-head">
          <div class="part-no">PART 1</div>
          <div class="part-title">REQUEST FOR</div>
        </div>

        <div class="checks request-for">
          <div class="check"><span class="box">${this.printCheckbox(requestForSet.has('addition'))}</span><span>Addition</span></div>
          <div class="check"><span class="box">${this.printCheckbox(requestForSet.has('amendment'))}</span><span>Amendment</span></div>
          <div class="check"><span class="box">${this.printCheckbox(requestForSet.has('deletion'))}</span><span>Deletion</span></div>
          <div class="check"><span class="box">${this.printCheckbox(requestForSet.has('copy'))}</span><span>A copy</span></div>
        </div>

        <div class="field-pair">
          <div class="row">
            <div class="label" style="font-weight: 400;">Document Name:</div>
            <div class="line">${this.escapeHtml(this.normalizePrintText(request.document_name || request.documentName))}</div>
          </div>
          <div class="row">
            <div class="label" style="font-weight: 400;">Current Revision:</div>
            <div class="line">${this.escapeHtml(this.normalizePrintText(request.current_revision || request.currentRevision))}</div>
          </div>
        </div>

        <div class="field-full">
          <div class="label" style="font-weight: 400;">Reason and Description:</div>
          <div class="text-block">
            ${this.getRuledTextRows(reasonDescription, 3)}
          </div>
        </div>

        <div class="field-full">
          <div class="row">
            <div class="label" style="font-weight: 400;">Purpose of Effective Date :</div>
            <div class="line">${this.escapeHtml(this.formatDate(request.effective_date_purpose || request.effectiveDatePurpose))}</div>
          </div>
        </div>

        <div class="field-full">
          <div class="label" style="font-weight: 400;">Please attach document:</div>
          <div class="text-block">
            <div class="ruled mid">${this.escapeHtml(attachDocument)}</div>
          </div>
        </div>

        <div class="sign-row">
          <div class="row">
            <div class="label" style="font-weight: 400;">Requested by:</div>
            <div class="line">${this.escapeHtml(this.getEmployeeLabel(request.requested_by || request.requestedBy))}</div>
          </div>
          <div class="row">
            <div class="label" style="font-weight: 400;">Date:</div>
            <div class="line">${this.escapeHtml(this.formatDate(request.requested_date || request.requestedDate))}</div>
          </div>
        </div>

        <div class="side-mark part1">FI</div>
      </div>

      <div class="section">
        <div class="part-head">
          <div class="part-no">PART 2</div>
          <div class="part-title">REVIEW <small>(*Review Authority for each document refer to 6-APPENDIX MTCD-A1: List of Controlled Documents - Books)</small></div>
        </div>

        <div class="field-full">
          <div class="label" style="font-weight: 400;">Comments:</div>
          <div class="text-block">
            ${this.getRuledTextRows(reviewComments, 2)}
          </div>
        </div>

        <div class="sign-row">
          <div class="row">
            <div class="label" style="font-weight: 400;">*Signed by:</div>
            <div class="line">${isActioned(reviewStatus) ? this.escapeHtml(this.getEmployeeLabel(request.reviewed_by)) : ''}</div>
            <div style="font-size:3mm; margin-left:1.2mm;">(ISC/HRM/DI/EE/DL)</div>
          </div>
          <div class="row">
            <div class="label" style="font-weight: 400;">Date:</div>
            <div class="line">${isActioned(reviewStatus) ? this.escapeHtml(this.formatDate(request.reviewed_by_date)) : ''}</div>
          </div>
        </div>

        <div class="side-mark part2">FI</div>
      </div>

      <div class="section">
        <div class="part-head">
          <div class="part-no">PART 3</div>
          <div class="part-title">ASK FOR APPROVAL</div>
        </div>

        <div class="checks request-for" style="grid-template-columns: 1fr 1fr 2fr; padding-left: 18mm; margin-bottom: 1.8mm;">
          <div class="check"><span class="box">${this.printCheckbox(approvalStatus === 'approved' || approvalStatus === 'approve')}</span><span>Approved</span></div>
          <div class="check"><span class="box">${this.printCheckbox(approvalStatus === 'rejected' || approvalStatus === 'reject')}</span><span>Not Approved</span></div>
          <div></div>
        </div>

        <div class="field-full">
          <div class="label" style="font-weight: 400;">Comments:</div>
          <div class="text-block">
            ${this.getRuledTextRows(approvalComments, 2)}
          </div>
        </div>

        <div class="sign-row">
          <div class="row">
            <div class="label" style="font-weight: 400;">Signed by:</div>
            <div class="line">${isActioned(approvalStatus) ? this.escapeHtml(this.getEmployeeLabel(request.approved_by)) : ''}</div>
            <div style="font-size:3mm; margin-left:1.2mm;">(IMR/DI/MD)</div>
          </div>
          <div class="row">
            <div class="label" style="font-weight: 400;">Date:</div>
            <div class="line">${isActioned(approvalStatus) ? this.escapeHtml(this.formatDate(request.approved_by_date)) : ''}</div>
          </div>
        </div>

        <div class="side-mark part3">FI</div>
      </div>

      <div class="section">
        <div class="part-head" style="margin-bottom: 3mm;">
          <div class="part-no">PART 4</div>
          <div class="part-title">ACTION</div>
        </div>

        <div class="field-pair" style="grid-template-columns: 1.2fr 1fr; margin-bottom: 1.8mm;">
          <div class="row">
            <div class="label" style="font-weight: 400;">Completed : New Revision:</div>
            <div class="line">${this.escapeHtml(this.normalizePrintText(request.new_revision || request.newRevision))}</div>
          </div>
          <div class="row">
            <div class="label" style="font-weight: 400;">Effective Date:</div>
            <div class="line">${this.escapeHtml(this.formatDate(request.action_effective_date || request.actionEffectiveDate))}</div>
          </div>
        </div>

        <div class="sign-row action">
          <div class="row">
            <div class="label" style="font-weight: 400;">Action by:</div>
            <div class="line">${isActioned(actionStatus) ? this.escapeHtml(this.getEmployeeLabel(request.acknowledged_by)) : ''}</div>
            <div style="font-size:3mm; margin-left:1.2mm;">(IMS/ADM)</div>
          </div>
          <div class="row">
            <div class="label" style="font-weight: 400;">Date:</div>
            <div class="line">${isActioned(actionStatus) ? this.escapeHtml(this.formatDate(request.acknowledged_by_date)) : ''}</div>
          </div>
        </div>

        <div class="side-mark part4">FI</div>
      </div>
    </div>

    <div class="footer">
      <div class="left">M/MTL_INDEx/IMS DOCUMENTATION/S. FORMS/6 - MTCD-01-CONTROLLED DOCUMENT REQUEST</div>
      <div class="right">Page 1 of 1</div>
    </div>
  </div>
</body>
</html>`;
    }

    private getPrintCategoryState(): { values: Set<string>; hasOther: boolean; otherText: string } {
        const values = this.parseCsvValues(this.request?.categories);
        const knownCategories = new Set(['ims', 'acp', 'master_tech_specs', 'anti_corruption', 'other']);
        const normalizedValues = new Set(values.filter(value => knownCategories.has(value)));
        const derivedOtherValues = values.filter(value => !knownCategories.has(value));
        const explicitOtherText = this.normalizePrintText(this.request?.other_text || this.request?.otherText, '');
        const otherText = explicitOtherText || derivedOtherValues.join(', ');
        const hasOther = normalizedValues.has('other') || !!otherText;

        return {
            values: normalizedValues,
            hasOther,
            otherText: otherText || ''
        };
    }

    private getAttachDocumentText(): string {
        const note = this.normalizePrintText(this.request?.attach_document_note || this.request?.attachDocumentNote, '');
        const attachmentNames = this.attachments
            .map((attachment: any) => this.normalizePrintText(attachment?.name, ''))
            .filter(Boolean);

        if (note && attachmentNames.length) {
            return `${note} (${attachmentNames.join(', ')})`;
        }

        if (attachmentNames.length) {
            return attachmentNames.join(', ');
        }

        return note || '-';
    }

    private getRuledTextRows(value: string, rows: number): string {
        const normalized = value && value !== '-' ? value : '';
        const chunks = normalized ? this.chunkPrintText(normalized, 110, rows) : [];
        const filledRows = Array.from({ length: rows }, (_, index) => chunks[index] || '');
        return filledRows
            .map(row => `<div class="ruled">${this.escapeHtml(row)}</div>`)
            .join('');
    }

    private chunkPrintText(value: string, maxCharsPerRow: number, maxRows: number): string[] {
        const normalized = value.replace(/\s+/g, ' ').trim();
        if (!normalized) {
            return [];
        }

        const words = normalized.split(' ');
        const rows: string[] = [];
        let currentRow = '';

        for (const word of words) {
            const nextRow = currentRow ? `${currentRow} ${word}` : word;
            if (nextRow.length <= maxCharsPerRow) {
                currentRow = nextRow;
                continue;
            }

            if (currentRow) {
                rows.push(currentRow);
                if (rows.length === maxRows) {
                    return rows;
                }
            }

            currentRow = word;
        }

        if (currentRow && rows.length < maxRows) {
            rows.push(currentRow);
        }

        return rows.slice(0, maxRows);
    }

    private normalizePrintText(value: unknown, fallback: string = '-'): string {
        if (value === null || value === undefined) {
            return fallback;
        }

        const normalized = String(value).trim();
        return normalized || fallback;
    }

    private printCheckbox(checked: boolean): string {
        return checked ? '&#10003;' : '';
    }

    private escapeHtml(value: unknown): string {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
