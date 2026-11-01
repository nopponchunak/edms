import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    FormBuilder,
    FormGroup,
    ReactiveFormsModule,
    Validators,
    AbstractControl,
    ValidationErrors,
    FormControl
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CharitableContributionService } from 'app/core/services/charitable-contribution.service';
import { AuthService } from 'app/core/services/auth.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { HttpClient } from '@angular/common/http';
import { ApiConfig } from 'app/core/config/api.config';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { takeUntil, startWith, switchMap, catchError, finalize, map } from 'rxjs/operators';
import { Observable, Subject, of } from 'rxjs';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';
import { CHARITABLE_CONTRIBUTION_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import {
    RequestType,
    CreateCharitableContributionRequest,
    User
} from 'app/core/models/charitable-contribution.model';
import { remoteSearchTerms } from 'app/shared/remote-search/remote-search.util';

type Role = 'ACSC' | 'ACSL' | 'DI' | 'MD';

@Component({
    selector: 'app-charitable-contribution-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatRadioModule,
        MatDatepickerModule,
        MatProgressSpinnerModule,
        MatCardModule,
        MatDividerModule,
        MatIconModule,
        MatCheckboxModule,
        NgxMatSelectSearchModule
    ],
    templateUrl: './charitable-contribution-form.component.html',
    styleUrls: ['./charitable-contribution-form.component.scss']
})
export class CharitableContributionFormComponent implements OnInit, OnDestroy {
    private static readonly APPROVAL_THRESHOLD = 20000;

    form: FormGroup;

    loading = false;
    isEdit = false;
    requestId: string | null = null;

    users: EmployeeOption[] = [];

    // Cache for all loaded employees to support autocomplete persistence
    allLoadedEmployees: Map<string, EmployeeOption> = new Map();


    // Filtered users for search
    filteredAcscUsers: EmployeeOption[] = [];
    filteredAcslUsers: EmployeeOption[] = [];
    filteredApproverUsers: EmployeeOption[] = [];
    filteredApproverUsers2: EmployeeOption[] = [];
    filteredImsUsers: EmployeeOption[] = [];
    filteredRequesterUsers: EmployeeOption[] = [];
    requesterLoading = false;
    imsLoading = false;
    acscLoading = false;
    acslLoading = false;
    approverLoading = false;
    approver2Loading = false;

