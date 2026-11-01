import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FuseAlertComponent } from '@fuse/components/alert';
import { GiftHospitalityOfferingService } from 'app/core/services/gift-hospitality-offering.service';
import { AuthService } from 'app/core/services/auth.service';
import { User } from 'app/core/models/user.model';
import { GiftHospitalityOffering, VerifyRequestDto, AcknowledgeRequestDto, ApproveRequestDto } from 'app/core/models/gift-hospitality-offering.model';
import { catchError, forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { ApprovalWorkflowComponent, ApprovalWorkflowStep } from 'app/core/components/approval-workflow';
import { EmployeeService } from 'app/core/services/employee.service';
import { SignatureSetting, SignatureSettingService } from 'app/core/services/signature-setting.service';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { MatTooltipModule } from '@angular/material/tooltip';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import {
  escapeSignatureHtml,
  formatPoSignatureId,
  getSignatureLookupRefsFromValues,
  getSignaturePrintHtml,
} from 'app/core/utils/signature-print.util';

@Component({
  selector: 'app-gift-hospitality-offering-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    FuseAlertComponent,
    ApprovalWorkflowComponent,
    ViewActionsComponent,
    MatTooltipModule
  ],
  templateUrl: './gift-hospitality-offering-view.component.html',
  styleUrls: ['./gift-hospitality-offering-view.component.scss']
})
export class GiftHospitalityOfferingViewComponent implements OnInit, OnDestroy {
  readonly requestTypes = [
    { value: 'Gift', label: 'Gift' },
    { value: 'Hospitality', label: 'Hospitality' }
  ] as const;

  giftHospitalityOffering: GiftHospitalityOffering | null = null;
  loading = false;
  showAlert = false;
  alert = { type: 'success', message: '' };
  currentUser: User | null = null;
  currentUserId: string | null = null;

  // Action states
  showVerifyDialog = false;
  showAcknowledgeDialog = false;
  showApproveDialog = false;

