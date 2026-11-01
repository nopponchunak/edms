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
import { GiftHospitalityOfferingService } from 'app/core/services/gift-hospitality-offering.service';
import { GiftHospitalityOffering } from 'app/core/models/gift-hospitality-offering.model';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GIFT_HOSPITALITY_OFFERING_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';

@Component({
  selector: 'app-gift-hospitality-offering-action',
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
  templateUrl: './gift-hospitality-offering-action.component.html',
  styleUrls: ['./gift-hospitality-offering-action.component.scss'],
})
export class GiftHospitalityOfferingActionComponent implements OnInit, OnDestroy {
  actionForm: FormGroup;
  loading = false;
  offeringId: string | null = null;
  offering: GiftHospitalityOffering | null = null;
  actionType: 'verified_by_status' | 'acknowledged_by_status' | 'approved_by_status' | 'approved_by_2_status' | 'ims_acknowledged_by_status' | null = null;
  attachments: Array<{ name: string; url: string }> = [];
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();

  readonly requestTypes = [
    { value: 'Gift' as const, label: 'Gift' },
    { value: 'Hospitality' as const, label: 'Hospitality' },
  ];

  statusOptions = [
    { value: 'REJECT', label: 'Reject' },
    { value: 'APPROVED', label: 'Approve' },
  ];

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private offeringService: GiftHospitalityOfferingService,
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
      this.offeringId = params['id'];
      this.actionType = params['type'] as typeof this.actionType;

      if (this.offeringId) {
        this.loadOffering();
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

    if (this.offering) {
      this.actionForm.patchValue({
        status: null,
      });
    }
  }


  private loadOffering(): void {
    if (!this.offeringId) return;

    this.loading = true;
    forkJoin({
      offering: this.offeringService.findOne(this.offeringId),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    })
      .pipe(
        switchMap(({ offering, employeeLookup, employeeLookupWithTitle }) => {
          const codes = [
            offering.verifiedBy,
            offering.imsAcknowledgedBy,
            offering.approvedBy,
            offering.approvedBy2,
            offering.acknowledgedBy,
            offering.createBy,
            (offering as any).update_by,
          ].filter(code => !!code);

          return forkJoin({
            employeeLookup: this.employeeService.ensureEmployeesInLookup(employeeLookup, codes),
            employeeLookupWithTitle: this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes),
          }).pipe(map(lookups => ({ offering, ...lookups })));
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe({
        next: ({ offering, employeeLookup, employeeLookupWithTitle }) => {
          this.offering = offering;
          this.attachments = this.buildAttachments(offering.attachments);
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          this.setupFormForActionType();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading offering:', error);
          this.snackBar.open('Error loading request', 'Close', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    const employee = this.offering?.workflowEmployeeNames?.[String(ref ?? '').trim()];
    if (employee?.name) return employee.name;
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
  }

  getEmployeeLabelWithTitle(ref: string | number | null | undefined): string {
    const employee = this.offering?.workflowEmployeeNames?.[String(ref ?? '').trim()];
    if (employee?.name) return employee.title ? `${employee.name}|${employee.title}` : employee.name;
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookupWithTitle);
  }

  onSubmit(): void {
    if (this.actionForm.invalid || !this.offeringId || !this.actionType || !this.offering) {
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
      request_type: this.offering.type?.toLowerCase() || 'gift',
      description: this.offering.description,
      purpose: this.offering.purpose,
      value: this.offering.value,
      currency_code: this.offering.currencyCode || 'THB',
      receiver_name_and_company: this.offering.receiverNameAndCompany,
      proposed_date: this.offering.proposedDate,
      verified_by: this.offering.verifiedBy || null,
      verified_by_date: this.offering.verifiedByDate || null,
      verified_by_status: this.offering.verifiedByStatus || null,
      acknowledged_by: this.offering.acknowledgedBy || null,
      acknowledged_by_date: this.offering.acknowledgedByDate || null,
      acknowledged_by_status: this.offering.acknowledgedByStatus || null,
      ims_acknowledged_by: this.offering.imsAcknowledgedBy || null,
      ims_acknowledged_by_date: this.offering.imsAcknowledgedByDate || null,
      ims_acknowledged_by_status: this.offering.imsAcknowledgedByStatus || null,
      approved_by: this.offering.approvedBy || null,
      approved_by_date: this.offering.approvedByDate || null,
      approved_by_status: this.offering.approvedByStatus || null,
      approved_by_2: this.offering.approvedBy2 || null,
      approved_by_2_date: this.offering.approvedBy2Date || null,
      approved_by_2_status: this.offering.approvedBy2Status || null,
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
      case 'approved_by_2_status':
        updatePayload.approved_by_2_status = statusLower;
        updatePayload.approved_by_2_date = actionTimestamp;
        break;
    }

    this.offeringService.action(this.offeringId, this.actionType, statusLower)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          this.sendActionEmailNotification(updatePayload, statusLower);
          this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/gift-hospitality-offering/list'], { queryParams: { tab: 'action' } });
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
    if (!this.offeringId || !this.actionType) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        GIFT_HOSPITALITY_OFFERING_EMAIL_CONFIG,
        {
          ...this.offering,
          ...updatedPayload,
          createBy: this.offering?.createBy ?? null,
          create_by: this.offering?.createBy ?? null,
          requester_name: this.getRequesterName(),
          id: this.offeringId
        },
        this.actionType,
        status,
        this.offeringId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send gift hospitality offering email notification:', error);
          this.snackBar.open('Status updated, but email notification could not be sent', 'Close', { duration: 5000 });
        }
      });
  }

  private getRequesterName(): string | null {
    const label = this.getEmployeeLabel(this.offering?.createBy);
    return label && label !== '-' ? label : null;
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
        return 'Acknowledge Status';
      case 'ims_acknowledged_by_status':
        return 'ACSL Acknowledge Status';
      case 'approved_by_status':
        return 'Approve Status';
      case 'approved_by_2_status':
        return 'Approve 2 Status';
      default:
        return 'Update Status';
    }
  }

  getActionDescription(): string {
    switch (this.actionType) {
      case 'verified_by_status':
        return 'Update the verification status for this request';
      case 'acknowledged_by_status':
        return 'Update the acknowledgment status for this request';
      case 'ims_acknowledged_by_status':
        return 'Update the ACSL acknowledgment status for this request';
      case 'approved_by_status':
        return 'Update the approval status for this request';
      case 'approved_by_2_status':
        return 'Update the second approval status for this request';
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

  formatCurrency(value: string | number | null | undefined, currencyCode: string | null | undefined = 'THB'): string {
    if (value === null || value === undefined || value === '') return '-';
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '-';
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: currencyCode || 'THB',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numValue);
  }

  getRequestTypeText(type: string | null | undefined): string {
    if (!type) return '-';
    switch (type.toLowerCase()) {
      case 'gift': return 'Gift';
      case 'hospitality': return 'Hospitality';
      default: return type;
    }
  }

  isRequestTypeSelected(type: 'Gift' | 'Hospitality'): boolean {
    return this.offering?.type === type;
  }

  getByStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'Pending';
      case 'reject': case 'rejected': return 'Rejected';
      case 'approve': case 'approved': return 'Approved';
      default: return status;
    }
  }

  getByStatusColor(status: string | null | undefined): string {
    if (!status) return 'bg-yellow-100 text-yellow-800';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'unassigned': return 'bg-gray-100 text-gray-700';
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