    // Search controls
    acscSearchCtrl = new FormControl('');
    acslSearchCtrl = new FormControl('');
    approverSearchCtrl = new FormControl('');
    approverSearchCtrl2 = new FormControl('');
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
        return this.form?.get('currencyCode')?.value || 'THB';
    }

    // ผู้ใช้ปัจจุบัน (ดึงจริงจาก AuthService)
    currentUser: User | null = null;
    currentUserRawData: Record<string, any> | null = null;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    requestTypes = [
        { value: RequestType.CHARITABLE_CONTRIBUTION, label: 'Charitable Contribution' },
        { value: RequestType.SPONSORSHIP, label: 'Sponsorship' }
    ];

    constructor(
        private fb: FormBuilder,
        private charitableContributionService: CharitableContributionService,
        private authService: AuthService,
        public router: Router,
        private route: ActivatedRoute,
        private http: HttpClient,
        private apiConfig: ApiConfig,
        private employeeService: EmployeeService,
        private workflowEmailNotificationService: WorkflowEmailNotificationService,
        private fuseConfirmationService: FuseConfirmationService,
        private toastr: ToastrService
    ) { }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    ngOnInit(): void {
        this.initializeForm();

        // ดึงผู้ใช้ปัจจุบันจาก AuthService (รองรับหลายรูปแบบเพื่อให้คอมไพล์แน่)
        this.currentUser =
            (this.authService as any)?.getCurrentUser?.() ??
            (this.authService as any)?.currentUserValue ??
            null;
        this.currentUserRawData = this.getCurrentUserRawData();
        this.form.patchValue({ requestedBy: this.getCurrentUserCode() || '' });

        // Check if editing
        this.requestId = this.route.snapshot.paramMap.get('id');
        if (this.requestId) {
            this.isEdit = true;
        }

        this.loadUsers();
        this.setupApprovalRoutingRules();
    }

    /** สร้างฟอร์ม
     *  - ใช้ valueAmount เป็นยอดรวม VAT แล้ว (ไม่มี vatAmount)
     *  - ใส่ตัวตรวจระดับฟอร์มสำหรับกติกาอนุมัติ
     */
    private initializeForm(): void {
        this.form = this.fb.group(
            {
                requestType: [RequestType.CHARITABLE_CONTRIBUTION, Validators.required],
                requestedBy: ['', Validators.required],
                eventDescription: ['', [Validators.required, Validators.minLength(10)]],
                eventPurpose: ['', [Validators.required, Validators.minLength(10)]],
                organizerName: ['', Validators.required],
                contributionDescription: ['', [Validators.required, Validators.minLength(10)]],

                // ใช้ยอดรวม VAT แล้ว
                currencyCode: ['THB', Validators.required],
                valueAmount: [0, [Validators.required, Validators.min(2500)]], //

                proposedDate: [new Date(), Validators.required],

                vatAmount: [0],

                acscBy: ['', Validators.required],
                acslBy: ['', Validators.required],
                imsAcknowledgedBy: ['', Validators.required],
                approverBy: ['', Validators.required],
                useSecondApprover: [false],
                approverBy2: ['']
            },
            {
                validators: [
                    this.approverRolePolicy(CharitableContributionFormComponent.APPROVAL_THRESHOLD)
                ]
            }
        );
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

    /** โหลดรายชื่อผู้ใช้ */
    private loadUsers(): void {
        this.employeeService.getEmployeeOptionsFromApi('', 20, { workflow_role: 'ee_above' }).subscribe({
            next: (employees) => {
                this.users = employees;
                employees.forEach((user) => {
                    if (user.id) this.allLoadedEmployees.set(String(user.id), user);
                    if (user.code) this.allLoadedEmployees.set(user.code, user);
                });

                this.filteredRequesterUsers = employees;
                this.filteredAcscUsers = [];
                this.filteredImsUsers = [];
                this.filteredApproverUsers = [];
                this.filteredApproverUsers2 = [];
                this.filteredAcslUsers = [];

                this.setupSearchFilters();
                if (this.isEdit && this.requestId) {
                    this.loadRequest();
                }
            },
            error: (error) => {
                console.error('Error loading workflow users:', error);
                this.users = [];
                this.filteredRequesterUsers = [];
                this.filteredAcscUsers = [];
                this.filteredImsUsers = [];
                this.filteredApproverUsers = [];
                this.filteredApproverUsers2 = [];
                this.filteredAcslUsers = [];
            }
        });
    }

    private preserveSelectedEmployeeOption(
        options: EmployeeOption[],
        controlName: string
    ): Observable<EmployeeOption[]> {
        const selectedRef = this.form.get(controlName)?.value;
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

    private setupSearchFilters(): void {
        remoteSearchTerms(this.requesterSearchCtrl, this._unsubscribeAll)
            .pipe(
                switchMap((term) => {
                    this.requesterLoading = true;
                    return this.employeeService.getEmployeeOptionsFromApi(term, 20, { workflow_role: 'ee_above' }).pipe(
                        switchMap((employees) => this.preserveSelectedEmployeeOption(employees, 'requestedBy')),
                        catchError(() => of([] as EmployeeOption[])),
                        finalize(() => this.requesterLoading = false)
                    );
                })
            )
            .subscribe((employees) => {
                employees.forEach((user) => {
                    if (user.id) this.allLoadedEmployees.set(String(user.id), user);
                    if (user.code) this.allLoadedEmployees.set(user.code, user);
                });
                this.updateFilteredUsers(
                    employees,
                    this.form.get('requestedBy')?.value,
                    (value) => this.filteredRequesterUsers = value
                );
            });

        remoteSearchTerms(this.acscSearchCtrl, this._unsubscribeAll)
            .pipe(
                switchMap((term) => {
                    this.acscLoading = true;
                    return this.employeeService.getEmployeeOptionsFromApi(term, 20, { committee_name: 'ACSC' }).pipe(
                        switchMap((employees) => this.preserveSelectedEmployeeOption(employees, 'acscBy')),
                        catchError(() => of([] as EmployeeOption[])),
                        finalize(() => this.acscLoading = false)
                    );
                })
            )
            .subscribe((employees) => {
                employees.forEach((user) => {
                    if (user.id) this.allLoadedEmployees.set(String(user.id), user);
                    if (user.code) this.allLoadedEmployees.set(user.code, user);
                });
                if (!this.isEdit && !String(this.acscSearchCtrl.value || '').trim() && !this.form.get('acscBy')?.value && employees.length === 1) {
                    this.form.get('acscBy')?.setValue(employees[0].code);
                }
                this.updateFilteredUsers(
                    employees,
                    this.form.get('acscBy')?.value,
                    (value) => this.filteredAcscUsers = value
                );
            });

        // Acknowledge 1 is stored in the legacy IMS columns but assigned from ACSL.
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
                if (!this.isEdit && !String(this.imsSearchCtrl.value || '').trim() && !this.form.get('imsAcknowledgedBy')?.value && employees.length === 1) {
                    this.form.get('imsAcknowledgedBy')?.setValue(employees[0].code);
                }
                this.updateFilteredUsers(
                    employees,
                    this.form.get('imsAcknowledgedBy')?.value,
                    (value) => this.filteredImsUsers = value
                );
            });

        remoteSearchTerms(this.approverSearchCtrl, this._unsubscribeAll)
            .pipe(
                switchMap((term) => {
                    this.approverLoading = true;
                    return this.employeeService.getEmployeeOptionsFromApi(term, 20, { workflow_role: 'di_md' }).pipe(
                        switchMap((employees) => this.preserveSelectedEmployeeOption(employees, 'approverBy')),
                        catchError(() => of([] as EmployeeOption[])),
                        finalize(() => this.approverLoading = false)
                    );
                })
            )
            .subscribe((employees) => {
                employees.forEach((user) => {
                    if (user.id) this.allLoadedEmployees.set(String(user.id), user);
                    if (user.code) this.allLoadedEmployees.set(user.code, user);
                });
                this.updateFilteredUsers(
                    employees,
                    this.form.get('approverBy')?.value,
                    (value) => this.filteredApproverUsers = value
                );
            });

        remoteSearchTerms(this.approverSearchCtrl2, this._unsubscribeAll)
            .pipe(
                switchMap((term) => {
                    this.approver2Loading = true;
                    return this.employeeService.getEmployeeOptionsFromApi(term, 20, { workflow_role: 'di' }).pipe(
                        switchMap((employees) => this.preserveSelectedEmployeeOption(employees, 'approverBy2')),
                        catchError(() => of([] as EmployeeOption[])),
                        finalize(() => this.approver2Loading = false)
                    );
                })
            )
            .subscribe((employees) => {
                employees.forEach((user) => {
                    if (user.id) this.allLoadedEmployees.set(String(user.id), user);
                    if (user.code) this.allLoadedEmployees.set(user.code, user);
                });
                this.updateFilteredUsers(
                    employees,
                    this.form.get('approverBy2')?.value,
                    (value) => this.filteredApproverUsers2 = value
                );
            });

        // Acknowledge 2 is the active employee whose initial is exactly JN.
        remoteSearchTerms(this.acslSearchCtrl, this._unsubscribeAll)
            .pipe(
                switchMap((term) => {
                    this.acslLoading = true;
                    return this.employeeService.getEmployeeOptionsFromApi(term, 20, { initial_exact: 'JN' }).pipe(
                        switchMap((employees) => this.preserveSelectedEmployeeOption(employees, 'acslBy')),
                        catchError(() => of([] as EmployeeOption[])),
                        finalize(() => this.acslLoading = false)
                    );
                })
            )
            .subscribe((employees) => {
                employees.forEach((user) => {
                    if (user.id) this.allLoadedEmployees.set(String(user.id), user);
                    if (user.code) this.allLoadedEmployees.set(user.code, user);
                });
                if (!this.isEdit && !this.form.get('acslBy')?.value) {
                    const accountsAcknowledger = employees.find((user) => user.initial.trim().toUpperCase() === 'JN');
                    if (accountsAcknowledger) {
                        this.form.get('acslBy')?.setValue(accountsAcknowledger.code);
                    }
                }
                this.updateFilteredUsers(
                    employees,
                    this.form.get('acslBy')?.value,
                    (value) => this.filteredAcslUsers = value
                );
            });
    }

    private setupApprovalRoutingRules(): void {
        this.syncValueAmountMinimumValidator();

        this.form.get('valueAmount')?.valueChanges
            .pipe(startWith(this.form.get('valueAmount')?.value), takeUntil(this._unsubscribeAll))
            .subscribe(() => {
                this.refreshApproverOptions();
                this.form.updateValueAndValidity({ emitEvent: false });
            });

        this.form.get('currencyCode')?.valueChanges
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => {
                this.syncValueAmountMinimumValidator();
                this.form.get('approverBy2')?.setValue('', { emitEvent: false });
                if (this.isThbCurrency()) {
                    this.form.get('useSecondApprover')?.setValue(false, { emitEvent: false });
                }
                this.refreshApproverOptions();
                this.form.updateValueAndValidity({ emitEvent: false });
            });

        this.form.get('useSecondApprover')?.valueChanges
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((enabled) => {
                if (!enabled) {
                    this.form.get('approverBy2')?.setValue('', { emitEvent: false });
                }
                this.refreshApproverOptions();
                this.form.updateValueAndValidity({ emitEvent: false });
            });

        this.form.get('approverBy')?.valueChanges
            .pipe(startWith(this.form.get('approverBy')?.value), takeUntil(this._unsubscribeAll))
            .subscribe(() => {
                this.refreshApproverOptions();
                this.form.updateValueAndValidity({ emitEvent: false });
            });
    }

    private refreshApproverOptions(): void {

        const approverBy2Ctrl = this.form.get('approverBy2');
        if (!this.shouldDisplaySecondApprover()) {
            approverBy2Ctrl?.setValue('', { emitEvent: false });
            approverBy2Ctrl?.clearValidators();
        } else if (this.isSecondApproverRequired()) {
            approverBy2Ctrl?.setValidators([Validators.required]);
        } else {
            approverBy2Ctrl?.clearValidators();
        }
        approverBy2Ctrl?.updateValueAndValidity({ emitEvent: false });
    }

    private syncValueAmountMinimumValidator(): void {
        const valueAmountControl = this.form.get('valueAmount');
        if (!valueAmountControl) {
            return;
        }

        valueAmountControl.setValidators(
            this.isThbCurrency()
                ? [Validators.required, Validators.min(2500)]
                : [Validators.required]
        );
        valueAmountControl.updateValueAndValidity({ emitEvent: false });
    }

    // -------------------- Validators (Form-level) --------------------

    /**
     * กฎบทบาท:
     * - ใช้เฉพาะ THB เท่านั้น; foreign currency ไม่ใช้ approval routing validation
     * - ทุก action ห้ามเลือกตัวเอง
     * - ยอด < 20,000: ต้องเลือก approver คนเดียว และ role ต้องเป็น DI หรือ MD
     * - ยอด > 20,000:
     *   - ถ้า approver คนแรกเป็น MD ไม่ต้องมี approver คนที่ 2
     *   - ถ้า approver คนแรกเป็น DI ต้องมี approver คนที่ 2 และคนที่ 2 ต้องเป็น DI คนละคน
     * - ยอด > 20,000: ผู้ยื่นต้องเป็น EE ขึ้นไป
     */
    private approverRolePolicy(threshold: number) {
        return (group: AbstractControl): ValidationErrors | null => {
            const approverCode = group.get('approverBy')?.value as string | null;
            const approverCode2 = group.get('approverBy2')?.value as string | null;
            const acscBy = group.get('acscBy')?.value as string | null;
            const acslBy = group.get('acslBy')?.value as string | null;
            const valueAmount = Number(group.get('valueAmount')?.value || 0);
            const isThb = this.isThbCurrencyCode(group.get('currencyCode')?.value);
            if (!isThb) {
                return null;
            }

            const selfCode = group.get('requestedBy')?.value || this.getCurrentUserCode();
            const errors: ValidationErrors = {};

            [approverCode, approverCode2].forEach((code, index) => {
                if (code && selfCode && code === selfCode) {
                    const keys = ['approverSelfNotAllowed', 'approver2SelfNotAllowed'];
                    errors[keys[index]] = true;
                }
            });

            if (!approverCode) {
                return Object.keys(errors).length > 0 ? errors : null;
            }

            const approver = this.findLoadedEmployee(approverCode);
            const approver2 = approverCode2 ? this.findLoadedEmployee(approverCode2) : null;
            const approverRole = this.getEmployeeApprovalRole(approver);
            const approver2Role = this.getEmployeeApprovalRole(approver2);

            if (!(approverRole === 'DI' || approverRole === 'MD')) {
                errors['approverRoleInvalid'] = true;
            }

            if (isThb && valueAmount > threshold) {
                if (approverRole === 'DI') {
                    if (!approverCode2) {
                        errors['secondApproverRequired'] = true;
                    } else {
                        if (approver2Role !== 'DI') {
                            errors['secondApproverMustBeDi'] = true;
                        }
                        if (approverCode2 === approverCode) {
                            errors['duplicateApprover'] = true;
                        }
                    }
                } else if (approverRole !== 'MD') {
                    errors['approverNeedsMdOrDi'] = true;
                }
            } else if (approverCode2) {
                errors['secondApproverNotAllowed'] = true;
            }

            return Object.keys(errors).length > 0 ? errors : null;
        };
    }

    // -------------------- Submit --------------------

    onSubmit(): void {
        if (this.hasBlockingFieldErrors()) {
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

        const formData = this.form.value;
        const includeSecondApprover = this.shouldDisplaySecondApprover();

        // Helper function to get employee ID from code
        const getEmployeeId = (code: string): number | undefined => {
            if (!code) return undefined;
            const employee = this.users.find(u => u.code === code);
            return employee?.employeeId;
        };

        // Transform camelCase to snake_case for API
        const apiPayload: CreateCharitableContributionRequest = {
            requested_by: formData.requestedBy,
            request_type: formData.requestType,
            event_description: formData.eventDescription,
            event_purpose: formData.eventPurpose,
            organizer_name: formData.organizerName,
            contribution_description: formData.contributionDescription,
            value_amount: formData.valueAmount,
            currency_code: formData.currencyCode || 'THB',
            proposed_date: this.formatDate(formData.proposedDate),
            vat_amount: formData.vatAmount ? parseFloat(formData.vatAmount) : 0,
            acsc_by: formData.acscBy || null,
            acsc_by_date: null,
            acsc_by_status: 'pending',
            acsl_by: formData.acslBy || null,
            acsl_by_date: null,
            acsl_by_status: null,
            ims_acknowledged_by: formData.imsAcknowledgedBy || null,
            ims_acknowledged_by_date: null,
            ims_acknowledged_by_status: null,
            approver_by: formData.approverBy || null,
            approver_by_date: null,
            approver_by_status: null,
            approver_by_2: includeSecondApprover ? (formData.approverBy2 || null) : null,
            approver_by_2_date: null,
            approver_by_2_status: null,
            attachments: []
        };

        if (this.isEdit && this.requestId) {
            this.charitableContributionService.update(this.requestId, apiPayload as any).subscribe({
                next: () => {
                    this.loading = false;
                    this.toastr.success('Charitable Contribution request updated successfully!');

                    setTimeout(() => {
                        this.router.navigate(['/charitable-contributions']);
                    }, 1500);
                },
                error: (error) => {
                    this.loading = false;
                    this.toastr.error(
                        error?.error?.message ||
                        'Failed to update charitable contribution request. Please try again.'
                    );
                }
            });
        } else {
            this.charitableContributionService.create(apiPayload as any).subscribe({
                next: (response) => {
                    this.loading = false;
                    this.toastr.success('Charitable Contribution request created successfully!');
                    this.sendInitialEmailNotification(apiPayload, response);

                    setTimeout(() => {
                        this.router.navigate(['/charitable-contributions']);
                    }, 1500);
                },
                error: (error) => {
                    this.loading = false;
                    this.toastr.error(
                        error?.error?.message ||
                        'Failed to create charitable contribution request. Please try again.'
                    );
                }
            });
        }
    }

    private sendInitialEmailNotification(apiPayload: any, response: any): void {
        const contributionId = this.workflowEmailNotificationService.readResponseId(response);
        const notificationSource = {
            ...this.workflowEmailNotificationService.createNotificationSource(apiPayload, response),
            create_by: apiPayload.requested_by,
            id: contributionId
        };

        this.workflowEmailNotificationService
            .notifyInitialAction(CHARITABLE_CONTRIBUTION_EMAIL_CONFIG, notificationSource, contributionId)
            .subscribe({
                error: (error) => {
                    console.error('Failed to send charitable contribution email notification:', error);
                    this.toastr.warning('Request was saved, but email notification could not be sent.');
                }
            });
    }

    private loadRequest(): void {
        if (!this.requestId) return;

        this.loading = true;
        this.charitableContributionService.findOne(this.requestId).subscribe({
            next: (request) => {
                // Helper function to get code from employee ID
                const getCodeFromId = (id: number | string | null | undefined): string => {
                    if (!id) return '';
                    const employee = this.users.find(u => u.employeeId === Number(id));
                    return employee?.code || '';
                };

                this.form.patchValue({
                    requestedBy: request.createBy || this.getCurrentUserCode() || '',
                    requestType: request.requestType,
                    eventDescription: request.eventDescription,
                    eventPurpose: request.eventPurpose,
                    organizerName: request.organizerName,
                    contributionDescription: request.contributionDescription,
                    currencyCode: request.currencyCode || 'THB',
                    valueAmount: request.valueAmount,
                    proposedDate: request.proposedDate,
                    vatAmount: request.vatAmount || 0,
                    acscBy: request.acscBy || getCodeFromId(request.selectedAcscId),
                    acslBy: request.acslBy || getCodeFromId(request.selectedAcslId),
                    imsAcknowledgedBy: request.imsAcknowledgedBy || null,
                    approverBy: request.approverBy || getCodeFromId(request.selectedApproverId),
                    useSecondApprover: !this.isThbCurrencyCode(request.currencyCode) && !!(request.approverBy2 || getCodeFromId(request.selectedApprover2Id)),
                    approverBy2: request.approverBy2 || getCodeFromId(request.selectedApprover2Id)
                });
                this.preserveSelectedEmployeeOption(this.filteredRequesterUsers, 'requestedBy')
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe((options) => this.filteredRequesterUsers = options);
                this.preserveSelectedEmployeeOption(this.filteredAcscUsers, 'acscBy')
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe((options) => this.filteredAcscUsers = options);
                this.preserveSelectedEmployeeOption(this.filteredImsUsers, 'imsAcknowledgedBy')
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe((options) => this.filteredImsUsers = options);
                this.preserveSelectedEmployeeOption(this.filteredApproverUsers, 'approverBy')
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe((options) => this.filteredApproverUsers = options);
                this.preserveSelectedEmployeeOption(this.filteredApproverUsers2, 'approverBy2')
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe((options) => this.filteredApproverUsers2 = options);
                this.preserveSelectedEmployeeOption(this.filteredAcslUsers, 'acslBy')
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe((options) => this.filteredAcslUsers = options);
                this.loading = false;
                this.refreshApproverOptions();
            },
            error: (error) => {
                this.loading = false;
                this.toastr.error('Failed to load request details. Please try again.');
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

    // -------------------- Helpers --------------------

    private markFormGroupTouched(): void {
        Object.keys(this.form.controls).forEach((key) => {
            this.form.get(key)?.markAsTouched();
        });
    }

    getErrorMessage(fieldName: string): string {
        const control = this.form.get(fieldName);
        if (control?.hasError('required')) {
            return `${this.getFieldLabel(fieldName)} is required`;
        }
        if (control?.hasError('minlength')) {
            return `${this.getFieldLabel(fieldName)} must be at least ${control.errors?.['minlength'].requiredLength
                } characters`;
        }
        if (control?.hasError('min')) {
            if (fieldName === 'valueAmount') {
                return this.isThbCurrency()
                    ? 'Minimum value is 2,500 THB'
                    : `Value must be greater than 0 ${this.selectedCurrency}`;
            }
            return `${this.getFieldLabel(fieldName)} must be greater than ${control.errors?.['min'].min}`;
        }
        return '';
    }

    private getFieldLabel(fieldName: string): string {
        const labels: { [key: string]: string } = {
            requestType: 'Request Type',
            eventDescription: 'Event Description',
            eventPurpose: 'Event Purpose',
            organizerName: 'Organizer Name',
            contributionDescription: 'Contribution Description',
            currencyCode: 'Currency',
            valueAmount: 'Value Amount',
            proposedDate: 'Proposed Date',
            // vatAmount: 'VAT Amount',  // (ลบแล้ว)
            acscBy: 'Verify (ACSC)',
            acslBy: 'Acknowledge 2 (CA - JN)',
            imsAcknowledgedBy: 'Acknowledge 1 (ACSL)',
            approverBy: 'Approve (DI/MD)',
            approverBy2: 'Approve 2 (DI)'
        };
        return labels[fieldName] || fieldName;
    }

    isFieldInvalid(fieldName: string): boolean {
        const control = this.form.get(fieldName);
        return !!(control && control.invalid && (control.dirty || control.touched));
    }

    hasBlockingFieldErrors(): boolean {
        return this.form.invalid;
    }

    shouldDisplaySecondApprover(): boolean {
        if (!this.isThbCurrency()) {
            return this.form.get('useSecondApprover')?.value === true;
        }

        const valueAmount = Number(this.form.get('valueAmount')?.value || 0);
        return valueAmount > CharitableContributionFormComponent.APPROVAL_THRESHOLD;
    }

    isSecondApproverRequired(): boolean {
        if (!this.shouldDisplaySecondApprover()) {
            return false;
        }
        if (!this.isThbCurrency()) {
            return false;
        }
        const approver = this.users.find((u) => u.code === this.form.get('approverBy')?.value);
        return this.getEmployeeApprovalRole(approver) === 'DI';
    }

    shouldShowManualSecondApproverToggle(): boolean {
        return !this.isThbCurrency();
    }

    isThbCurrency(): boolean {
        return this.isThbCurrencyCode(this.selectedCurrency);
    }

    getValueAmountMin(): number | null {
        return this.isThbCurrency() ? 2500 : null;
    }

    getValueAmountPlaceholder(): string {
        return this.isThbCurrency()
            ? 'Minimum 2,500.00'
            : `Amount in ${this.selectedCurrency}`;
    }

    private isThbCurrencyCode(value: unknown): boolean {
        return String(value || 'THB').trim().toUpperCase() === 'THB';
    }

    getApprovalRoutingError(): string | null {
        const errors = this.form.errors;
        if (!errors) {
            return null;
        }

        if (errors['approverSelfNotAllowed']) return 'Approver 1 cannot be the requester.';
        if (errors['approver2SelfNotAllowed']) return 'Approver 2 cannot be the requester.';
        if (errors['approverRoleInvalid']) return 'Approver 1 must be DI or MD.';
        if (errors['approverNeedsMdOrDi']) return 'High value requests require Approver 1 to be DI or MD.';
        if (errors['secondApproverRequired']) return 'If Approver 1 is DI and amount is above 20,000 THB, Approver 2 is required.';
        if (errors['secondApproverMustBeDi']) return 'Approver 2 must be DI.';
        if (errors['duplicateApprover']) return 'Approver 2 must be different from Approver 1.';
        if (errors['secondApproverNotAllowed']) return this.isThbCurrency()
            ? 'Approver 2 is only used when amount is above 20,000 THB and Approver 1 is DI.'
            : 'Approver 2 is only available when Require Approver 2 is selected.';
        return null;
    }

    getApprovalRoutingWarning(): string | null {
        if (
            this.isThbCurrency() &&
            Number(this.form.get('valueAmount')?.value || 0) > CharitableContributionFormComponent.APPROVAL_THRESHOLD &&
            !this.isCurrentUserEeOrAbove()
        ) {
            return 'Requests above 20,000 THB can only be submitted by EE level or above.';
        }

        const selfCode = this.form.get('requestedBy')?.value || this.getCurrentUserCode();
        const acscBy = this.form.get('acscBy')?.value as string | null;
        if (acscBy && selfCode && acscBy === selfCode) {
            return 'ACSC verifier cannot be the requester.';
        }

        const acslBy = this.form.get('acslBy')?.value as string | null;
        if (acslBy && selfCode && acslBy === selfCode) {
            return 'Accounts acknowledger (CA) cannot be the requester.';
        }

        return null;
    }

    getApproverSectionLabel(): string {
        return this.isHighValueRequest() ? 'Approved By (DI/MD)' : 'Approved By (DI/MD)';
    }

    private isHighValueRequest(): boolean {
        return this.isThbCurrency() &&
            Number(this.form.get('valueAmount')?.value || 0) > CharitableContributionFormComponent.APPROVAL_THRESHOLD;
    }

    getSecondApproverCandidates(): EmployeeOption[] {
        return this.filteredApproverUsers2;
    }

    private getEmployeeApprovalRole(employee: EmployeeOption | null | undefined): Role | null {
        if (!employee) {
            return null;
        }

        const source = `${employee.role || ''} ${employee.levelName || ''}`.toUpperCase();
        if (source.includes('MANAGING DIRECTOR') || source.includes(' MD ') || source.startsWith('MD') || source.endsWith('MD')) {
            return 'MD';
        }
        if (source.includes('DIRECTOR') || source.includes(' DI ') || source.startsWith('DI') || source.endsWith('DI')) {
            return 'DI';
        }
        if (source.includes('ACSC')) {
            return 'ACSC';
        }
        if (source.includes('ACSL')) {
            return 'ACSL';
        }
        return null;
    }

    private findLoadedEmployee(reference: string): EmployeeOption | undefined {
        return this.allLoadedEmployees.get(String(reference))
            || this.users.find((user) => user.code === reference || user.id === reference);
    }

    private isCurrentUser(employee: EmployeeOption): boolean {
        const currentUserCode = this.getCurrentUserCode();
        const rawId = this.currentUserRawData?.id ?? this.currentUser?.id ?? null;

        return employee.code === currentUserCode || String(employee.employeeId ?? '') === String(rawId ?? '');
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

    private isCurrentUserEeOrAbove(): boolean {
        const source = `${this.currentUserRawData?.title_name || ''} ${this.currentUserRawData?.level_name || ''}`.toUpperCase();
        return source.includes('EE') ||
            source.includes('EXECUTIVE ENGINEER') ||
            source.includes('TEAM LEADER') ||
            source.includes('TL') ||
            source.includes('DIRECTOR') ||
            source.includes('DI') ||
            source.includes('MANAGING DIRECTOR') ||
            source.includes('MD');
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
}