  // Action forms
  verifyComments = '';
  acknowledgeComments = '';
  approveComments = '';
  approveDecision = false;
  attachments: Array<{ name: string; url: string }> = [];
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();
  activeSignatureSettings = new Map<string, SignatureSetting>();

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private offeringService: GiftHospitalityOfferingService,
    private employeeService: EmployeeService,
    private signatureSettingService: SignatureSettingService,
    private authService: AuthService,
    private route: ActivatedRoute,
    public router: Router,
    private snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService
  ) {}

  ngOnInit(): void {
    this.subscribeToCurrentUser();
    this.loadOffering();
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private subscribeToCurrentUser(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe(user => {
        this.currentUser = user;
        this.currentUserId = user?.id || null;
      });
  }

  loadOffering(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.loading = true;
    forkJoin({
      offering: this.offeringService.findOne(id),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    })
      .pipe(
        switchMap(({ offering, employeeLookup, employeeLookupWithTitle }) => {
          const codes = [
            offering.verifiedBy,
            offering.acknowledgedBy,
            offering.imsAcknowledgedBy,
            offering.approvedBy,
            offering.approvedBy2,
            offering.createBy,
            (offering as any).update_by
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
                  offering,
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
        next: ({ offering, employeeLookup, employeeLookupWithTitle, activeSignatureSettings }) => {
          this.giftHospitalityOffering = offering;
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          this.activeSignatureSettings = activeSignatureSettings;
          this.attachments = this.buildAttachments(this.giftHospitalityOffering.attachments);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading offering:', error);
          this.showAlert = true;
          this.alert = { type: 'error', message: 'Error loading offering details' };
          this.loading = false;
        }
      });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    const employee = this.giftHospitalityOffering?.workflowEmployeeNames?.[String(ref ?? '').trim()];
    if (employee?.name) return employee.name;
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
  }

  canEdit(): boolean {
    return this.giftHospitalityOffering?.status === 'Pending' &&
           this.giftHospitalityOffering?.requestedBy.id === this.currentUserId;
  }

  isVerifiedByMe(): boolean {
    return this.isPendingWorkflowStatus(this.giftHospitalityOffering?.verifiedByStatus) &&
           this.giftHospitalityOffering?.verifiedBy === this.currentUserId;
  }

  isAcknowledgedByMe(): boolean {
    const offering = this.giftHospitalityOffering;
    if (!offering) return false;

    const allApproversApproved = this.isApprovedStatus(offering.approvedByStatus) &&
      (!offering.approvedBy2 || this.isApprovedStatus(offering.approvedBy2Status));
    return this.isApprovedStatus(offering.verifiedByStatus) &&
           allApproversApproved &&
           this.isPendingWorkflowStatus(offering.acknowledgedByStatus) &&
           this.giftHospitalityOffering?.acknowledgedBy === this.currentUserId;
  }

  isApprovedByMe(): boolean {
    return this.isApprovedStatus(this.giftHospitalityOffering?.verifiedByStatus) &&
           this.isPendingWorkflowStatus(this.giftHospitalityOffering?.approvedByStatus) &&
           this.giftHospitalityOffering?.approvedBy === this.currentUserId;
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

  onVerify(): void {
    if (!this.verifyComments.trim()) {
      this.snackBar.open('Please provide verification comments', 'Close', { duration: 3000 });
      return;
    }

    const verifyDto: VerifyRequestDto = {
      comments: this.verifyComments,
      verifiedByFirstName: this.currentUser?.firstName,
      verifiedByLastName: this.currentUser?.lastName,
      verifiedByEmail: this.currentUser?.email
    };

    this.offeringService.verify(this.giftHospitalityOffering!.id, verifyDto)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (offering) => {
          this.giftHospitalityOffering = offering;
          this.showVerifyDialog = false;
          this.verifyComments = '';
          this.snackBar.open('Offering verified successfully', 'Close', { duration: 3000 });
        },
        error: (error) => {
          console.error('Error verifying offering:', error);
          this.snackBar.open('Error verifying offering', 'Close', { duration: 3000 });
        }
      });
  }

  onAcknowledge(): void {
    if (!this.acknowledgeComments.trim()) {
      this.snackBar.open('Please provide acknowledgment comments', 'Close', { duration: 3000 });
      return;
    }

    const acknowledgeDto: AcknowledgeRequestDto = {
      comments: this.acknowledgeComments,
      acknowledgedByFirstName: this.currentUser?.firstName,
      acknowledgedByLastName: this.currentUser?.lastName,
      acknowledgedByEmail: this.currentUser?.email
    };

    this.offeringService.acknowledge(this.giftHospitalityOffering!.id, acknowledgeDto)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (offering) => {
          this.giftHospitalityOffering = offering;
          this.showAcknowledgeDialog = false;
          this.acknowledgeComments = '';
          this.snackBar.open('Offering acknowledged successfully', 'Close', { duration: 3000 });
        },
        error: (error) => {
          console.error('Error acknowledging offering:', error);
          this.snackBar.open('Error acknowledging offering', 'Close', { duration: 3000 });
        }
      });
  }

  onApprove(): void {
    if (!this.approveComments.trim()) {
      this.snackBar.open('Please provide approval comments', 'Close', { duration: 3000 });
      return;
    }

    const approveDto: ApproveRequestDto = {
      approvedDecision: this.approveDecision,
      comments: this.approveComments,
      approvedByFirstName: this.currentUser?.firstName,
      approvedByLastName: this.currentUser?.lastName,
      approvedByEmail: this.currentUser?.email
    };

    const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm review',
      message: `Are you sure you want to ${this.approveDecision ? 'approve' : 'reject'} this offering?`,
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Confirm', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      const approved = this.approveDecision;

      this.offeringService.approve(this.giftHospitalityOffering!.id, approveDto)
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe({
          next: (offering) => {
            this.giftHospitalityOffering = offering;
            this.showApproveDialog = false;
            this.approveComments = '';
            this.approveDecision = false;
            this.snackBar.open(
              `Offering ${approved ? 'approved' : 'rejected'} successfully`,
              'Close',
              { duration: 3000 }
            );
          },
          error: (error) => {
            console.error('Error approving offering:', error);
            this.snackBar.open('Error processing approval', 'Close', { duration: 3000 });
          }
        });
    });
  }

  editRequest(): void {
    this.router.navigate(['/gift-hospitality-offering/edit', this.giftHospitalityOffering?.id]);
  }

  printRequest(): void {
    if (!this.giftHospitalityOffering) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.onload = () => {
      void this.waitForPrintWindowSignatureFont(printWindow).then(() => {
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          printWindow.close();
        }, 100);
      });
    };
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Gift/Hospitality Offering - ${this.escapeHtml(this.giftHospitalityOffering.id)}</title>
          <meta charset="utf-8" />
          <style>${this.getPrintStyles()}</style>
        </head>
        <body>
          ${this.getPrintHtml()}
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  get workflowSteps(): ApprovalWorkflowStep[] {
    if (!this.giftHospitalityOffering) return [];

    const steps: ApprovalWorkflowStep[] = [
      {
        key: 'request',
        title: 'Request (EE and above)',
        assignee: this.getEmployeeLabel(this.giftHospitalityOffering.createBy),
        date: this.formatDateTime(this.giftHospitalityOffering.createdAt),
        status: 'submitted'
      },
      {
        key: 'verify',
        title: 'Verify (ACSC)',
        assignee: this.getEmployeeLabel(this.giftHospitalityOffering.verifiedBy),
        date: this.formatDateTime(this.giftHospitalityOffering.verifiedByDate),
        status: this.giftHospitalityOffering.verifiedByStatus,
        comments: this.giftHospitalityOffering.verifiedComments,
        actionLabel: 'Verify Request',
        actionColor: 'primary',
        showAction: this.isVerifiedByMe()
      }
    ];

    steps.push({
      key: 'ims',
      title: 'Acknowledge 1 (ACSL)',
      assignee: this.getEmployeeLabel(this.giftHospitalityOffering.imsAcknowledgedBy),
      date: this.formatDateTime(this.giftHospitalityOffering.imsAcknowledgedByDate),
      status: this.giftHospitalityOffering.imsAcknowledgedBy
        ? this.giftHospitalityOffering.imsAcknowledgedByStatus
        : 'unassigned',
      showAction: false
    });

    steps.push({
      key: 'approve',
      title: 'Approve (DI/MD)',
      assignee: this.getEmployeeLabel(this.giftHospitalityOffering.approvedBy),
      date: this.formatDateTime(this.giftHospitalityOffering.approvedByDate),
      status: this.giftHospitalityOffering.approvedByStatus,
      comments: this.giftHospitalityOffering.approvedComments,
      actionLabel: 'Approve/Reject Request',
      actionColor: 'success',
      showAction: this.isApprovedByMe()
    });

    if (this.giftHospitalityOffering.approvedBy2) {
      steps.push({
        key: 'approve-2',
        title: 'Approve 2 (DI)',
        assignee: this.getEmployeeLabel(this.giftHospitalityOffering.approvedBy2),
        date: this.formatDateTime(this.giftHospitalityOffering.approvedBy2Date),
        status: this.giftHospitalityOffering.approvedBy2Status,
        comments: '',
        actionLabel: 'Approve/Reject Request',
        actionColor: 'success',
        showAction: false
      });
    }

    steps.push({
      key: 'acknowledge',
      title: 'Acknowledge 2 (CA - JN)',
      assignee: this.getEmployeeLabel(this.giftHospitalityOffering.acknowledgedBy),
      date: this.formatDateTime(this.giftHospitalityOffering.acknowledgedByDate),
      status: this.giftHospitalityOffering.acknowledgedByStatus,
      comments: this.giftHospitalityOffering.acknowledgedComments,
      actionLabel: 'Acknowledge Request',
      actionColor: 'accent',
      showAction: this.isAcknowledgedByMe()
    });

    return steps;
  }

  onWorkflowAction(stepKey: string): void {
    switch (stepKey) {
      case 'verify':
        this.showVerifyDialog = true;
        break;
      case 'acknowledge':
        this.showAcknowledgeDialog = true;
        break;
      case 'approve':
        this.showApproveDialog = true;
        break;
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Verified': return 'bg-blue-100 text-blue-800';
      case 'Acknowledged': return 'bg-purple-100 text-purple-800';
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getStatusText(status: string): string {
    switch (status) {
      case 'Pending': return 'Pending ACSC Verification';
      case 'Verified': return 'Pending Accounts Acknowledgment (CA)';
      case 'Acknowledged': return 'Pending MD/DI Approval';
      case 'Approved': return 'Approved';
      case 'Rejected': return 'Rejected';
      default: return status;
    }
  }

  getRequestTypeText(type: string): string {
    return type === 'Gift' ? 'Gift' : 'Hospitality';
  }

  isRequestTypeSelected(type: 'Gift' | 'Hospitality'): boolean {
    return this.giftHospitalityOffering?.type === type;
  }

  formatCurrency(value: number, currencyCode: string | null | undefined = 'THB'): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: currencyCode || 'THB'
    }).format(value);
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

  private getPrintHtml(): string {
    if (!this.giftHospitalityOffering) return '';

    const r = this.giftHospitalityOffering;
    const reviewedComments = [
      this.isCompletedStatus(r.verifiedByStatus) ? r.verifiedComments || '' : '',
      this.isCompletedStatus(r.acknowledgedByStatus) ? r.acknowledgedComments || '' : '',
    ].filter(Boolean).join('\n');
    const approvalComments = this.isCompletedStatus(r.approvedByStatus) ? r.approvedComments || '' : '';
    const hasSecondApprover = !!r.approvedBy2;
    const isApproved = this.isApprovedStatus(r.approvedByStatus) && (!hasSecondApprover || this.isApprovedStatus(r.approvedBy2Status));
    const isRejected = this.isRejectedStatus(r.approvedByStatus) || this.isRejectedStatus(r.approvedBy2Status);
    const requestedBy = this.getEmployeeLabel(r.createBy || r.requestedBy?.id);

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
              <div class="form-no">4 FORM ACGH - 02</div>
            </div>
          </div>
        </header>

        <h1 class="main-title">REQUEST FOR OFFERING OF GIFT/ HOSPITALITY</h1>

        <div class="form-container">
          <div class="request-type-row">
            <div class="checkbox-group">
              <span class="checkbox">${r.type === 'Gift' ? '&#9745;' : '&#9744;'}</span>
              <span class="checkbox-label">Gift</span>
            </div>
            <div class="checkbox-group ml-60">
              <span class="checkbox">${r.type === 'Hospitality' ? '&#9745;' : '&#9744;'}</span>
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
            <div class="field-label">Purpose of the Gift/ Hospitality offering:</div>
            <div class="dotted-multi-line">
              ${this.renderMultiLineDots(r.purpose, 3)}
            </div>
          </div>

          <div class="field-row mt-4">
            <span class="label">Value of Gift/ Hospitality (${this.escapeHtml(r.currencyCode || 'THB')}):</span>
            <span class="value dotted-line">${this.formatCurrencyNoSymbol(r.value)}</span>
          </div>

          <div class="field-row mt-4">
            <span class="label label-fixed-large">Name &amp; Company of Receiver(s):</span>
            <span class="value dotted-line">${this.escapeHtml(r.receiverNameAndCompany)}</span>
          </div>

          <div class="field-row mt-4">
            <span class="label label-fixed">Requested By :</span>
            <span class="value dotted-line name-field">${this.escapeHtml(requestedBy)}</span>
            <div class="date-wrapper">
              <span class="label">Proposed Date:</span>
              <span class="value dotted-line date-field">${this.formatPrintDate(r.proposedDate)}</span>
            </div>
          </div>

          <div class="field-row mt-4">
            <span class="label label-fixed">Date :</span>
            <span class="value dotted-line name-field">${this.formatPrintDate(r.requestedDate || r.createdAt)}</span>
          </div>

          <div class="field-row mt-4">
            <span class="label label-fixed">Verified By :</span>
            <span class="value dotted-line name-field-with-hint">${this.getCompletedEmployeeSignature(r.verifiedBy, r.verifiedByStatus, r.verifiedByDate)}</span>
            <span class="label-hint">(ACSC)</span>
            <div class="date-wrapper">
              <span class="label">Date:</span>
              <span class="value dotted-line date-field">${this.getCompletedPrintDate(r.verifiedByDate, r.verifiedByStatus)}</span>
            </div>
          </div>

          <div class="field-row mt-4">
            <span class="label label-fixed">Acknowledged By :</span>
            <span class="value dotted-line name-field-with-hint">${this.getCompletedEmployeeSignature(r.acknowledgedBy, r.acknowledgedByStatus, r.acknowledgedByDate)}</span>
            <span class="label-hint">(CA)</span>
            <div class="date-wrapper">
              <span class="label">Date:</span>
              <span class="value dotted-line date-field">${this.getCompletedPrintDate(r.acknowledgedByDate, r.acknowledgedByStatus)}</span>
            </div>
          </div>

          <div class="field-section mt-4">
            <div class="field-label label-fixed">Comments:</div>
            <div class="dotted-multi-line">
              ${this.renderMultiLineDots(reviewedComments, 2)}
            </div>
          </div>

          <div class="bottom-section mt-4">
            <div class="approval-row">
              <span class="label label-fixed">Approve?</span>
              <div class="checkbox-group ml-10 text-base">
                <span class="checkbox">${isApproved ? '&#9745;' : '&#9744;'}</span>
                <span class="label">Yes</span>
              </div>
              <div class="checkbox-group ml-20 text-base">
                <span class="checkbox">${isRejected ? '&#9745;' : '&#9744;'}</span>
                <span class="label">No</span>
              </div>
            </div>

            <div class="field-section mt-3">
              <div class="field-label label-fixed">Comments:</div>
              <div class="dotted-multi-line">
                ${this.renderMultiLineDots(approvalComments, 3)}
              </div>
            </div>

            <div class="field-row mt-4">
              <span class="label label-fixed">Approved By :</span>
              <span class="value dotted-line name-field-with-hint">${this.getCompletedEmployeeSignature(r.approvedBy, r.approvedByStatus, r.approvedByDate)}</span>
              <span class="label-hint">(MD/ DI)</span>
              <div class="date-wrapper">
                <span class="label">Date:</span>
                <span class="value dotted-line date-field">${this.getCompletedPrintDate(r.approvedByDate, r.approvedByStatus)}</span>
              </div>
            </div>

            ${hasSecondApprover ? `
              <div class="field-row mt-4">
                <span class="label label-fixed">Approved By 2 :</span>
                <span class="value dotted-line name-field-with-hint">${this.getCompletedEmployeeSignature(r.approvedBy2, r.approvedBy2Status, r.approvedBy2Date)}</span>
                <span class="label-hint">(DI)</span>
                <div class="date-wrapper">
                  <span class="label">Date:</span>
                  <span class="value dotted-line date-field">${this.getCompletedPrintDate(r.approvedBy2Date, r.approvedBy2Status)}</span>
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <footer class="page-footer">
          <div class="footer-path">Z:\\MR\\MYDOCUMENTS\\IMS DOCUMENT\\STAFF MANUAL\\4 FORM ACGH-02/REV.2(DATE: 1 NOVEMBER 2017)/CC/INK/MR</div>
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
      .label-fixed-large { min-width: 52mm; display: inline-block; }
      .label-hint { font-size: 9pt; margin-left: 1mm; min-width: 22mm; }
      .value {
        flex: 1;
        padding: 0 1mm;
        min-height: 1.3em;
        position: relative;
        top: 1px;
      }
      .dotted-line { border-bottom: 1px dotted #777; }
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
        min-width: 55mm;
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
        font-family: Arial, sans-serif;
      }
      .footer-path {
        flex: 1;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding-right: 10mm;
      }
      .footer-page { margin-left: 10mm; }
      .ml-10 { margin-left: 10mm; }
      .ml-20 { margin-left: 20mm; }
      .ml-60 { margin-left: 60mm; }
      .mt-2 { margin-top: 2mm; }
      .mt-3 { margin-top: 3mm; }
      .mt-4 { margin-top: 4mm; }
      .text-base { font-size: 10pt; }

      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { margin: 0; border: none; padding: 10mm; }
      }
    `;
  }

  private renderMultiLineDots(text: string | null | undefined, minLines: number): string {
    const lines = (text || '').split('\n');
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

  private getCompletedEmployeeLabel(ref: string | number | null | undefined, status: string | null | undefined): string {
    return this.isCompletedStatus(status) ? this.getEmployeeLabel(ref) : '';
  }

  private getCompletedEmployeeSignature(
    ref: string | number | null | undefined,
    status: string | null | undefined,
    actionDate: string | null | undefined
  ): string {
    return this.isCompletedStatus(status) ? this.getSignaturePrintValue(ref, actionDate) : '';
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

  private getCompletedPrintDate(value: string | null | undefined, status: string | null | undefined): string {
    return this.isCompletedStatus(status) ? this.formatPrintDate(value) : '';
  }

  private isCompletedStatus(status: string | null | undefined): boolean {
    return this.isApprovedStatus(status) || this.isRejectedStatus(status);
  }

  private isApprovedStatus(status: string | null | undefined): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'approve' || normalized === 'approved';
  }

  private isPendingWorkflowStatus(status: string | null | undefined): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === '' || normalized === 'pending';
  }

  private isRejectedStatus(status: string | null | undefined): boolean {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'reject' || normalized === 'rejected';
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

  private escapeHtml(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';

    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
