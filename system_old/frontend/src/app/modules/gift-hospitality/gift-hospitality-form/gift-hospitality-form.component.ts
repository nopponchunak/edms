import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subject, takeUntil, debounceTime, distinctUntilChanged, switchMap, of, catchError, finalize } from 'rxjs';
import { GiftHospitalityService } from 'app/core/services/gift-hospitality.service';
import { AuthService } from 'app/core/services/auth.service';
import { User, UserRole } from 'app/core/models/user.model';
import { GiftHospitality, CreateGiftHospitalityDto } from 'app/core/models/gift-hospitality.model';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { HttpClient } from '@angular/common/http';
import { ApiConfig } from 'app/core/config/api.config';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { GIFT_HOSPITALITY_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { remoteSearchTerms } from 'app/shared/remote-search/remote-search.util';

@Component({
  selector: 'app-gift-hospitality-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
    NgxMatSelectSearchModule,
  ],
  templateUrl: './gift-hospitality-form.component.html',
  styleUrls: ['./gift-hospitality-form.component.scss'],
})
export class GiftHospitalityFormComponent implements OnInit, OnDestroy {
  giftHospitalityForm: FormGroup;
  loading = false;
  isEdit = false;
  giftHospitalityId: string | null = null;
  users: EmployeeOption[] = [];
  requestByDisplay = '';
  
  // Cache for all loaded employees to support autocomplete persistence
  allLoadedEmployees: Map<string, EmployeeOption> = new Map();

  // Filtered users for each select
  filteredMtlReceivingStaffUsers: EmployeeOption[] = [];
  filteredVerifiedUsers: EmployeeOption[] = [];
  filteredAcknowledgedUsers: EmployeeOption[] = [];
  filteredApprovedUsers: EmployeeOption[] = [];
  filteredRequesterUsers: EmployeeOption[] = [];
  filteredImsUsers: EmployeeOption[] = [];
  requesterLoading = false;
  imsLoading = false;
  verifiedLoading = false;
  acknowledgedLoading = false;
  approvedLoading = false;

