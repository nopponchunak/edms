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
import { MatDividerModule } from '@angular/material/divider';
import { forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { ControlledDocumentRequestService } from 'app/core/services/controlled-document-request.service';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { EmployeeService } from 'app/core/services/employee.service';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { ApprovalWorkflowComponent, ApprovalWorkflowStep } from 'app/core/components/approval-workflow';
import { MatTooltipModule } from '@angular/material/tooltip';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { CONTROLLED_DOCUMENT_REQUEST_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import {
  ControlledDocumentRequestActionType,
  isControlledDocumentRequestActionType,
} from 'app/core/utils/controlled-document-request-action-type.util';
import { configureCdrActionValidation } from './cdr-action.validation';

@Component({
  selector: 'app-cdr-action',
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
    MatDatepickerModule,
    MatNativeDateModule,
    ApprovalWorkflowComponent,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './cdr-action.component.html',
  styleUrls: ['./cdr-action.component.scss']
})
export class CdrActionComponent implements OnInit, OnDestroy {
  actionForm: FormGroup;
  loading = false;
  requestId: string | null = null;
  request: any = null;
  actionType: ControlledDocumentRequestActionType | null = null;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();

  statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'reject', label: 'Reject' },
    { value: 'approved', label: 'Approve' },
  ];

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

  selectedCategories = new Set<string>();
  selectedRequestFor = new Set<string>();
  categoryViewOptions: Array<{ value: string; label: string; checked: boolean }> = [];
  requestForViewOptions: Array<{ value: string; label: string; checked: boolean }> = [];
  attachments: any[] = [];
  otherCategoryText = '-';
  showOtherCategory = false;
  statusClass = 'bg-yellow-100 text-yellow-800';

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private cdrService: ControlledDocumentRequestService,
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
      this.requestId = params['id'];
      const actionType = String(params['type'] || '');

      if (!isControlledDocumentRequestActionType(actionType)) {
        this.snackBar.open('This workflow step is no longer available', 'Close', { duration: 4000 });
        this.router.navigate(['/controlled-document-request/list']);
        return;
      }

      this.actionType = actionType;
      configureCdrActionValidation(this.actionForm, this.actionType);

      if (this.requestId) {
        this.loadRequest();
      }

      if (this.actionType && this.request) {
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
      comments: [''],
      newRevision: [''],
      actionEffectiveDate: [null]
    });
  }

  private setupFormForActionType(): void {
    if (!this.actionType || !this.request) return;

    let currentStatus = null;
    let currentComments = '';
    let newRevision = '';
    let actionEffectiveDate = null;

    switch (this.actionType) {
      case 'reviewed_by_status':
        currentStatus = this.request.reviewed_by_status?.toLowerCase() || 'pending';
        currentComments = this.request.review_comments || '';
        break;
      case 'approved_by_status':
        currentStatus = this.request.approved_by_status?.toLowerCase() || 'pending';
        currentComments = this.request.approval_comments || '';
        break;
      case 'acknowledged_by_status_2':
        currentStatus = this.request.acknowledged_by_status_2?.toLowerCase() || 'pending';
        newRevision = this.request?.new_revision || '';
        actionEffectiveDate = this.request?.action_effective_date ? new Date(this.request.action_effective_date) : null;
        break;
    }

    this.actionForm.patchValue({
      status: currentStatus,
      comments: currentComments,
      newRevision,
      actionEffectiveDate
    });
  }

  private loadRequest(): void {
    if (!this.requestId) return;

    this.loading = true;
    forkJoin({
      request: this.cdrService.findOne(this.requestId),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
    })
      .pipe(
        switchMap(({ request, employeeLookup, employeeLookupWithTitle }) => {
          const response = request as any;
          const req = (response.status !== undefined && response.data) ? response.data : response;
          const codes = [
            req.reviewed_by,
            req.approved_by,
            req.acknowledged_by,
            req.requested_by,
            req.create_by,
            req.update_by,
            req.acknowledged_by_2,
            req.reviewed_by_2,
            req.approved_by_2
          ].filter(code => !!code);
          return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
            switchMap(updatedLookup => {
              return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
                map(updatedLookupWithTitle => ({ request, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
              );
            })
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe({
        next: ({ request, employeeLookup, employeeLookupWithTitle }) => {
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          const response = request as any;
          if (response.status !== undefined && response.data) {
            this.request = response.data;
          } else if (response.id) {
            this.request = response;
          } else {
            this.request = response;
          }

          this.selectedCategories = new Set(this.parseCsvValues(this.request?.categories));
          this.selectedRequestFor = new Set(this.parseCsvValues(this.request?.request_for));
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

          this.setupFormForActionType();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading request:', error);
          this.snackBar.open('Error loading request', 'Close', { duration: 3000 });
          this.loading = false;
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

  getEmployeeLabelWithTitle(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookupWithTitle);
  }

  onSubmit(): void {
    if (this.actionForm.invalid || !this.requestId || !this.actionType) {
      this.actionForm.markAllAsTouched();
      this.snackBar.open('Please fill in all required fields.', 'Close', { duration: 3000 });
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
    const comments = formData.comments?.trim() || '';
    const status = formData.status;

    // รวม comment และ status ไปใน PATCH เดียวกัน
    this.updateStatusAndComment(status, comments);

    });
  }

  private updateStatusAndComment(status: string, comments: string): void {
    if (!this.requestId || !this.request || !this.actionType) {
      this.loading = false;
      return;
    }

    const statusLower = status.toLowerCase();
    const actionTimestamp = this.getCurrentLocalDateTime();

    // เตรียม payload สำหรับเรียกเส้นแก้ไข (update controlled_document_requests/:id)
    const updateData: any = {
      to: this.request.to || '',
      from: this.request.from || '',
      date: this.request.date || '',
      cdr_no: this.request.cdr_no || '',
      categories: this.request.categories || '',
      request_for: this.request.request_for || '',
      document_name: this.request.document_name || '',
      current_revision: this.request.current_revision || '',
      reason_description: this.request.reason_description || '',
      effective_date_purpose: this.request.effective_date_purpose || null,
      attach_document_note: this.request.attach_document_note || null,
      requested_by: this.request.requested_by || null,
      requested_date: this.request.requested_date || null,
      review_comments: this.request.review_comments || null,
      reviewed_by: this.request.reviewed_by || null,
      reviewed_by_date: this.request.reviewed_by_date || null,
      reviewed_by_status: this.request.reviewed_by_status || null,
      approval_comments: this.request.approval_comments || null,
      approved_by: this.request.approved_by || null,
      approved_by_date: this.request.approved_by_date || null,
      approved_by_status: this.request.approved_by_status || null,
      new_revision: this.request.new_revision || '',
      action_effective_date: this.request.action_effective_date || null,
      acknowledged_by: this.request.acknowledged_by || null,
      acknowledged_by_date: this.request.acknowledged_by_date || null,
      acknowledged_by_status_2: this.request.acknowledged_by_status_2 || null,
    };

    // อัปเดต field สถานะตาม actionType ปัจจุบัน
    switch (this.actionType) {
      case 'reviewed_by_status':
        updateData.reviewed_by_status = statusLower;
        updateData.reviewed_by_date = actionTimestamp;
        // อัปเดต comment ถ้ามี
        if (comments) {
          updateData.review_comments = comments;
        }
        break;
      case 'approved_by_status':
        updateData.approved_by_status = statusLower;
        updateData.approved_by_date = actionTimestamp;
        // อัปเดต comment ถ้ามี
        if (comments) {
          updateData.approval_comments = comments;
        }
        break;
      case 'acknowledged_by_status_2':
        updateData.workflow_action_type = this.actionType;
        updateData.acknowledged_by_status_2 = statusLower;
        updateData.acknowledged_by_date = actionTimestamp;
        updateData.new_revision = String(this.actionForm.get('newRevision')?.value ?? '').trim();
        updateData.action_effective_date = this.actionForm.get('actionEffectiveDate')?.value
          ? this.formatDateForApi(this.actionForm.get('actionEffectiveDate')?.value)
          : null;
        break;
    }

    this.cdrService.update(this.requestId, updateData)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: () => {
          this.sendActionEmailNotification(updateData, statusLower);
          this.snackBar.open('Status updated successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/controlled-document-request/list']);
        },
        error: (error) => {
          console.error('Error updating status:', error);
          const validationMessage = error?.error?.errors?.new_revision?.[0];
          this.snackBar.open(
            validationMessage || error?.error?.message || 'Error updating status',
            'Close',
            { duration: 3000 }
          );
          this.loading = false;
        }
      });
  }

  private sendActionEmailNotification(updatedPayload: any, status: string): void {
    if (!this.requestId || !this.actionType) {
      return;
    }

    this.workflowEmailNotificationService
      .notifyAfterAction(
        CONTROLLED_DOCUMENT_REQUEST_EMAIL_CONFIG,
        {
          ...this.request,
          ...updatedPayload,
          id: this.requestId
        },
        this.actionType,
        status,
        this.requestId
      )
      .subscribe({
        error: (error) => {
          console.error('Failed to send controlled document request email notification:', error);
          this.snackBar.open('Status updated, but email notification could not be sent', 'Close', { duration: 5000 });
        }
      });
  }

  formatDateForApi(date: Date | string | null | undefined): string | null {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
      case 'reviewed_by_status':
        return 'Review Status';
      case 'approved_by_status':
        return 'Approve Status';
      case 'acknowledged_by_status_2':
        return 'Final Action Status';
      default:
        return 'Update Status';
    }
  }

  getActionDescription(): string {
    switch (this.actionType) {
      case 'reviewed_by_status':
        return 'Update the review status for this request';
      case 'approved_by_status':
        return 'Update the approval status for this request';
      case 'acknowledged_by_status_2':
        return 'Update the final action status and revision info';
      default:
        return 'Update the status for this request';
    }
  }

  formatDate(dateString?: string | null | Date): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string | null | undefined | Date): string {
    return formatDateTimeDisplay(dateString);
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

  shouldShowReviewDetails(): boolean {
    return this.actionType === 'approved_by_status' || this.actionType === 'acknowledged_by_status_2';
  }

  shouldShowApprovalDetails(): boolean {
    return this.actionType === 'acknowledged_by_status_2';
  }

  getCategoriesText(categories: string | null | undefined): string {
    if (!categories) return '-';
    // Handle both array and string (comma separated)
    const cats = Array.isArray(categories) ? categories : String(categories).split(',').map(c => c.trim());
    const labels: { [key: string]: string } = {
      'ims': 'IMS Documentation',
      'acp': 'ACP Documentation',
      'master_tech_specs': 'Master Technical Specifications',
      'anti_corruption': 'Anti-Corruption Programme Booklet',
      'other': 'Other'
    };
    return cats.map(c => labels[c] || c).join(', ');
  }

  getRequestForText(requestFor: string | null | undefined): string {
    if (!requestFor) return '-';
    // Handle both array and string (comma separated)
    const reqs = Array.isArray(requestFor) ? requestFor : String(requestFor).split(',').map(r => r.trim());
    const labels: { [key: string]: string } = {
      'addition': 'Addition',
      'amendment': 'Amendment',
      'deletion': 'Deletion',
      'copy': 'A copy'
    };
    return reqs.map(r => labels[r] || r).join(', ');
  }

  get workflowSteps(): ApprovalWorkflowStep[] {
    if (!this.request) return [];

    return [
      {
        key: 'reviewed',
        title: 'Review by',
        assignee: this.getEmployeeLabel(this.request.reviewed_by),
        date: this.formatDateTime(this.request.reviewed_by_date),
        status: this.request.reviewed_by_status,
        comments: this.request.review_comments
      },
      {
        key: 'approved',
        title: 'Approve by',
        assignee: this.getEmployeeLabel(this.request.approved_by),
        date: this.formatDateTime(this.request.approved_by_date),
        status: this.request.approved_by_status,
        comments: this.request.approval_comments
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
}
