import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, takeUntil, debounceTime, distinctUntilChanged, switchMap, finalize } from 'rxjs';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ApiService } from 'app/core/services/api.service';
import { EmployeeOption, EmployeeService } from 'app/core/services/employee.service';
import { formatAttachmentSize, getAttachmentHref, normalizeAttachments } from 'app/core/utils/attachment-url.util';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { EXPENSES_CLAIM_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';

interface ProjectDetailOption {
  id: number;
  code: string;
  name: string;
  detail?: string;
  is_active?: number;
}

@Component({
  selector: 'app-expenses-claim-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDialogModule,
    NgxMatSelectSearchModule,
  ],
  templateUrl: './expenses-claim-form.component.html',
  styleUrls: ['./expenses-claim-form.component.scss'],
})
export class ExpensesClaimFormComponent implements OnInit, OnDestroy {
  form: FormGroup;
  isEditMode = false;
  isLoading = false;
  isSubmitting = false;
  isSavingDraft = false;
  currentId: string | null = null;
  currentClaim: any = null;

  users: EmployeeOption[] = [];
  filteredClaimantUsers: EmployeeOption[] = [];
  filteredVerifiedUsers: EmployeeOption[] = [];
  filteredApprovedUsers: EmployeeOption[] = [];
  projectDetails: ProjectDetailOption[] = [];
  claimantSearchCtrl = new FormControl('');
  verifiedBySearchCtrl = new FormControl('');
  approvedBySearchCtrl = new FormControl('');

  isSearchingClaimant = false;
  isSearchingVerified = false;
  isSearchingApproved = false;

  readonly maxAttachmentFiles = 10;


  private _unsubscribeAll = new Subject<void>();
  private defaultClaimantLookupStarted = false;

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private employeeService: EmployeeService,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private fuseConfirmationService: FuseConfirmationService,
    private dialog: MatDialog
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    this.currentId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.currentId;

    this.setupSearchControls();
    this.loadDropdowns();