  // Search controls
  mtlReceivingStaffSearchCtrl = new FormControl('');
  verifiedSearchCtrl = new FormControl('');
  acknowledgedSearchCtrl = new FormControl('');
  approvedSearchCtrl = new FormControl('');
  requesterSearchCtrl = new FormControl('');
  imsSearchCtrl = new FormControl('');

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private giftHospitalityService: GiftHospitalityService,
    private authService: AuthService,
    private route: ActivatedRoute,
    public router: Router,
    private dialog: MatDialog,
    private http: HttpClient,
    private apiConfig: ApiConfig,
    private employeeService: EmployeeService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private fuseConfirmationService: FuseConfirmationService,
    private toastr: ToastrService
  ) {
    this.giftHospitalityForm = this.createForm();
  }

  ngOnInit(): void {
    this.requestByDisplay = this.getCurrentUserDisplayName();
    this.giftHospitalityForm.patchValue({ requestedBy: getCurrentUserCode() || '' });

    this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe(params => {
      if (params['id']) {
        this.isEdit = true;
        this.giftHospitalityId = params['id'];
        this.loadGiftHospitality();
      }
    });

    this.loadUsers();
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private createForm(): FormGroup {
    return this.fb.group({
      requestedBy: ['', Validators.required],
      requestType: ['', Validators.required],
      description: ['', Validators.required],
      purpose: ['', Validators.required],
      value: ['', [Validators.required, Validators.min(1000)]],
      companyOfGiver: ['', Validators.required],
      proposedDate: [new Date(), Validators.required],
      mtlReceivingStaffBy: [null],
      verifiedBy: ['', Validators.required],
      acknowledgedBy: ['', Validators.required],
      imsAcknowledgedBy: ['', Validators.required],
      approvedBy: ['', Validators.required],
      attachments: this.fb.array([])
    });
  }

  /**
   * Helper to update filtered users while preserving current selection
   */
  private updateFilteredUsers(
    newResults: EmployeeOption[],
    selectedId: string | number | null | undefined,
    filteredArraySetter: (val: EmployeeOption[]) => void
  ): void {
    if (!selectedId) {
      filteredArraySetter(newResults);
      return;
    }

    const exists = newResults.some(u => u.id === selectedId || u.code === selectedId);
    if (exists) {
      filteredArraySetter(newResults);
    } else {
      const cached = this.allLoadedEmployees.get(String(selectedId));
      if (cached) {
        filteredArraySetter([cached, ...newResults]);
      } else {
        filteredArraySetter(newResults);
      }
    }
  }



  private loadUsers(): void {
    this.employeeService.getEmployeeOptions().subscribe({
      next: (employees) => {
        this.users = employees;

        // Populate cache
        employees.forEach(u => {
          if (u.id) this.allLoadedEmployees.set(String(u.id), u);
          if (u.code) this.allLoadedEmployees.set(u.code, u);
        });

        // Workflow dropdowns are populated by their scoped API searches below.
        this.filteredMtlReceivingStaffUsers = this.users;
        this.filteredVerifiedUsers = [];
        this.filteredAcknowledgedUsers = [];
        this.filteredApprovedUsers = [];
        this.filteredRequesterUsers = this.users.slice(0, 20);

        // Setup search filters
        this.setupSearchFilters();
      },
      error: (error) => {
        console.error('Error loading users:', error);
        this.users = [];
        this.filteredMtlReceivingStaffUsers = [];
        this.filteredVerifiedUsers = [];
        this.filteredAcknowledgedUsers = [];
        this.filteredApprovedUsers = [];
      }
    });
  }

  private preserveSelectedEmployeeOption(
    options: EmployeeOption[],
    controlName: string
  ): Observable<EmployeeOption[]> {
    const selectedRef = this.giftHospitalityForm.get(controlName)?.value;
    if (!selectedRef) {
      return of(options);
    }

    const selected = options.find((user) => user.id === selectedRef || user.code === selectedRef)
      || this.allLoadedEmployees.get(String(selectedRef));
    if (selected) {
      return of([selected, ...options.filter((user) => user.code !== selected.code)]);
    }

    return this.employeeService.getEmployeeOptionsFromApi(String(selectedRef), 20).pipe(
      switchMap((matches) => {
        matches.forEach((user) => {
          if (user.id) this.allLoadedEmployees.set(String(user.id), user);
          if (user.code) this.allLoadedEmployees.set(user.code, user);
        });
        const match = matches.find((user) => user.id === selectedRef || user.code === selectedRef);
        return of(match ? [match, ...options.filter((user) => user.code !== match.code)] : options);
      }),
      catchError(() => of(options))
    );
  }

  /**
   * Setup search filters for each select - ใช้ API search แบบ real-time
   */
  private setupSearchFilters(): void {
    remoteSearchTerms(this.requesterSearchCtrl, this._unsubscribeAll)
      .pipe(
        switchMap((term) => {
          this.requesterLoading = true;
          return this.employeeService.getEmployeeOptionsFromApi(term, 20).pipe(
            catchError(() => of([] as EmployeeOption[])),
            finalize(() => this.requesterLoading = false)
          );
        })
      )
      .subscribe((employees) => {
        employees.forEach(u => {
          if (u.id) this.allLoadedEmployees.set(String(u.id), u);
          if (u.code) this.allLoadedEmployees.set(u.code, u);
        });
        this.updateFilteredUsers(
          employees,
          this.giftHospitalityForm.get('requestedBy')?.value,
          (val) => this.filteredRequesterUsers = val
        );
      });

    remoteSearchTerms(this.imsSearchCtrl, this._unsubscribeAll)
      .pipe(
        switchMap((term) => {
          this.imsLoading = true;
          return this.employeeService.getEmployeeOptionsFromApi(term, 20, { committee_name: 'ACSL' }).pipe(
            switchMap((employees) => this.preserveSelectedEmployeeOption(employees, 'imsAcknowledgedBy')),
            catchError(() => of([] as EmployeeOption[])),
            finalize(() => this.imsLoading = false)
          );
        })
      )
      .subscribe((employees) => {
        employees.forEach((user) => {
          if (user.id) this.allLoadedEmployees.set(String(user.id), user);
          if (user.code) this.allLoadedEmployees.set(user.code, user);
        });
        if (!this.isEdit && !String(this.imsSearchCtrl.value || '').trim() && !this.giftHospitalityForm.get('imsAcknowledgedBy')?.value && employees.length === 1) {
          this.giftHospitalityForm.get('imsAcknowledgedBy')?.setValue(employees[0].code);
        }
        this.updateFilteredUsers(
          employees,
          this.giftHospitalityForm.get('imsAcknowledgedBy')?.value,
          (value) => this.filteredImsUsers = value
        );
      });

    // MTL Receiving Staff search - ใช้ API search
    this.mtlReceivingStaffSearchCtrl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          const searchTerm = term ? term.toString().trim() : '';
          return this.employeeService.getEmployeeOptionsFromApi(searchTerm, 20);
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe((employees) => {
        // Update cache
        employees.forEach(u => {
          if (u.id) this.allLoadedEmployees.set(String(u.id), u);
          if (u.code) this.allLoadedEmployees.set(u.code, u);
        });

        this.updateFilteredUsers(
          employees,
          this.giftHospitalityForm.get('mtlReceivingStaffBy')?.value,
          (val) => this.filteredMtlReceivingStaffUsers = val
        );
      });

    // Verified By search - ใช้ API search
    remoteSearchTerms(this.verifiedSearchCtrl, this._unsubscribeAll)
      .pipe(
        switchMap((term) => {
          this.verifiedLoading = true;
          return this.employeeService.getEmployeeOptionsFromApi(term, 20, { committee_name: 'ACSC' }).pipe(
            switchMap((employees) => this.preserveSelectedEmployeeOption(employees, 'verifiedBy')),
            catchError(() => of([] as EmployeeOption[])),
            finalize(() => this.verifiedLoading = false)
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe((employees) => {
        // Update cache
        employees.forEach(u => {
          if (u.id) this.allLoadedEmployees.set(String(u.id), u);
          if (u.code) this.allLoadedEmployees.set(u.code, u);
        });

        if (!this.isEdit && !String(this.verifiedSearchCtrl.value || '').trim() && !this.giftHospitalityForm.get('verifiedBy')?.value && employees.length === 1) {
          this.giftHospitalityForm.get('verifiedBy')?.setValue(employees[0].code);
        }

        this.updateFilteredUsers(
          employees,
          this.giftHospitalityForm.get('verifiedBy')?.value,
          (val) => this.filteredVerifiedUsers = val
        );
      });

    // Acknowledged By search - ใช้ API search
    remoteSearchTerms(this.acknowledgedSearchCtrl, this._unsubscribeAll)
      .pipe(
        switchMap((term) => {
          this.acknowledgedLoading = true;
          return this.employeeService.getEmployeeOptionsFromApi(term, 20, { initial_exact: 'JN' }).pipe(
            switchMap((employees) => this.preserveSelectedEmployeeOption(employees, 'acknowledgedBy')),
            catchError(() => of([] as EmployeeOption[])),
            finalize(() => this.acknowledgedLoading = false)
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe((employees) => {
        // Update cache
        employees.forEach(u => {
          if (u.id) this.allLoadedEmployees.set(String(u.id), u);
          if (u.code) this.allLoadedEmployees.set(u.code, u);
        });

        if (!this.isEdit && !this.giftHospitalityForm.get('acknowledgedBy')?.value) {
          const accountsAcknowledger = employees.find((user) => user.initial.trim().toUpperCase() === 'JN');
          if (accountsAcknowledger) {
            this.giftHospitalityForm.get('acknowledgedBy')?.setValue(accountsAcknowledger.code);
          }
        }

        this.updateFilteredUsers(
          employees,
          this.giftHospitalityForm.get('acknowledgedBy')?.value,
          (val) => this.filteredAcknowledgedUsers = val
        );
      });

    // Approved By search - ใช้ API search และ filter TL, DI, MD
    remoteSearchTerms(this.approvedSearchCtrl, this._unsubscribeAll)
      .pipe(
        switchMap((term) => {
          this.approvedLoading = true;
          return this.employeeService.getEmployeeOptionsFromApi(term, 20, { workflow_role: 'tl_di_md' }).pipe(
            switchMap((employees) => this.preserveSelectedEmployeeOption(employees, 'approvedBy')),
            catchError(() => of([] as EmployeeOption[])),
            finalize(() => this.approvedLoading = false)
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe((employees) => {
        // Update cache
        employees.forEach(u => {
          if (u.id) this.allLoadedEmployees.set(String(u.id), u);
          if (u.code) this.allLoadedEmployees.set(u.code, u);
        });

        this.updateFilteredUsers(
          employees,
          this.giftHospitalityForm.get('approvedBy')?.value,
          (val) => this.filteredApprovedUsers = val
        );
      });
  }

  private loadGiftHospitality(): void {
    if (!this.giftHospitalityId) return;

    this.loading = true;
    this.giftHospitalityService.findOne(this.giftHospitalityId)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (giftHospitality: GiftHospitality) => {
          this.requestByDisplay = this.getRequestByDisplay(giftHospitality);
          this.giftHospitalityForm.patchValue({
            requestedBy: giftHospitality.createBy || getCurrentUserCode() || '',
            requestType: giftHospitality.requestType,
            description: giftHospitality.description,
            purpose: giftHospitality.purpose,
            value: giftHospitality.value,
            companyOfGiver: giftHospitality.companyOfGiver,
            proposedDate: giftHospitality.proposedDate,
            mtlReceivingStaffBy: giftHospitality.mtlReceivingStaffBy || null,
            verifiedBy: giftHospitality.verifiedBy || null,
            acknowledgedBy: giftHospitality.acknowledgedBy || null,
            imsAcknowledgedBy: giftHospitality.imsAcknowledgedBy || null,
            approvedBy: giftHospitality.approvedBy || null,
          });
          this.setAttachments(giftHospitality.attachments || []);
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading gift/hospitality:', error);
          this.toastr.error('Error loading request');
          this.loading = false;
        }
      });
  }

  onSubmit(): void {
    if (this.loading) return;

    if (this.giftHospitalityForm.invalid) {
      this.markFormGroupTouched();
      this.toastr.error('Please fill in all required fields.');
      return;
    }

    const confirmation = this.fuseConfirmationService.open({
      title: this.isEdit ? 'Confirm update' : 'Confirm submit',
      message: this.isEdit
        ? 'Are you sure you want to update this request?'
        : 'Are you sure you want to submit this request?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: this.isEdit ? 'Update' : 'Submit', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      this.submitForm();
    });
  }

  private submitForm(): void {
    this.loading = true;
    const formData = this.giftHospitalityForm.value;
    const attachmentsPaths = this.attachmentsArray.value
      .map((attachment: any) => attachment?.file_path || '')
      .filter((path: string) => typeof path === 'string' && path.trim() !== '');

    if (this.isEdit && this.giftHospitalityId) {
      // Transform camelCase to snake_case for API
      // Note: verified_by, acknowledged_by, approved_by should be code from dropdown
      const apiPayload: CreateGiftHospitalityDto = {
        request_type: formData.requestType,
        description: formData.description,
        purpose: formData.purpose,
        value: formData.value,
        company_of_giver: formData.companyOfGiver,
        proposed_date: this.formatDate(formData.proposedDate),
        requested_by: formData.requestedBy,
        mtl_receiving_staff_by: formData.mtlReceivingStaffBy || null,
        mtl_receiving_staff_by_date: null,
        mtl_receiving_staff_by_status: null,
        verified_by: formData.verifiedBy || null,
        verified_by_date: null,
        verified_by_status: null,
        acknowledged_by: formData.acknowledgedBy || null,
        acknowledged_by_date: null,
        acknowledged_by_status: null,
        ims_acknowledged_by: formData.imsAcknowledgedBy || null,
        ims_acknowledged_by_date: null,
        ims_acknowledged_by_status: null,
        approved_by: formData.approvedBy || null,
        approved_by_date: null,
        approved_by_status: null,
        attachments: attachmentsPaths
      };

      this.giftHospitalityService.update(this.giftHospitalityId, apiPayload as any)
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe({
          next: () => {
            this.toastr.success('Request updated successfully');
            this.router.navigate(['/gift-hospitality']);
          },
          error: (error) => {
            console.error('Error updating gift/hospitality:', error);
            this.toastr.error('Error updating request');
            this.loading = false;
          }
        });
    } else {
      // Transform camelCase to snake_case for API
      // Note: verified_by, acknowledged_by, approved_by should be code from dropdown
      const apiPayload: CreateGiftHospitalityDto = {
        request_type: formData.requestType,
        description: formData.description,
        purpose: formData.purpose,
        value: formData.value,
        company_of_giver: formData.companyOfGiver,
        proposed_date: this.formatDate(formData.proposedDate),
        requested_by: formData.requestedBy,
        mtl_receiving_staff_by: formData.mtlReceivingStaffBy || null,
        mtl_receiving_staff_by_date: null,
        mtl_receiving_staff_by_status: null,
        verified_by: formData.verifiedBy || null,
        verified_by_date: null,
        verified_by_status: 'pending',
        acknowledged_by: formData.acknowledgedBy || null,
        acknowledged_by_date: null,
        acknowledged_by_status: null,
        ims_acknowledged_by: formData.imsAcknowledgedBy || null,
        ims_acknowledged_by_date: null,
        ims_acknowledged_by_status: null,
        approved_by: formData.approvedBy || null,
        approved_by_date: null,
        approved_by_status: null,
        attachments: attachmentsPaths
      };

      this.giftHospitalityService.create(apiPayload)
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe({
          next: (response) => {
            this.toastr.success('Request created successfully');
            this.sendInitialEmailNotification(apiPayload, response);
            this.router.navigate(['/gift-hospitality']);
          },
          error: (error) => {
            console.error('Error creating gift/hospitality:', error);
            this.toastr.error('Error creating request');
            this.loading = false;
          }
        });
    }
  }

  private sendInitialEmailNotification(apiPayload: any, response: any): void {
    const giftHospitalityId = this.workflowEmailNotificationService.readResponseId(response);
    const notificationSource = {
      ...this.workflowEmailNotificationService.createNotificationSource(apiPayload, response),
      create_by: apiPayload.requested_by,
      id: giftHospitalityId
    };

    this.workflowEmailNotificationService
      .notifyInitialAction(GIFT_HOSPITALITY_EMAIL_CONFIG, notificationSource, giftHospitalityId)
      .subscribe({
        error: (error) => {
          console.error('Failed to send gift hospitality email notification:', error);
          this.toastr.warning('Request was saved, but email notification could not be sent.');
        }
      });
  }

  private formatDate(date: Date | string): string {
    if (!date) return '';

    let dateObj: Date;
    if (typeof date === 'string') {
      dateObj = new Date(date);
    } else {
      dateObj = date;
    }

    if (isNaN(dateObj.getTime())) return '';

    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    const hours = dateObj.getHours().toString().padStart(2, '0');
    const minutes = dateObj.getMinutes().toString().padStart(2, '0');
    const seconds = dateObj.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private markFormGroupTouched(): void {
    Object.keys(this.giftHospitalityForm.controls).forEach(key => {
      const control = this.giftHospitalityForm.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(controlName: string): string {
    const control = this.giftHospitalityForm.get(controlName);
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('min')) {

      if (controlName === 'value') {
      return 'Minimum value is 1,000 THB';
    }
      return 'Value must be greater than 0';
    }
    return '';
  }

  private getRequestByDisplay(giftHospitality?: GiftHospitality): string {
    const requestedBy = giftHospitality?.requestedBy;
    const requestedByName = [requestedBy?.firstName, requestedBy?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (requestedByName) {
      return requestedByName;
    }

    return this.getCurrentUserDisplayName();
  }

  private getCurrentUserDisplayName(): string {
    const currentUser = this.authService.currentUserValue;
    const currentUserName = [currentUser?.firstName, currentUser?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (currentUserName) {
      return currentUserName;
    }

    try {
      const raw = localStorage.getItem('user_raw_data');
      if (!raw) {
        return '';
      }

      const userRawData = JSON.parse(raw);
      const rawName = [userRawData?.firstname, userRawData?.lastname]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (rawName) {
        return rawName;
      }

      return String(userRawData?.name || userRawData?.username || '').trim();
    } catch (error) {
      console.error('Failed to parse current user raw data:', error);
      return '';
    }
  }

  get attachmentsArray(): FormArray {
    return this.giftHospitalityForm.get('attachments') as FormArray;
  }

  openUploadDialog(): void {
    const ref = this.dialog.open(FuseUploadDialogComponent, {
      width: '560px',
      data: {}
    });

    ref.afterClosed().subscribe((result) => {
      if (!result) {
        return;
      }

      const results = Array.isArray(result) ? result : [result];
      results.forEach((item: any) => {
        this.attachmentsArray.push(this.createAttachmentGroup({
          id: item.id || null,
          file_name: item.file_name || item.name || '',
          file_path: item.file_path || '',
          file_url: item.file_url || item.url || '',
          file_size: item.file_size || (item.file ? item.file.size : 0),
          mime_type: item.mime_type || (item.file ? item.file.type : ''),
          description: item.description || '',
          uploaded_at: item.uploaded_at || new Date(),
          type: item.type || 'file',
          file: item.file || null
        }));
      });
    });
  }

  removeAttachment(index: number): void {
    this.attachmentsArray.removeAt(index);
  }

  private setAttachments(paths: string[]): void {
    this.attachmentsArray.clear();
    paths.forEach((path) => {
      this.attachmentsArray.push(this.createAttachmentGroup({
        file_name: this.getFileNameFromPath(path),
        file_path: path,
        file_url: '',
        file_size: 0,
        mime_type: '',
        description: '',
        uploaded_at: null,
        type: 'file',
        file: null
      }));
    });
  }

  private createAttachmentGroup(data: any): FormGroup {
    return this.fb.group({
      id: [data.id || null],
      file_name: [data.file_name || ''],
      file_path: [data.file_path || ''],
      file_url: [data.file_url || ''],
      file_size: [data.file_size || 0],
      mime_type: [data.mime_type || ''],
      description: [data.description || ''],
      uploaded_at: [data.uploaded_at || null],
      type: [data.type || 'file'],
      file: [data.file || null]
    });
  }

  private getFileNameFromPath(path: string): string {
    return String(path || '').split('/').pop() || path;
  }

}
