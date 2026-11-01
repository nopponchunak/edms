import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { GiftHospitalityOfferingService } from 'app/core/services/gift-hospitality-offering.service';
import { AuthService } from 'app/core/services/auth.service';
import { User, UserRole } from 'app/core/models/user.model';
import { CreateGiftHospitalityOfferingDto } from 'app/core/models/gift-hospitality-offering.model';
import { Observable, of, Subject, takeUntil, switchMap, catchError, finalize } from 'rxjs';
import { map } from 'rxjs/operators';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { HttpClient } from '@angular/common/http';
import { ApiConfig } from 'app/core/config/api.config';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';
import { GIFT_HOSPITALITY_OFFERING_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { remoteSearchTerms } from 'app/shared/remote-search/remote-search.util';

@Component({
  selector: 'app-gift-hospitality-offering-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatRadioModule,
    MatSelectModule,
    MatDatepickerModule,
    MatCardModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './gift-hospitality-offering-form.component.html',
  styleUrls: ['./gift-hospitality-offering-form.component.scss']
})
export class GiftHospitalityOfferingFormComponent implements OnInit, OnDestroy {
  private static readonly PREPARED_BY_EE_MIN = 5000;
  private static readonly PREPARED_BY_AD_MIN = 10000;
  private static readonly PREPARED_BY_DI_MIN = 20000;
  private static readonly SECOND_APPROVER_MIN = 30000;

  offeringForm: FormGroup;
  loading = false;
  isEdit = false;
  offeringId: string | null = null;
  users: EmployeeOption[] = [];
  currentUser: User | null = null;
  currentUserRawData: Record<string, any> | null = null;

  // Cache for all loaded employees to support autocomplete persistence
  allLoadedEmployees: Map<string, EmployeeOption> = new Map();

  // Filtered users for each select
  filteredVerifiedUsers: EmployeeOption[] = [];
  filteredAcknowledgedUsers: EmployeeOption[] = [];
  filteredApprovedUsers: EmployeeOption[] = [];
  filteredApprovedUsers2: EmployeeOption[] = [];
  filteredRequesterUsers: EmployeeOption[] = [];
  filteredImsUsers: EmployeeOption[] = [];
  requesterLoading = false;
  verifiedLoading = false;
  imsLoading = false;
  acknowledgedLoading = false;
  approvedLoading = false;
  approved2Loading = false;

  // Search controls
  verifiedSearchCtrl = new FormControl('');
  acknowledgedSearchCtrl = new FormControl('');
  approvedSearchCtrl = new FormControl('');
  approvedSearchCtrl2 = new FormControl('');
  requesterSearchCtrl = new FormControl('');
  imsSearchCtrl = new FormControl('');

  readonly currencyOptions: { value: string; label: string }[] = [
    { value: 'THB', label: 'THB - Thai Baht' },
    { value: 'USD', label: 'USD - US Dollar' },
    { value: 'EUR', label: 'EUR - Euro' },
    { value: 'GBP', label: 'GBP - British Pound' },
    { value: 'JPY', label: 'JPY - Japanese Yen' },
    { value: 'CNY', label: 'CNY - Chinese Yuan' },
    { value: 'SGD', label: 'SGD - Singapore Dollar' },
    { value: 'MYR', label: 'MYR - Malaysian Ringgit' },
    { value: 'AUD', label: 'AUD - Australian Dollar' },
    { value: 'CHF', label: 'CHF - Swiss Franc' },
    { value: 'HKD', label: 'HKD - Hong Kong Dollar' },
    { value: 'KRW', label: 'KRW - Korean Won' },
    { value: 'INR', label: 'INR - Indian Rupee' },
    { value: 'VND', label: 'VND - Vietnamese Dong' },
  ];

  get selectedCurrency(): string {
    return this.offeringForm?.get('currencyCode')?.value || 'THB';
  }

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private offeringService: GiftHospitalityOfferingService,
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
    this.offeringForm = this.createForm();
  }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;
    this.currentUserRawData = this.getCurrentUserRawData();
    this.offeringForm.patchValue({ requestedBy: this.getCurrentUserCode() || '' });
    this.loadUsers();
    this.subscribeToCurrentUser();
    this.setupApprovalRoutingRules();

    // Check if editing
    this.offeringId = this.route.snapshot.paramMap.get('id');
    if (this.offeringId) {
      this.isEdit = true;
      this.loadOffering();
    }
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private createForm(): FormGroup {
    return this.fb.group({
      requestedBy: ['', Validators.required],
      type: ['', Validators.required],
      description: ['', Validators.required],
      purpose: ['', Validators.required],
      currencyCode: ['THB', Validators.required],
      // value = รวม VAT แล้ว
      value: [null, [Validators.required, Validators.min(1000)]],
      receiverNameAndCompany: ['', Validators.required],
      proposedDate: [new Date(), Validators.required],
      verifiedBy: ['', Validators.required],
      acknowledgedBy: ['', Validators.required],
      imsAcknowledgedBy: ['', Validators.required],
      approvedBy: ['', Validators.required],
      useSecondApprover: [false],
      approvedBy2: [''],
      attachments: this.fb.array([])
    }, {
      validators: [
        this.approvalPolicy()
      ]
    });
  }

  private subscribeToCurrentUser(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe(user => {
        this.currentUser = user || null;
        this.currentUserRawData = this.getCurrentUserRawData();
        this.refreshApproverOptions();
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
    this.employeeService.getEmployeeOptionsFromApi('', 20, { workflow_role: 'ee_above' }).subscribe({
      next: (employees) => {
        this.users = employees;
        // Populate cache
        employees.forEach(u => {
          if (u.id) this.allLoadedEmployees.set(String(u.id), u);
          if (u.code) this.allLoadedEmployees.set(u.code, u);
        });

        // Initialize filtered arrays - แสดงทั้งหมดไม่ filter
        this.filteredVerifiedUsers = [];
        this.filteredAcknowledgedUsers = [];
        this.filteredApprovedUsers = [];
        this.filteredApprovedUsers2 = [];
        this.filteredRequesterUsers = this.users.slice(0, 20);

        // Setup search filters
        this.setupSearchFilters();
        this.refreshApproverOptions();
      },
      error: (error) => {
        console.error('Error loading users:', error);
        this.users = [];
        this.filteredVerifiedUsers = [];
        this.filteredAcknowledgedUsers = [];
        this.filteredApprovedUsers = [];
        this.filteredApprovedUsers2 = [];
      }
    });
  }

  private preserveSelectedEmployeeOption(
    options: EmployeeOption[],
    controlName: string
  ): Observable<EmployeeOption[]> {
    const selectedRef = this.offeringForm.get(controlName)?.value;
    if (!selectedRef) {
      return of(options);
    }

    const selected = options.find((user) => user.id === selectedRef || user.code === selectedRef)
      || this.allLoadedEmployees.get(String(selectedRef));
    if (selected) {
      return of([selected, ...options.filter((user) => user.code !== selected.code)]);
    }

    return this.employeeService.getEmployeeOptionsFromApi(String(selectedRef), 20).pipe(
      map((matches) => {
        matches.forEach((user) => {
          if (user.id) this.allLoadedEmployees.set(String(user.id), user);
          if (user.code) this.allLoadedEmployees.set(user.code, user);
        });
        const match = matches.find((user) => user.id === selectedRef || user.code === selectedRef);
        return match ? [match, ...options.filter((user) => user.code !== match.code)] : options;
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
          return this.employeeService.getEmployeeOptionsFromApi(term, 20, { workflow_role: 'ee_above' }).pipe(
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
          this.offeringForm.get('requestedBy')?.value,
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
        if (!this.isEdit && !String(this.imsSearchCtrl.value || '').trim() && !this.offeringForm.get('imsAcknowledgedBy')?.value && employees.length === 1) {
          this.offeringForm.get('imsAcknowledgedBy')?.setValue(employees[0].code);
        }
        this.updateFilteredUsers(
          employees,
          this.offeringForm.get('imsAcknowledgedBy')?.value,
          (value) => this.filteredImsUsers = value
        );
      });

    // Verify options must come from ACSC even if the committee is empty or unavailable.
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
      )
      .subscribe((employees) => {
        // Update cache
        employees.forEach(u => {
          if (u.id) this.allLoadedEmployees.set(String(u.id), u);
          if (u.code) this.allLoadedEmployees.set(u.code, u);
        });

        if (!this.isEdit && !String(this.verifiedSearchCtrl.value || '').trim() && !this.offeringForm.get('verifiedBy')?.value && employees.length === 1) {
          this.offeringForm.get('verifiedBy')?.setValue(employees[0].code);
        }

        this.updateFilteredUsers(
          employees,
          this.offeringForm.get('verifiedBy')?.value,
          (val) => this.filteredVerifiedUsers = val
        );
      });

    // Accounts acknowledgement is assigned to the employee with exact initial JN.
    remoteSearchTerms(this.acknowledgedSearchCtrl, this._unsubscribeAll)
      .pipe(
        switchMap((term) => {
          this.acknowledgedLoading = true;
          return this.employeeService.getEmployeeOptionsFromApi(term, 20, { initial_exact: 'JN' }).pipe(
            switchMap((employees) => this.preserveSelectedEmployeeOption(employees, 'acknowledgedBy')),
            catchError(() => of([] as EmployeeOption[])),
            finalize(() => this.acknowledgedLoading = false)
          );
        })
      )
      .subscribe((employees) => {
        employees.forEach(u => {
          if (u.id) this.allLoadedEmployees.set(String(u.id), u);
          if (u.code) this.allLoadedEmployees.set(u.code, u);
        });

        if (!this.isEdit && !this.offeringForm.get('acknowledgedBy')?.value) {
          const accountsAcknowledger = employees.find((user) => user.initial.trim().toUpperCase() === 'JN');
          if (accountsAcknowledger) {
            this.offeringForm.get('acknowledgedBy')?.setValue(accountsAcknowledger.id);
          }
        }

        this.updateFilteredUsers(
          employees,
          this.offeringForm.get('acknowledgedBy')?.value,
          (val) => this.filteredAcknowledgedUsers = val
        );
      });

    remoteSearchTerms(this.approvedSearchCtrl, this._unsubscribeAll)
      .pipe(
        switchMap((term) => {
          this.approvedLoading = true;
          return this.employeeService.getEmployeeOptionsFromApi(term, 20, { workflow_role: 'di_md' }).pipe(
            switchMap((employees) => this.preserveSelectedEmployeeOption(employees, 'approvedBy')),
            catchError(() => of([] as EmployeeOption[])),
            finalize(() => this.approvedLoading = false)
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
          this.offeringForm.get('approvedBy')?.value,
          (val) => this.filteredApprovedUsers = val
        );
      });

    remoteSearchTerms(this.approvedSearchCtrl2, this._unsubscribeAll)
      .pipe(
        switchMap((term) => {
          this.approved2Loading = true;
          return this.employeeService.getEmployeeOptionsFromApi(term, 20, { workflow_role: 'di' }).pipe(
            switchMap((employees) => this.preserveSelectedEmployeeOption(employees, 'approvedBy2')),
            catchError(() => of([] as EmployeeOption[])),
            finalize(() => this.approved2Loading = false)
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
          this.offeringForm.get('approvedBy2')?.value,
          (val) => this.filteredApprovedUsers2 = val
        );
      });
  }

  private loadOffering(): void {
    if (!this.offeringId) return;

    this.loading = true;
    this.offeringService.findOne(this.offeringId)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (offering) => {
          this.offeringForm.patchValue({
            requestedBy: offering.createBy || this.getCurrentUserCode() || '',
            type: offering.type,
            description: offering.description,
            purpose: offering.purpose,
            currencyCode: offering.currencyCode || 'THB',
            value: offering.value,
            receiverNameAndCompany: offering.receiverNameAndCompany,
            proposedDate: offering.proposedDate,
            verifiedBy: offering.verifiedBy,
            acknowledgedBy: offering.acknowledgedBy,
            imsAcknowledgedBy: offering.imsAcknowledgedBy,
            approvedBy: offering.approvedBy,
            useSecondApprover: !this.isThbCurrencyCode(offering.currencyCode) && !!offering.approvedBy2,
            approvedBy2: offering.approvedBy2 || null
          });
          this.setAttachments(offering.attachments || []);
          this.preserveSelectedEmployeeOption(this.filteredRequesterUsers, 'requestedBy')
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((options) => this.filteredRequesterUsers = options);
          this.preserveSelectedEmployeeOption(this.filteredVerifiedUsers, 'verifiedBy')
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((options) => this.filteredVerifiedUsers = options);
          this.preserveSelectedEmployeeOption(this.filteredImsUsers, 'imsAcknowledgedBy')
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((options) => this.filteredImsUsers = options);
          this.preserveSelectedEmployeeOption(this.filteredApprovedUsers, 'approvedBy')
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((options) => this.filteredApprovedUsers = options);
          this.preserveSelectedEmployeeOption(this.filteredApprovedUsers2, 'approvedBy2')
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((options) => this.filteredApprovedUsers2 = options);
          this.preserveSelectedEmployeeOption(this.filteredAcknowledgedUsers, 'acknowledgedBy')
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((options) => this.filteredAcknowledgedUsers = options);
          this.refreshApproverOptions();
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading offering:', error);
          this.toastr.error('Error loading offering details');
          this.loading = false;
        }
      });
  }

  private setupApprovalRoutingRules(): void {
    this.syncValueMinimumValidator();

    this.offeringForm.get('value')?.valueChanges
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe(() => {
        this.refreshApproverOptions();
        this.offeringForm.updateValueAndValidity({ emitEvent: false });
      });

    this.offeringForm.get('currencyCode')?.valueChanges
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe(() => {
        this.syncValueMinimumValidator();
        this.offeringForm.get('approvedBy2')?.setValue('', { emitEvent: false });
        if (this.isThbCurrency()) {
          this.offeringForm.get('useSecondApprover')?.setValue(false, { emitEvent: false });
        }
        this.refreshApproverOptions();
        this.offeringForm.updateValueAndValidity({ emitEvent: false });
      });

    this.offeringForm.get('useSecondApprover')?.valueChanges
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe((enabled) => {
        if (!enabled) {
          this.offeringForm.get('approvedBy2')?.setValue('', { emitEvent: false });
        }
        this.refreshApproverOptions();
        this.offeringForm.updateValueAndValidity({ emitEvent: false });
      });

    this.offeringForm.get('approvedBy')?.valueChanges
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe(() => {
        this.refreshApproverOptions();
        this.offeringForm.updateValueAndValidity({ emitEvent: false });
      });
  }

  private refreshApproverOptions(): void {
    const approvedBy2Control = this.offeringForm.get('approvedBy2');
    if (this.shouldShowSecondApprover()) {
      approvedBy2Control?.setValidators([Validators.required]);
    } else {
      approvedBy2Control?.setValue('', { emitEvent: false });
      approvedBy2Control?.clearValidators();
    }
    approvedBy2Control?.updateValueAndValidity({ emitEvent: false });
  }

  private syncValueMinimumValidator(): void {
    const valueControl = this.offeringForm.get('value');
    if (!valueControl) {
      return;
    }

    valueControl.setValidators([
      Validators.required,
      Validators.min(this.isThbCurrency() ? 1000 : 0.01)
    ]);
    valueControl.updateValueAndValidity({ emitEvent: false });
  }

  private approvalPolicy() {
    return (group: AbstractControl): ValidationErrors | null => {
      const value = Number(group.get('value')?.value || 0);
      const isThb = this.isThbCurrencyCode(group.get('currencyCode')?.value);
      const useSecondApprover = group.get('useSecondApprover')?.value === true;
      const approvedBy = group.get('approvedBy')?.value as string | null;
      const approvedBy2 = group.get('approvedBy2')?.value as string | null;
      const selfCode = group.get('requestedBy')?.value || this.getCurrentUserCode();
      const errors: ValidationErrors = {};

      if (!approvedBy) {
        return Object.keys(errors).length > 0 ? errors : null;
      }

      const approver = this.findLoadedEmployee(approvedBy);
      const approverRole = this.getEmployeeApprovalRole(approver);

      if (selfCode && approvedBy === selfCode) {
        errors['approverIsSelf'] = true;
      }

      if (!(approverRole === 'DI' || approverRole === 'MD')) {
        errors['approverMustBeDiOrMd'] = true;
      }

      if (isThb && value > GiftHospitalityOfferingFormComponent.SECOND_APPROVER_MIN) {
        if (approverRole !== 'MD') {
          errors['firstApproverMustBeMdOver30k'] = true;
        }

        if (!approvedBy2) {
          errors['secondApproverRequiredOver30k'] = true;
        } else {
          const approver2 = this.findLoadedEmployee(approvedBy2);
          const approver2Role = this.getEmployeeApprovalRole(approver2);

          if (selfCode && approvedBy2 === selfCode) {
            errors['secondApproverIsSelf'] = true;
          }
          if (approver2Role !== 'DI') {
            errors['secondApproverMustBeDi'] = true;
          }
          if (approvedBy2 === approvedBy) {
            errors['duplicateApprover'] = true;
          }
        }
      } else if (!isThb && useSecondApprover) {
        if (!approvedBy2) {
          errors['secondApproverRequiredManual'] = true;
        } else {
          const approver2 = this.findLoadedEmployee(approvedBy2);
          const approver2Role = this.getEmployeeApprovalRole(approver2);

          if (selfCode && approvedBy2 === selfCode) {
            errors['secondApproverIsSelf'] = true;
          }
          if (approver2Role !== 'DI') {
            errors['secondApproverMustBeDi'] = true;
          }
          if (approvedBy2 === approvedBy) {
            errors['duplicateApprover'] = true;
          }
        }
      } else if (approvedBy2) {
        errors['secondApproverNotAllowed'] = true;
      }

      return Object.keys(errors).length > 0 ? errors : null;
    };
  }

  shouldShowSecondApprover(): boolean {
    if (!this.isThbCurrency()) {
      return this.offeringForm.get('useSecondApprover')?.value === true;
    }

    const value = Number(this.offeringForm.get('value')?.value || 0);
    return value > GiftHospitalityOfferingFormComponent.SECOND_APPROVER_MIN;
  }

  shouldShowManualSecondApproverToggle(): boolean {
    return !this.isThbCurrency();
  }

  isThbCurrency(): boolean {
    return this.isThbCurrencyCode(this.selectedCurrency);
  }

  getValueMin(): number {
    return this.isThbCurrency() ? 1000 : 0.01;
  }

  getValuePlaceholder(): string {
    return this.isThbCurrency()
      ? 'Minimum 1,000.00'
      : `Amount in ${this.selectedCurrency}`;
  }

  private isThbCurrencyCode(value: unknown): boolean {
    return String(value || 'THB').trim().toUpperCase() === 'THB';
  }

  private getEmployeeApprovalRole(user?: EmployeeOption | null): 'EE' | 'DI' | 'MD' | null {
    const source = `${user?.role || ''} ${user?.levelName || ''}`.toUpperCase();
    if (source.includes('MD') || source.includes('MANAGING DIRECTOR')) {
      return 'MD';
    }
    if (source.includes('DI') || source.includes('DIRECTOR')) {
      return 'DI';
    }
    if (source.includes('AD') || source.includes('ASSOCIATE DIRECTOR')) {
      return 'EE'; // AD is treated as EE or above for approver role purposes here, but has its own rank check for applicant
    }
    if (source.includes('EE') || source.includes('EXECUTIVE ENGINEER')) {
      return 'EE';
    }
    return null;
  }

  private findLoadedEmployee(reference: string): EmployeeOption | undefined {
    return this.allLoadedEmployees.get(String(reference))
      || this.users.find((user) => user.code === reference || user.id === reference);
  }

  private isCurrentUser(user: EmployeeOption): boolean {
    const selfCode = this.getCurrentUserCode();
    const rawId = this.currentUserRawData?.id ?? this.currentUser?.id ?? null;
    return (!!selfCode && user.code === selfCode) || (!!rawId && String(user.employeeId ?? user.id) === String(rawId));
  }

  private getCurrentUserCode(): string | null {
    const raw = this.currentUserRawData?.code ??
      this.currentUserRawData?.employeeCode ??
      this.currentUserRawData?.employee_code ??
      this.currentUserRawData?.username ??
      this.currentUserRawData?.userName ??
      null;

    if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
      return String(raw).trim();
    }

    return null;
  }

  private getSelectedRequesterRank(): number | null {
    const code = String(this.offeringForm.get('requestedBy')?.value || '');
    const employee = this.findLoadedEmployee(code);
    if (!employee) return null;

    const level = String(employee.levelName || '').trim().toUpperCase();
    const prefix = level.match(/^(EE|AD|DI|MD)(?:$|[^A-Z])/);
    return prefix ? ({ EE: 1, AD: 2, DI: 3, MD: 4 }[prefix[1]] || 0) : 0;
  }

  private getCurrentUserRawData(): Record<string, any> | null {
    try {
      const raw = localStorage.getItem('user_raw_data');
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('Failed to parse current user raw data:', error);
      return null;
    }
  }

  //  Submit

  onSubmit(): void {
    if (this.loading) return;

    if (this.getSelectedRequesterRank() === 0) {
      this.offeringForm.get('requestedBy')?.markAsTouched();
      this.toastr.error('Requester must be an active employee at EE level or above.');
      return;
    }

    if (this.hasBlockingFieldErrors()) {
      this.markFormGroupTouched();
      const routingError = this.getApprovalRoutingError();
      this.toastr.error(routingError || 'Please fill in all required fields.');
      return;
    }

    const confirmation = this.fuseConfirmationService.open({
      title: this.isEdit ? 'Confirm update' : 'Confirm submit',
      message: this.isEdit
        ? 'Are you sure you want to update this offering?'
        : 'Are you sure you want to submit this offering?',
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
    const formData = this.offeringForm.value;
    const selectedRequester = this.allLoadedEmployees.get(String(formData.requestedBy || ''));
    const includeSecondApprover = this.shouldShowSecondApprover();
    const attachmentsPaths = this.attachmentsArray.value
      .map((attachment: any) => attachment?.file_path || '')
      .filter((path: string) => typeof path === 'string' && path.trim() !== '');

    // formData.verifiedBy, formData.acknowledgedBy, formData.approvedBy already contain code (string)
    // because dropdown uses [value]="user.id" where user.id is the code

    if (this.isEdit && this.offeringId) {
      // Transform camelCase to snake_case for API
      const apiPayload = {
        requested_by: formData.requestedBy,
        request_type: formData.type?.toLowerCase() || 'gift',
        description: formData.description,
        purpose: formData.purpose,
        currency_code: formData.currencyCode || 'THB',
        value: formData.value,
        receiver_name_and_company: formData.receiverNameAndCompany,
        proposed_date: this.formatDate(formData.proposedDate),
        verified_by: (formData.verifiedBy && formData.verifiedBy.trim() !== '') ? formData.verifiedBy : null,
        verified_by_status: 'pending',
        acknowledged_by: (formData.acknowledgedBy && formData.acknowledgedBy.trim() !== '') ? formData.acknowledgedBy : null,
        acknowledged_by_status: 'pending',
        ims_acknowledged_by: formData.imsAcknowledgedBy || null,
        ims_acknowledged_by_status: 'pending',
        approved_by: (formData.approvedBy && formData.approvedBy.trim() !== '') ? formData.approvedBy : null,
        approved_by_status: 'pending',
        approved_by_2: includeSecondApprover && formData.approvedBy2 ? formData.approvedBy2 : null,
        approved_by_2_status: includeSecondApprover && formData.approvedBy2 ? 'pending' : null,
        attachments: attachmentsPaths
      };

      this.offeringService.update(this.offeringId, apiPayload as any)
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe({
          next: () => {
            this.toastr.success('Offering updated successfully');
            this.router.navigate(['/gift-hospitality-offering']);
          },
          error: (error) => {
            console.error('Error updating offering:', error);
            this.toastr.error('Error updating offering');
            this.loading = false;
          }
        });
    } else {
      // Transform camelCase to snake_case for API
      const apiPayload = {
        requested_by: formData.requestedBy,
        request_type: formData.type?.toLowerCase() || 'gift',
        description: formData.description,
        purpose: formData.purpose,
        currency_code: formData.currencyCode || 'THB',
        value: formData.value,
        receiver_name_and_company: formData.receiverNameAndCompany,
        proposed_date: this.formatDate(formData.proposedDate),
        requestedById: formData.requestedBy || '',
        requestedByFirstName: selectedRequester?.firstName || '',
        requestedByLastName: selectedRequester?.lastName || '',
        requestedByEmail: selectedRequester?.email || '',
        verified_by: (formData.verifiedBy && formData.verifiedBy.trim() !== '') ? formData.verifiedBy : null,
        verified_by_status: 'pending',
        acknowledged_by: (formData.acknowledgedBy && formData.acknowledgedBy.trim() !== '') ? formData.acknowledgedBy : null,
        acknowledged_by_status: 'pending',
        ims_acknowledged_by: formData.imsAcknowledgedBy || null,
        ims_acknowledged_by_status: 'pending',
        approved_by: (formData.approvedBy && formData.approvedBy.trim() !== '') ? formData.approvedBy : null,
        approved_by_status: 'pending',
        approved_by_2: includeSecondApprover && formData.approvedBy2 ? formData.approvedBy2 : null,
        approved_by_2_status: null,
        attachments: attachmentsPaths
      };

      this.offeringService.create(apiPayload as any)
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe({
          next: (response) => {
            this.toastr.success('Offering created successfully');
            this.sendInitialEmailNotification(apiPayload, response);
            this.router.navigate(['/gift-hospitality-offering']);
          },
          error: (error) => {
            console.error('Error creating offering:', error);
            this.toastr.error('Error creating offering');
            this.loading = false;
          }
        });
    }
  }

  private sendInitialEmailNotification(apiPayload: any, response: any): void {
    const offeringId = this.workflowEmailNotificationService.readResponseId(response);
    const responseSource = this.workflowEmailNotificationService.createNotificationSource(apiPayload, response);
    const requesterRef = this.readNonEmptyString(responseSource?.create_by ?? responseSource?.createBy) ?? this.getCurrentUserCode();
    const notificationSource = {
      ...responseSource,
      createBy: requesterRef,
      create_by: requesterRef,
      requester_name: requesterRef
        ? (this.allLoadedEmployees.get(String(requesterRef))?.name || this.getCurrentUserDisplayName())
        : this.getCurrentUserDisplayName(),
      id: offeringId
    };

    this.workflowEmailNotificationService
      .notifyInitialAction(GIFT_HOSPITALITY_OFFERING_EMAIL_CONFIG, notificationSource, offeringId)
      .subscribe({
        error: (error) => {
          console.error('Failed to send gift hospitality offering email notification:', error);
          this.toastr.warning('Offering was saved, but email notification could not be sent.');
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

  private readNonEmptyString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const text = String(value).trim();
    return text || null;
  }

  private getCurrentUserDisplayName(): string | null {
    const rawName = [
      this.currentUserRawData?.firstname,
      this.currentUserRawData?.lastname
    ].filter(Boolean).join(' ').trim();

    const userName = [
      this.currentUser?.firstName,
      this.currentUser?.lastName
    ].filter(Boolean).join(' ').trim();

    return rawName
      || this.readNonEmptyString(this.currentUserRawData?.name)
      || userName
      || this.readNonEmptyString(this.currentUser?.email)
      || null;
  }

  private markFormGroupTouched(): void {
    Object.keys(this.offeringForm.controls).forEach(key => {
      const control = this.offeringForm.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(controlName: string): string {
    const control = this.offeringForm.get(controlName);
  if (control?.hasError('required')) return 'This field is required';

  if (control?.hasError('min')) {
        if (controlName === 'value') {
      return this.isThbCurrency()
        ? 'Minimum value is 1,000 THB'
        : `Value must be greater than 0 ${this.selectedCurrency}`;
    }
    return 'Value must be greater than 0';
  }
    return '';
  }

  isFieldInvalid(controlName: string): boolean {
    const control = this.offeringForm.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  hasBlockingFieldErrors(): boolean {
    return this.offeringForm.invalid;
  }

  getApprovalRoutingError(): string {
    const errors = this.offeringForm.errors;
    if (!errors) {
      return '';
    }

    if (errors['approverIsSelf']) return 'The first approver cannot be the same person as the requester.';
    if (errors['secondApproverIsSelf']) return 'The second approver cannot be the same person as the requester.';
    if (errors['approverMustBeDiOrMd']) return 'The first approver must be DI or MD.';
    if (errors['firstApproverMustBeMdOver30k']) return 'Amounts above 30,000 THB require the first approver to be MD.';
    if (errors['secondApproverRequiredOver30k']) return 'Amounts above 30,000 THB require a second approver.';
    if (errors['secondApproverRequiredManual']) return 'Approver 2 is required when Require Approver 2 is selected.';
    if (errors['secondApproverMustBeDi']) return this.isThbCurrency()
      ? 'For amounts above 30,000 THB, the second approver must be DI.'
      : 'Approver 2 must be DI.';
    if (errors['duplicateApprover']) return 'The second approver must be different from the first approver.';
    if (errors['secondApproverNotAllowed']) return this.isThbCurrency()
      ? 'A second approver is only allowed when the amount is above 30,000 THB.'
      : 'Approver 2 is only available when Require Approver 2 is selected.';

    return '';
  }

  getApprovalRoutingWarning(): string {
    const requesterRank = this.getSelectedRequesterRank();
    if (requesterRank === 0) {
      return 'Requester must be an employee at EE level or above.';
    }
    if (!this.isThbCurrency()) {
      return '';
    }

    const value = Number(this.offeringForm.get('value')?.value || 0);

    if (requesterRank !== null && value > GiftHospitalityOfferingFormComponent.SECOND_APPROVER_MIN && requesterRank < 4) {
      return 'Amounts above 30,000 THB require the requester to be MD.';
    }

    if (requesterRank !== null && value > GiftHospitalityOfferingFormComponent.PREPARED_BY_DI_MIN && requesterRank < 3) {
      return 'Amounts above 20,000 THB require the requester to be DI or MD.';
    }

    if (requesterRank !== null && value > GiftHospitalityOfferingFormComponent.PREPARED_BY_AD_MIN && requesterRank < 2) {
      return 'Amounts above 10,000 THB require the requester to be AD level or above.';
    }

    if (requesterRank !== null && value > GiftHospitalityOfferingFormComponent.PREPARED_BY_EE_MIN && requesterRank < 1) {
      return 'Amounts above 5,000 THB require the requester to be EE level or above.';
    }

    return '';
  }

  get attachmentsArray(): FormArray {
    return this.offeringForm.get('attachments') as FormArray;
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