    if (this.isEditMode && this.currentId) {
      this.loadClaim(this.currentId);
    } else {
      this.patchDefaultClaimant();
      this.loadDraft();
    }
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next();
    this._unsubscribeAll.complete();
  }

  private createForm(): FormGroup {
    return this.fb.group({
      voucherNo: [{ value: '', disabled: true }],
      claimantName: ['', Validators.required],
      reciveBy: [''],
      claimDate: [new Date(), Validators.required],
      items: this.fb.array([]),
      attachments: this.fb.array([]),
      verifiedBy: ['', Validators.required],
      approvedBy: ['', Validators.required],
    });
  }

  private loadDropdowns(): void {
    // Load initial top users for each dropdown
    this.employeeService.getEmployeeOptions('', 50)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (users) => {
          this.users = users || [];
          if (!this.filteredClaimantUsers.length) {
            this.filteredClaimantUsers = this.users;
          } else {
            this.filteredClaimantUsers = this.mergeUniqueList(this.filteredClaimantUsers, this.users);
          }
          if (!this.filteredVerifiedUsers.length) this.filteredVerifiedUsers = this.users;
          if (!this.filteredApprovedUsers.length) this.filteredApprovedUsers = this.users;
          this.patchDefaultClaimant();
        },
        error: () => {
          this.users = [];
        }
      });
  }

  private setupSearchControls(): void {
    const bindSearch = (control: FormControl, target: 'claimant' | 'verified' | 'approved') => {
      control.valueChanges
        .pipe(
          takeUntil(this._unsubscribeAll),
          debounceTime(300),
          distinctUntilChanged(),
          switchMap(term => {
            const normalizedTerm = String(term || '').trim();
            if (target === 'claimant') this.isSearchingClaimant = true;
            if (target === 'verified') this.isSearchingVerified = true;
            if (target === 'approved') this.isSearchingApproved = true;

            return this.employeeService.getEmployeeOptions(normalizedTerm, 50).pipe(
              finalize(() => {
                if (target === 'claimant') this.isSearchingClaimant = false;
                if (target === 'verified') this.isSearchingVerified = false;
                if (target === 'approved') this.isSearchingApproved = false;
              })
            );
          })
        )
        .subscribe(users => {
          if (target === 'claimant') this.filteredClaimantUsers = users;
          if (target === 'verified') this.filteredVerifiedUsers = users;
          if (target === 'approved') this.filteredApprovedUsers = users;

          // Ensure currently selected value is in the list
          this.ensureSelectedOptionInList(target);
        });
    };

    bindSearch(this.claimantSearchCtrl, 'claimant');
    bindSearch(this.verifiedBySearchCtrl, 'verified');
    bindSearch(this.approvedBySearchCtrl, 'approved');
  }

  private ensureSelectedOptionInList(target: 'claimant' | 'verified' | 'approved'): void {
    let controlName: string;
    let list: EmployeeOption[];

    switch (target) {
      case 'claimant': controlName = 'claimantName'; list = this.filteredClaimantUsers; break;
      case 'verified': controlName = 'verifiedBy'; list = this.filteredVerifiedUsers; break;
      case 'approved': controlName = 'approvedBy'; list = this.filteredApprovedUsers; break;
    }

    const selectedCode = this.form.get(controlName)?.value;
    if (!selectedCode) return;

    if (!list.some(u => u.code === selectedCode)) {
      this.employeeService.getEmployeeOptionByReference(selectedCode)
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe(user => {
          if (user) {
            if (target === 'claimant') {
              this.filteredClaimantUsers = this.mergeUnique(this.filteredClaimantUsers, user);
              if (user.code !== selectedCode) {
                this.form.patchValue({ claimantName: user.code }, { emitEvent: false });
              }
            }
            if (target === 'verified') this.filteredVerifiedUsers = this.mergeUnique(this.filteredVerifiedUsers, user);
            if (target === 'approved') this.filteredApprovedUsers = this.mergeUnique(this.filteredApprovedUsers, user);
          }
        });
    }
  }



  private ensureEmployeesLoaded(claim: any): void {
    const codes = [claim.claimant_name, claim.verified_by, claim.approved_by].filter(Boolean);
    if (!codes.length) return;

    forkJoin(codes.map(code => this.employeeService.getEmployeeOptionByReference(code)))
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe(users => {
        users.forEach((user, index) => {
          if (!user) return;
          const code = codes[index];
          if (code === claim.claimant_name) {
            this.filteredClaimantUsers = this.mergeUnique(this.filteredClaimantUsers, user);
            if (user.code && user.code !== claim.claimant_name && this.form.get('claimantName')?.value === claim.claimant_name) {
              this.form.patchValue({ claimantName: user.code }, { emitEvent: false });
            }
          }
          if (code === claim.verified_by) this.filteredVerifiedUsers = this.mergeUnique(this.filteredVerifiedUsers, user);
          if (code === claim.approved_by) this.filteredApprovedUsers = this.mergeUnique(this.filteredApprovedUsers, user);
        });
      });
  }

  private mergeUnique(list: EmployeeOption[], user: EmployeeOption): EmployeeOption[] {
    if (list.some(u => u.code === user.code)) return list;
    return [user, ...list];
  }

  private mergeUniqueList(list: EmployeeOption[], users: EmployeeOption[]): EmployeeOption[] {
    const merged = [...list];
    users.forEach((user) => {
      if (user?.code && !merged.some((option) => option.code === user.code)) {
        merged.push(user);
      }
    });
    return merged;
  }

  private patchDefaultClaimant(): void {
    if (this.isEditMode || this.form.get('claimantName')?.value) return;

    const userCode = getCurrentUserCode();
    if (!userCode) return;

    const currentUser = this.findEmployeeByReference(this.users, userCode);
    if (currentUser?.code) {
      this.patchClaimantUser(currentUser);
      return;
    }

    if (this.defaultClaimantLookupStarted) return;
    this.defaultClaimantLookupStarted = true;

    this.employeeService.getEmployeeOptionsFromApi(userCode, 10)
      .pipe(
        takeUntil(this._unsubscribeAll),
        finalize(() => this.defaultClaimantLookupStarted = false)
      )
      .subscribe((users) => {
        if (this.isEditMode || this.form.get('claimantName')?.value) return;

        const matchedUser = this.findEmployeeByReference(users, userCode) || users[0];
        if (matchedUser?.code) {
          this.patchClaimantUser(matchedUser);
        }
      });
  }

  private findEmployeeByReference(users: EmployeeOption[], ref: string): EmployeeOption | undefined {
    const target = String(ref || '').trim().toLowerCase();
    if (!target) return undefined;

    return users.find((user) => {
      const candidates = [
        user.code,
        user.id,
        user.employeeId !== undefined && user.employeeId !== null ? String(user.employeeId) : '',
        user.email,
      ];

      return candidates.some((candidate) => String(candidate || '').trim().toLowerCase() === target);
    });
  }

  private patchClaimantUser(user: EmployeeOption): void {
    this.users = this.mergeUnique(this.users, user);
    this.filteredClaimantUsers = this.mergeUnique(this.filteredClaimantUsers, user);
    const reciveBy = this.form.get('reciveBy')?.value;
    this.form.patchValue(
      {
        claimantName: user.code,
        reciveBy: reciveBy || user.code,
      },
      { emitEvent: false }
    );
  }

  private loadClaim(id: string): void {
    this.isLoading = true;
    this.apiService.getExpensesClaim(id)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (response) => {
          if (response?.status && response?.data) {
            this.currentClaim = response.data;
            const claimForForm = String(response.data.status || '').toLowerCase() === 'draft'
              ? this.extractDraftPayload(response.data)
              : response.data;
            this.patchForm(claimForForm);
            this.form.patchValue({
              voucherNo: response.data.voucher_no || claimForForm?.voucher_no || '',
            });
          } else {
            this.snackBar.open(response?.message || 'Failed to load expenses claim', 'Close', { duration: 3000 });
            this.router.navigate(['/expenses-claim/list']);
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading expenses claim:', error);
          this.snackBar.open(error?.error?.message || 'Error loading expenses claim', 'Close', { duration: 3000 });
          this.router.navigate(['/expenses-claim/list']);
          this.isLoading = false;
        }
      });
  }

  private loadDraft(): void {
    this.isLoading = true;
    this.apiService.getExpensesClaimDraft()
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (response) => {
          if (response?.status && response?.data) {
            this.currentClaim = response.data;
            this.currentId = String(response.data.id);
            const draftPayload = this.extractDraftPayload(response.data);
            this.patchForm(draftPayload);
            this.form.patchValue({ voucherNo: response.data.voucher_no || draftPayload?.voucher_no || '' });
          } else {
            this.apiService.getExpensesClaimCreate()
              .pipe(takeUntil(this._unsubscribeAll))
              .subscribe({
                next: (createRes) => {
                  if (createRes?.status && createRes?.data?.voucher_no) {
                    this.form.patchValue({ voucherNo: createRes.data.voucher_no });
                  }
                  this.addItem();
                },
                error: () => this.addItem()
              });
          }
          this.isLoading = false;
        },
        error: () => {
          this.apiService.getExpensesClaimCreate()
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
              next: (createRes) => {
                if (createRes?.status && createRes?.data?.voucher_no) {
                  this.form.patchValue({ voucherNo: createRes.data.voucher_no });
                }
                this.addItem();
              },
              error: () => this.addItem()
            });
          this.isLoading = false;
        }
      });
  }

  private extractDraftPayload(claim: any): any {
    const payload = claim?.draft_payload;
    if (payload && typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return claim;
      }
    }
    if (payload && typeof payload === 'object') {
      return { ...payload, voucher_no: claim?.voucher_no || payload.voucher_no };
    }
    return claim;
  }

  private patchForm(claim: any): void {
    this.itemsArray.clear();

    this.form.patchValue({
      voucherNo: claim.voucher_no || '',
      claimantName: claim.claimant_name || '',
      reciveBy: claim.recive_by || claim.create_by || '',
      claimDate: this.toDate(claim.claim_date),
      verifiedBy: claim.verified_by || '',
      approvedBy: claim.approved_by || '',
    });

    this.ensureEmployeesLoaded(claim);

    this.setAttachments(claim.attachments);

    const items = Array.isArray(claim.items) ? claim.items : [];
    if (items.length > 0) {
      items.forEach((item: any) => this.itemsArray.push(this.createItemGroup(item)));
    } else {
      this.addItem();
    }
  }

  get itemsArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get attachmentsArray(): FormArray {
    return this.form.get('attachments') as FormArray;
  }

  get canSaveDraft(): boolean {
    return !this.isEditMode || this.currentClaim?.status === 'draft';
  }

  createItemGroup(item?: any): FormGroup {
    return this.fb.group({
      itemDate: [this.toDate(item?.item_date) || new Date(), Validators.required],
      projectName: [item?.project_name || ''],
      details: [item?.details || '', Validators.required],
      baht: [Number(item?.baht || 0), [Validators.required, Validators.min(0.01)]],
    });
  }

  addItem(): void {
    this.itemsArray.push(this.createItemGroup());
  }

  removeItem(index: number): void {
    if (this.itemsArray.length <= 1) {
      this.snackBar.open('At least one item is required', 'Close', { duration: 2500 });
      return;
    }
    this.itemsArray.removeAt(index);
  }

  get totalBaht(): number {
    return this.itemsArray.controls.reduce((sum, ctrl) => sum + Number(ctrl.get('baht')?.value || 0), 0);
  }

  onSubmit(): void {
    if (this.form.invalid || this.itemsArray.length === 0) {
      this.form.markAllAsTouched();
      this.snackBar.open('Please complete all required fields', 'Close', { duration: 3000 });
      return;
    }

    const confirmation = this.fuseConfirmationService.open({
      title: this.isEditMode ? 'Confirm update' : 'Confirm submit',
      message: this.isEditMode
        ? 'Are you sure you want to update this expenses claim?'
        : 'Are you sure you want to submit this expenses claim?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: this.isEditMode ? 'Update' : 'Submit', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      this.submitForm();
    });
  }

  private submitForm(): void {
    this.isSubmitting = true;
    const payload = this.buildPayload('submitted');
    const shouldNotifyInitial = !this.currentId || String(this.currentClaim?.status || '').toLowerCase() === 'draft';
    const request = this.currentId
      ? this.apiService.updateExpensesClaim(this.currentId, payload)
      : this.apiService.createExpensesClaim(payload);

    request.pipe(takeUntil(this._unsubscribeAll)).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        if (response?.status) {
          if (shouldNotifyInitial) {
            this.sendInitialEmailNotification(payload, response);
          }
          this.snackBar.open(response.message || 'Expenses claim saved successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/expenses-claim/list']);
        } else {
          this.snackBar.open(response?.message || 'Failed to save expenses claim', 'Close', { duration: 3000 });
        }
      },
      error: (error) => {
        console.error('Error saving expenses claim:', error);
        this.isSubmitting = false;
        this.snackBar.open(error?.error?.message || 'Failed to save expenses claim', 'Close', { duration: 3500 });
      }
    });
  }

  private sendInitialEmailNotification(payload: any, response: any): void {
    const claimId = this.workflowEmailNotificationService.readResponseId(response) || this.currentId;
    const notificationSource = {
      ...this.workflowEmailNotificationService.createNotificationSource(payload, response),
      id: claimId,
    };

    this.workflowEmailNotificationService
      .notifyInitialAction(EXPENSES_CLAIM_EMAIL_CONFIG, notificationSource, claimId)
      .subscribe({
        error: (error) => {
          console.error('Failed to send expenses claim email notification:', error);
          this.snackBar.open('Expenses claim was saved, but email notification could not be sent', 'Close', { duration: 5000 });
        }
      });
  }

  onSaveDraft(): void {
    if (!this.canSaveDraft) {
      return;
    }

    if (this.itemsArray.length === 0) {
      this.addItem();
    }

    this.isSavingDraft = true;
    const payload = this.buildPayload('draft');
    const request = this.currentId
      ? this.apiService.updateExpensesClaim(this.currentId, payload)
      : this.apiService.createExpensesClaim(payload);

    request.pipe(takeUntil(this._unsubscribeAll)).subscribe({
      next: (response) => {
        this.isSavingDraft = false;
        if (response?.status && response?.data) {
          this.currentClaim = response.data;
          this.currentId = String(response.data.id);
          const draftPayload = this.extractDraftPayload(response.data);
          this.patchForm(draftPayload);
          this.form.patchValue({ voucherNo: response.data.voucher_no || draftPayload?.voucher_no || '' });
          this.snackBar.open(response.message || 'Draft saved', 'Close', { duration: 2500 });
        } else {
          this.snackBar.open(response?.message || 'Failed to save draft', 'Close', { duration: 3000 });
        }
      },
      error: (error) => {
        console.error('Error saving expenses claim draft:', error);
        this.isSavingDraft = false;
        this.snackBar.open(error?.error?.message || 'Failed to save draft', 'Close', { duration: 3500 });
      }
    });
  }

  private buildPayload(status: 'draft' | 'submitted' = 'submitted'): any {
    const value = this.form.getRawValue();
    return {
      voucher_no: value.voucherNo || null,
      claimant_name: value.claimantName,
      recive_by: this.resolveReciveBy(),
      claim_date: this.formatDateForAPI(value.claimDate),
      total_baht: this.totalBaht,
      attachments: this.getAttachmentsPayload(),
      verified_by: value.verifiedBy,
      verified_by_status: this.currentClaim?.verified_by_status || 'pending',
      verified_by_date: this.currentClaim?.verified_by_date || null,
      approved_by: value.approvedBy,
      approved_by_status: this.currentClaim?.approved_by_status || 'pending',
      approved_by_date: this.currentClaim?.approved_by_date || null,
      account_by: null,
      account_by_status: null,
      account_by_date: null,
      status,
      items: this.itemsArray.value.map((item: any, index: number) => {
        return {
          seq: index + 1,
          item_date: this.formatDateForAPI(item.itemDate),
          project_detail_id: null,
          project_code: '',
          project_name: this.normalizeOptionalString(item.projectName),
          details: item.details,
          baht: Number(item.baht || 0),
        };
      }),
    };
  }

  private resolveReciveBy(): string | null {
    const formValue = this.form.get('reciveBy')?.value;
    const claimantName = this.form.get('claimantName')?.value;
    return this.currentClaim?.recive_by || formValue || claimantName || getCurrentUserCode() || null;
  }

  onCancel(): void {
    this.router.navigate(['/expenses-claim/list']);
  }

  isControlInvalid(control: string): boolean {
    const field = this.form.get(control);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  isItemControlInvalid(index: number, control: string): boolean {
    const field = this.itemsArray.at(index).get(control);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }



  private toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  private formatDateForAPI(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const date = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeOptionalString(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  formatAmount(value: number | string | null | undefined): string {
    return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  trackByIndex(index: number): number {
    return index;
  }

  openUploadDialog(): void {
    const remainingSlots = this.maxAttachmentFiles - this.attachmentsArray.length;
    if (remainingSlots <= 0) {
      this.snackBar.open(`You can attach up to ${this.maxAttachmentFiles} files only`, 'Close', { duration: 3000 });
      return;
    }

    const ref = this.dialog.open(FuseUploadDialogComponent, {
      width: '560px',
      data: {
        maxItems: remainingSlots,
        uploadPath: 'uploads/expenses-claim/',
        original: 'Y',
      },
    });

    ref.afterClosed()
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe((result) => {
        if (!result) {
          return;
        }

        (Array.isArray(result) ? result : [result])
          .slice(0, remainingSlots)
          .forEach((item) => this.attachmentsArray.push(this.createAttachmentGroup(item)));
      });
  }

  removeAttachment(index: number): void {
    this.attachmentsArray.removeAt(index);
  }

  getAttachmentHref(path: string | null | undefined): string {
    return getAttachmentHref(path);
  }

  formatAttachmentSize(value: unknown): string {
    return formatAttachmentSize(value);
  }

  private setAttachments(value: unknown): void {
    this.attachmentsArray.clear();
    normalizeAttachments(value).forEach((item) => {
      this.attachmentsArray.push(this.createAttachmentGroup(item));
    });
  }

  private createAttachmentGroup(item: any): FormGroup {
    const isStringItem = typeof item === 'string';
    const filePath = String(
      isStringItem ? item : item?.file_path ?? item?.path ?? item?.file_url ?? item?.url ?? ''
    ).trim();
    const type = isStringItem ? 'file' : item?.type ?? 'file';
    const fileName = type === 'link'
      ? filePath
      : String(
          isStringItem
            ? filePath.split(/[\\/]/).pop() || filePath
            : item?.file_name ?? item?.fileName ?? item?.name ?? (filePath.split(/[\\/]/).pop() || '')
        ).trim();

    return this.fb.group({
      id: [isStringItem ? null : item?.id ?? null],
      file_name: [fileName],
      file_path: [filePath],
      file_url: [isStringItem ? '' : item?.file_url ?? item?.url ?? ''],
      file_size: [isStringItem ? null : item?.file_size ?? item?.fileSize ?? null],
      mime_type: [isStringItem ? '' : item?.mime_type ?? ''],
      description: [isStringItem ? '' : item?.description ?? ''],
      uploaded_at: [isStringItem ? null : item?.uploaded_at ?? item?.uploadDate ?? item?.upload_date ?? null],
      type: [type],
      file: [isStringItem ? null : item?.file ?? null],
    });
  }

  private getAttachmentsPayload(): any[] {
    return this.attachmentsArray.controls
      .map((control) => control.value)
      .filter((item) => String(item?.file_path || '').trim())
      .slice(0, this.maxAttachmentFiles)
      .map((item) => ({
        id: item.id || null,
        file_name: item.file_name || '',
        file_path: item.file_path || '',
        file_url: item.file_url || '',
        file_size: item.file_size || null,
        mime_type: item.mime_type || '',
        description: item.description || '',
        uploaded_at: item.uploaded_at || null,
        type: item.type || 'file',
      }));
  }
}
