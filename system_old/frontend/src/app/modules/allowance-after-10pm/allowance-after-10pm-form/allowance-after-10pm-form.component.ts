import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, takeUntil, debounceTime, distinctUntilChanged, switchMap, finalize } from 'rxjs';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { NgxMaterialTimepickerModule } from 'ngx-material-timepicker';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ApiService } from 'app/core/services/api.service';
import { EmployeeOption, EmployeeService } from 'app/core/services/employee.service';
import { formatAttachmentSize, getAttachmentHref, normalizeAttachments } from 'app/core/utils/attachment-url.util';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { ALLOWANCE_AFTER_10PM_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import {
  ALLOWANCE_AFTER_10PM_DISCIPLINE_OPTIONS,
  buildAllowanceAfter10pmDisciplinePayload,
  resolveAllowanceAfter10pmDisciplineFormValue
} from '../allowance-after-10pm-discipline.util';

interface ProjectDetailOption {
  id: number;
  code: string;
  name: string;
  detail?: string;
  is_active?: number;
}

@Component({
  selector: 'app-allowance-after-10pm-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatDialogModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
    NgxMatSelectSearchModule,
    NgxMaterialTimepickerModule,
  ],
  templateUrl: './allowance-after-10pm-form.component.html',
  styleUrls: ['./allowance-after-10pm-form.component.scss'],
})
export class AllowanceAfter10pmFormComponent implements OnInit, OnDestroy {
  form: FormGroup;
  isEditMode = false;
  isLoading = false;
  isSubmitting = false;
  isSavingDraft = false;
  currentId: string | null = null;
  currentAllowance: any = null;

  users: EmployeeOption[] = [];
  filteredClaimantUsers: EmployeeOption[] = [];
  filteredTlUsers: EmployeeOption[] = [];
  filteredDiUsers: EmployeeOption[] = [];
  projectDetails: ProjectDetailOption[] = [];

  readonly disciplineOptions = ALLOWANCE_AFTER_10PM_DISCIPLINE_OPTIONS;
  readonly maxAttachmentFiles = 5;

  claimantSearchCtrl = new FormControl('');
  tlBySearchCtrl = new FormControl('');
  diBySearchCtrl = new FormControl('');

  isSearchingClaimant = false;
  isSearchingTl = false;
  isSearchingDi = false;

  private _unsubscribeAll = new Subject<void>();
  private defaultRequesterLookupStarted = false;

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private employeeService: EmployeeService,
    private dialog: MatDialog,
    private route: ActivatedRoute,
    private router: Router,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private fuseConfirmationService: FuseConfirmationService,
    private snackBar: MatSnackBar
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    this.currentId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.currentId;

    this.setupSearchControls();
    this.loadDropdowns();

