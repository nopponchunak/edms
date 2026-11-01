import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { GiftHospitalityService } from 'app/core/services/gift-hospitality.service';
import { GiftHospitality } from 'app/core/models/gift-hospitality.model';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GIFT_HOSPITALITY_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';

@Component({
  selector: 'app-gift-hospitality-action',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
    MatCardModule,
    MatTooltipModule,
  ],
  templateUrl: './gift-hospitality-action.component.html',
  styleUrls: ['./gift-hospitality-action.component.scss'],
})
export class GiftHospitalityActionComponent implements OnInit, OnDestroy {
  actionForm: FormGroup;
  loading = false;
  giftHospitalityId: string | null = null;
  giftHospitality: GiftHospitality | null = null;
  actionType: 'verified_by_status' | 'acknowledged_by_status' | 'approved_by_status' | 'ims_acknowledged_by_status' | null = null;
  attachments: Array<{ name: string; url: string }> = [];
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();

  readonly requestTypes = [
    { value: 'gift' as const, label: 'Gift' },
    { value: 'hospitality' as const, label: 'Hospitality' },
  ];

  statusOptions = [
    { value: 'REJECT', label: 'Reject' },
    { value: 'APPROVED', label: 'Approve' },
  ];

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private giftHospitalityService: GiftHospitalityService,
    private employeeService: EmployeeService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private route: ActivatedRoute,
    public router: Router,
    private snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService
  ) {
    this.actionForm = this.createForm();
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe(params => {
      this.giftHospitalityId = params['id'];
      this.actionType = params['type'] as typeof this.actionType;

      if (this.giftHospitalityId) {
        this.loadGiftHospitality();
      }

      if (this.actionType) {
        this.setupFormForActionType();
      }
    });

  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private createForm(): FormGroup {
    return this.fb.group({
      status: ['', Validators.required],
    });
  }

  private setupFormForActionType(): void {
    if (!this.actionType) return;

    if (this.giftHospitality) {
      this.actionForm.patchValue({
        status: null,
      });
    }
  }


  private loadGiftHospitality(): void {
    if (!this.giftHospitalityId) return;

    this.loading = true;
    forkJoin({
      giftHospitality: this.giftHospitalityService.findOne(this.giftHospitalityId),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    })
      .pipe(
        switchMap(({ giftHospitality, employeeLookup, employeeLookupWithTitle }) => {
          const codes = [
            giftHospitality.mtlReceivingStaffBy,
            giftHospitality.verifiedBy,
            giftHospitality.acknowledgedBy,
            giftHospitality.approvedBy,
            giftHospitality.imsAcknowledgedBy,
            (giftHospitality as any).create_by,
            (giftHospitality as any).update_by
          ].filter(code => !!code);
          return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
            switchMap(updatedLookup => {
                return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
                    map(updatedLookupWithTitle => ({ giftHospitality, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
                );
            })
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe({
        next: ({ giftHospitality, employeeLookup, employeeLookupWithTitle }) => {
          this.giftHospitality = giftHospitality;
          this.attachments = this.buildAttachments(giftHospitality.attachments);
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          this.setupFormForActionType();
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

  getEmployeeLabelWithTitle(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookupWithTitle);
  }

  onSubmit(): void {
    if (this.actionForm.invalid || !this.giftHospitalityId || !this.actionType || !this.giftHospitality) {
      return;
    }

        const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm action',
      message: 'Are you sure you want to submit this action?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Confirm', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;

      this.loading = true;
    const formData = this.actionForm.value;
    const statusLower = (formData.status as string).toLowerCase();
    const actionTimestamp = this.getCurrentLocalDateTime();
    const updatePayload: any = {
      request_type: this.giftHospitality.requestType,
      description: this.giftHospitality.description,
      purpose: this.giftHospitality.purpose,
      value: this.giftHospitality.value,
      company_of_giver: this.giftHospitality.companyOfGiver,
      proposed_date: this.giftHospitality.proposedDate,
      mtl_receiving_staff_by: this.giftHospitality.mtlReceivingStaffBy || null,
      mtl_receiving_staff_by_date: this.giftHospitality.mtlReceivingStaffByDate || null,
      mtl_receiving_staff_by_status: this.giftHospitality.mtlReceivingStaffByStatus || null,
      verified_by: this.giftHospitality.verifiedBy || null,
      verified_by_date: this.giftHospitality.verifiedByDate || null,
      verified_by_status: this.giftHospitality.verifiedByStatus || null,
      acknowledged_by: this.giftHospitality.acknowledgedBy || null,
      acknowledged_by_date: this.giftHospitality.acknowledgedByDate || null,
      acknowledged_by_status: this.giftHospitality.acknowledgedByStatus || null,
      ims_acknowledged_by: this.giftHospitality.imsAcknowledgedBy || null,
      ims_acknowledged_by_date: this.giftHospitality.imsAcknowledgedByDate || null,
      ims_acknowledged_by_status: this.giftHospitality.imsAcknowledgedByStatus || null,
      approved_by: this.giftHospitality.approvedBy || null,
      approved_by_date: this.giftHospitality.approvedByDate || null,
      approved_by_status: this.giftHospitality.approvedByStatus || null,
    };

    switch (this.actionType) {
      case 'verified_by_status':
        updatePayload.verified_by_status = statusLower;
        updatePayload.verified_by_date = actionTimestamp;
        updatePayload.verified_date = actionTimestamp;
        break;
      case 'approved_by_status':
        updatePayload.approved_by_status = statusLower;
        updatePayload.approved_by_date = actionTimestamp;
        updatePayload.approved_date = actionTimestamp;
        break;
      case 'acknowledged_by_status':
        updatePayload.acknowledged_by_status = statusLower;
        updatePayload.acknowledged_by_date = actionTimestamp;
        updatePayload.acknowledged_date = actionTimestamp;
        break;
      case 'ims_acknowledged_by_status':
        updatePayload.ims_acknowledged_by_status = statusLower;
        updatePayload.ims_acknowledged_by_date = actionTimestamp;
        break;
    }

    this.giftHospitalityService.action(this.giftHospitalityId, this.actionType, statusLower)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          this.sendActionEmailNotification(updatePayload, statusLower);
          this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/gift-hospitality/list'], { queryParams: { tab: 'action' } });
        },
        error: (error) => {
          console.error('Error updating status:', error);
          this.snackBar.open(error?.error?.message || 'Error updating status', 'Close', { duration: 5000 });
          this.loading = false;
        }
      });

    });
  }

  private sendActionEmailNotification(updatedPayload: any, status: string): void {
    if (!this.giftHospitalityId || !this.actionType) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        GIFT_HOSPITALITY_EMAIL_CONFIG,
        {
          ...this.giftHospitality,
          ...updatedPayload,
          createBy: this.giftHospitality?.createBy ?? null,
          create_by: this.giftHospitality?.createBy ?? null,
          id: this.giftHospitalityId
        },
        this.actionType,
        status,
        this.giftHospitalityId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send gift hospitality email notification:', error);
          this.snackBar.open('Status updated, but email notification could not be sent', 'Close', { duration: 5000 });
        }
      });
  }

  private getCurrentLocalDateTime(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  getActionTitle(): string {
    switch (this.actionType) {
      case 'verified_by_status':
        return 'Verify Status';
      case 'acknowledged_by_status':
        return 'Acknowledge 2 (CA) Status';
      case 'ims_acknowledged_by_status':
        return 'Acknowledge 1 (ACSL) Status';
      case 'approved_by_status':
        return 'Approve Status';
      default:
        return 'Update Status';
    }
  }

  getActionDescription(): string {
    switch (this.actionType) {
      case 'verified_by_status':
        return 'Update the verification status for this request';
      case 'acknowledged_by_status':
        return 'Update the Accounts (CA) acknowledgment status for this request';
      case 'ims_acknowledged_by_status':
        return 'Update the ACSL acknowledgment status for this request';
      case 'approved_by_status':
        return 'Update the approval status for this request';
      default:
        return 'Update the status for this request';
    }
  }

  formatDate(dateString?: string | null): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string | null | undefined): string {
    return formatDateTimeDisplay(dateString);
  }

  formatCurrency(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '-';
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '-';
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numValue);
  }

  getRequestTypeText(type: string | null | undefined): string {
    if (!type) return '-';
    switch (type.toLowerCase()) {
      case 'gift': return 'Gift';
      case 'hospitality': return 'Hospitality';
      default: return type;
    }
  }

  isRequestTypeSelected(type: 'gift' | 'hospitality'): boolean {
    return this.giftHospitality?.requestType === type;
  }

  getStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    switch (status.toLowerCase()) {
      case 'pending': return 'Pending';
      case 'verified': return 'Verified';
      case 'acknowledged': return 'Acknowledged';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  }

  getStatusColor(status: string | null | undefined): string {
    if (!status) return 'bg-yellow-100 text-yellow-800';
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'verified': return 'bg-blue-100 text-blue-800';
      case 'acknowledged': return 'bg-purple-100 text-purple-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getByStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'Pending';
      case 'reject': return 'Rejected';
      case 'approve': case 'approved': return 'Approved';
      default: return status;
    }
  }

  getByStatusColor(status: string | null | undefined): string {
    if (!status) return 'bg-yellow-100 text-yellow-800';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approve': case 'approved': return 'bg-green-100 text-green-800';
      case 'reject': case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
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