    if (this.isEditMode && this.currentId) {
      this.loadAllowance(this.currentId);
    } else {
      this.patchDefaultRequester();
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
      discipline: ['', Validators.required],
      disciplineOther: ['', [Validators.maxLength(255)]],
      requestDate: [new Date(), Validators.required],
      items: this.fb.array([]),
      attachments: this.fb.array([]),
      tlBy: ['', Validators.required],
      diBy: ['', Validators.required],
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
          if (!this.filteredTlUsers.length) this.filteredTlUsers = this.users;
          if (!this.filteredDiUsers.length) this.filteredDiUsers = this.users;
          this.patchDefaultRequester();
        },
        error: () => {
          this.users = [];
        }
      });
  }

  private setupSearchControls(): void {
    const bindSearch = (control: FormControl, target: 'claimant' | 'tl' | 'di') => {
      control.valueChanges
        .pipe(
          takeUntil(this._unsubscribeAll),
          debounceTime(300),
          distinctUntilChanged(),
          switchMap(term => {
            const normalizedTerm = String(term || '').trim();
            if (target === 'claimant') this.isSearchingClaimant = true;
            if (target === 'tl') this.isSearchingTl = true;
            if (target === 'di') this.isSearchingDi = true;

            return this.employeeService.getEmployeeOptions(normalizedTerm, 50).pipe(
              finalize(() => {
                if (target === 'claimant') this.isSearchingClaimant = false;
                if (target === 'tl') this.isSearchingTl = false;
                if (target === 'di') this.isSearchingDi = false;
              })
            );
          })
        )
        .subscribe(users => {
          if (target === 'claimant') this.filteredClaimantUsers = users;
          if (target === 'tl') this.filteredTlUsers = users;
          if (target === 'di') this.filteredDiUsers = users;

          this.ensureSelectedOptionInList(target);
        });
    };

    bindSearch(this.claimantSearchCtrl, 'claimant');
    bindSearch(this.tlBySearchCtrl, 'tl');
    bindSearch(this.diBySearchCtrl, 'di');
  }

  private ensureSelectedOptionInList(target: 'claimant' | 'tl' | 'di'): void {
    let controlName: string;
    let list: EmployeeOption[];

    switch (target) {
      case 'claimant': controlName = 'claimantName'; list = this.filteredClaimantUsers; break;
      case 'tl': controlName = 'tlBy'; list = this.filteredTlUsers; break;
      case 'di': controlName = 'diBy'; list = this.filteredDiUsers; break;
    }

    const selectedCode = this.form.get(controlName)?.value;
    if (!selectedCode) return;

    if (!list.some(u => u.code === selectedCode)) {
      this.employeeService.getEmployeeOptionByReference(selectedCode)
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe(user => {
          if (user) {
            if (target === 'claimant') this.filteredClaimantUsers = this.mergeUnique(this.filteredClaimantUsers, user);
            if (target === 'tl') this.filteredTlUsers = this.mergeUnique(this.filteredTlUsers, user);
            if (target === 'di') this.filteredDiUsers = this.mergeUnique(this.filteredDiUsers, user);
          }
        });
    }
  }



  private ensureEmployeesLoaded(allowance: any): void {
    const codes = [allowance.claimant_name, allowance.tl_by, allowance.di_by].filter(Boolean);
    if (!codes.length) return;

    forkJoin(codes.map(code => this.employeeService.getEmployeeOptionByReference(code))).subscribe(users => {
      users.forEach((user, index) => {
        if (!user) return;
        const code = codes[index];
        if (code === allowance.claimant_name) this.filteredClaimantUsers = this.mergeUnique(this.filteredClaimantUsers, user);
        if (code === allowance.tl_by) this.filteredTlUsers = this.mergeUnique(this.filteredTlUsers, user);
        if (code === allowance.di_by) this.filteredDiUsers = this.mergeUnique(this.filteredDiUsers, user);
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

  onDisciplineChange(value: string, checked: boolean): void {
    this.form.patchValue({
      discipline: checked ? value : '',
      disciplineOther: checked && value === 'Other' ? this.form.get('disciplineOther')?.value : '',
    });
    this.form.get('discipline')?.markAsTouched();
    this.updateDisciplineOtherValidators();
  }

  private updateDisciplineOtherValidators(): void {
    const control = this.form.get('disciplineOther');
    if (!control) return;

    if (this.form.get('discipline')?.value === 'Other') {
      control.setValidators([Validators.required, Validators.maxLength(255)]);
    } else {
      control.clearValidators();
      control.setValue('', { emitEvent: false });
    }

    control.updateValueAndValidity({ emitEvent: false });
  }

  private patchDefaultRequester(): void {
    if (this.isEditMode || this.form.get('claimantName')?.value) return;

    const userCode = getCurrentUserCode();
    if (!userCode) return;

    const currentUser = this.findEmployeeByReference(this.users, userCode);
    if (currentUser?.code) {
      this.patchClaimantUser(currentUser);
      return;
    }

    if (this.defaultRequesterLookupStarted) return;
    this.defaultRequesterLookupStarted = true;

    this.employeeService.getEmployeeOptionsFromApi(userCode, 10)
      .pipe(
        takeUntil(this._unsubscribeAll),
        finalize(() => this.defaultRequesterLookupStarted = false)
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
    this.form.patchValue({ claimantName: user.code }, { emitEvent: false });
  }

  private loadAllowance(id: string): void {
    this.isLoading = true;
    this.apiService.getAllowanceAfter10pm(id)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (response) => {
          if (response?.status && response?.data) {
            this.currentAllowance = response.data;
            const payload = String(response.data.status || '').toLowerCase() === 'draft'
              ? this.extractDraftPayload(response.data)
              : response.data;
            this.patchForm(payload);
            this.form.patchValue({ voucherNo: response.data.voucher_no || payload?.voucher_no || '' });
          } else {
            this.snackBar.open(response?.message || 'Failed to load allowance form', 'Close', { duration: 3000 });
            this.router.navigate(['/allowance-after-10pm/list']);
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading allowance after 10pm:', error);
          this.snackBar.open(error?.error?.message || 'Error loading allowance form', 'Close', { duration: 3000 });
          this.router.navigate(['/allowance-after-10pm/list']);
          this.isLoading = false;
        }
      });
  }

  private loadDraft(): void {
    this.isLoading = true;
    this.apiService.getAllowanceAfter10pmDraft()
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (response) => {
          if (response?.status && response?.data) {
            this.currentAllowance = response.data;
            this.currentId = String(response.data.id);
            const draftPayload = this.extractDraftPayload(response.data);
            this.patchForm(draftPayload);
            this.form.patchValue({ voucherNo: response.data.voucher_no || draftPayload?.voucher_no || '' });
          } else {
            this.apiService.getAllowanceAfter10pmCreate()
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
          this.apiService.getAllowanceAfter10pmCreate()
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

  private extractDraftPayload(allowance: any): any {
    const payload = allowance?.draft_payload;
    if (payload && typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return allowance;
      }
    }
    if (payload && typeof payload === 'object') {
      return payload;
    }
    return allowance;
  }

  private patchForm(allowance: any): void {
    this.itemsArray.clear();
    const disciplineValue = resolveAllowanceAfter10pmDisciplineFormValue(allowance.discipline);

    this.form.patchValue({
      voucherNo: allowance.voucher_no || '',
      claimantName: allowance.claimant_name || '',
      discipline: disciplineValue.discipline,
      disciplineOther: disciplineValue.disciplineOther,
      requestDate: this.toDate(allowance.request_date),
      tlBy: allowance.tl_by || '',
      diBy: allowance.di_by || '',
    });
    this.updateDisciplineOtherValidators();

    this.ensureEmployeesLoaded(allowance);

    const items = Array.isArray(allowance.items) ? allowance.items : [];
    if (items.length > 0) {
      items.forEach((item: any) => this.itemsArray.push(this.createItemGroup(item)));
    } else {
      this.addItem();
    }

    this.setAttachments(allowance.attachments);
  }

  get itemsArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get attachmentsArray(): FormArray {
    return this.form.get('attachments') as FormArray;
  }

  get canSaveDraft(): boolean {
    return !this.isEditMode || this.currentAllowance?.status === 'draft';
  }

  createItemGroup(item?: any): FormGroup {
    return this.fb.group({
      workDate: [this.toDate(item?.work_date) || new Date(), Validators.required],
      projectName: [item?.project_name || ''],
      description: [item?.description || '', Validators.required],
      timeFrom: [this.toTimeInputValue(item?.time_from) || '', Validators.required],
      timeTo: [this.toTimeInputValue(item?.time_to) || '', Validators.required],
      baht: [Number(item?.baht || 0), [Validators.required, Validators.min(0.01)]],
    });
  }

  addItem(): void {
    this.itemsArray.push(this.createItemGroup());
  }

  removeItem(index: number): void {
    if (this.itemsArray.length <= 1) {
      this.snackBar.open('At least one row is required', 'Close', { duration: 2500 });
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
        ? 'Are you sure you want to update this allowance request?'
        : 'Are you sure you want to submit this allowance request?',
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
    const shouldNotifyInitial = !this.currentId || String(this.currentAllowance?.status || '').toLowerCase() === 'draft';
    const request = this.currentId
      ? this.apiService.updateAllowanceAfter10pm(this.currentId, payload)
      : this.apiService.createAllowanceAfter10pm(payload);

    request.pipe(takeUntil(this._unsubscribeAll)).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        if (response?.status) {
          if (shouldNotifyInitial) {
            this.sendInitialEmailNotification(payload, response);
          }
          this.snackBar.open(response.message || 'Allowance form saved successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/allowance-after-10pm/list']);
        } else {
          this.snackBar.open(response?.message || 'Failed to save allowance form', 'Close', { duration: 3000 });
        }
      },
      error: (error) => {
        console.error('Error saving allowance after 10pm:', error);
        this.isSubmitting = false;
        this.snackBar.open(error?.error?.message || 'Failed to save allowance form', 'Close', { duration: 3500 });
      }
    });
  }

  private sendInitialEmailNotification(payload: any, response: any): void {
    const allowanceId = this.workflowEmailNotificationService.readResponseId(response) || this.currentId;
    const notificationSource = {
      ...this.workflowEmailNotificationService.createNotificationSource(payload, response),
      id: allowanceId,
    };

    this.workflowEmailNotificationService
      .notifyInitialAction(ALLOWANCE_AFTER_10PM_EMAIL_CONFIG, notificationSource, allowanceId)
      .subscribe({
        error: (error) => {
          console.error('Failed to send allowance after 10pm email notification:', error);
          this.snackBar.open('Allowance form was saved, but email notification could not be sent', 'Close', { duration: 5000 });
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
      ? this.apiService.updateAllowanceAfter10pm(this.currentId, payload)
      : this.apiService.createAllowanceAfter10pm(payload);

    request.pipe(takeUntil(this._unsubscribeAll)).subscribe({
      next: (response) => {
        this.isSavingDraft = false;
        if (response?.status && response?.data) {
          this.currentAllowance = response.data;
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
        console.error('Error saving allowance after 10pm draft:', error);
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
      discipline: buildAllowanceAfter10pmDisciplinePayload(value.discipline, value.disciplineOther),
      request_date: this.formatDateForAPI(value.requestDate),
      total_baht: this.totalBaht,
      attachments: this.getAttachmentsPayload(),
      tl_by: value.tlBy,
      tl_by_status: this.currentAllowance?.tl_by_status || 'pending',
      tl_by_date: this.currentAllowance?.tl_by_date || null,
      di_by: value.diBy,
      di_by_status: this.currentAllowance?.di_by_status || 'pending',
      di_by_date: this.currentAllowance?.di_by_date || null,
      account_by: null,
      account_by_status: null,
      account_by_date: null,
      notified_user: this.currentAllowance?.notified_user || this.currentAllowance?.create_by || null,
      notified_user_status: this.currentAllowance?.notified_user_status || 'pending',
      notified_user_date: this.currentAllowance?.notified_user_date || null,
      status,
      items: this.itemsArray.value.map((item: any, index: number) => {
        return {
          seq: index + 1,
          work_date: this.formatDateForAPI(item.workDate),
          project_detail_id: null,
          project_code: '',
          project_name: this.normalizeOptionalString(item.projectName),
          description: item.description,
          time_from: item.timeFrom,
          time_to: item.timeTo,
          baht: Number(item.baht || 0),
        };
      }),
    };
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
        uploadPath: 'uploads/allowance-after-10pm/',
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

  getAttachmentHref(path: string | null | undefined): string {
    return getAttachmentHref(path);
  }

  formatAttachmentSize(value: unknown): string {
    return formatAttachmentSize(value);
  }

  onCancel(): void {
    this.router.navigate(['/allowance-after-10pm/list']);
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

  private toTimeInputValue(value: string | null | undefined): string | null {
    if (!value) return null;
    const text = String(value);
    return text.length >= 5 ? text.slice(0, 5) : text;
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
}
