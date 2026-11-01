import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormArray, FormsModule, FormControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { HttpClient } from '@angular/common/http';
import { ApiConfig } from 'app/core/config/api.config';
import { DEFAULT_PURCHASE_PAYMENT_TERM } from 'app/core/constants/purchase-payment-term.constant';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { PurchaseRequisitionService } from 'app/core/services/purchase-requisition.service';
import { PurchaseRequisitionNotificationService } from 'app/core/services/purchase-requisition-notification.service';
import { AuthService } from 'app/core/services/auth.service';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';

export interface RequisitionItem {
    item: string;
    description: string;
    needAssetCodeRegistration?: boolean;
    quantity: number;
    unitPrice: number;
    amount: number;
}

export function trimmedMinLengthValidator(minLength: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const value = String(control.value ?? '');
        if (!value) {
            return null;
        }

        const actualLength = value.trim().length;
        return actualLength >= minLength
            ? null
            : { trimmedMinLength: { requiredLength: minLength, actualLength } };
    };
}


@Component({
    selector: 'app-purchase-requisition-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        TextFieldModule,
        MatSelectModule,
        MatCheckboxModule,
        MatRadioModule,
        MatProgressSpinnerModule,
        MatCardModule,
        MatDividerModule,
        MatIconModule,
        MatDatepickerModule,
        MatDialogModule,
        RouterLink,
        NgxMatSelectSearchModule
    ],
    templateUrl: './purchase-requisition-form.component.html',
    styleUrls: ['./purchase-requisition-form.component.scss']
})
export class PurchaseRequisitionFormComponent implements OnInit, OnDestroy {
    private static readonly SECOND_APPROVER_THRESHOLD = 50000;
    readonly defaultPaymentTerm = DEFAULT_PURCHASE_PAYMENT_TERM;

    form: FormGroup;
    isEditMode = false;
    isLoading = false;
    isSubmitting = false;
    isSavingDraft = false;
    suppressValidationErrors = false;
    currentRequisitionId: string | null = null;
    currentDocumentStatus: 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'APPROVED' | 'REJECTED' | 'ACKNOWLEDGED' | 'COMPLETED' = 'DRAFT';
    users: EmployeeOption[] = [];
    
    // ✅ FIX: เก็บพนักงานทั้งหมดที่โหลดมา เพื่อป้องกัน MatSelect ดีดค่าหลุด (Autocomplete dropdown dropout)
    allLoadedEmployees = new Map<string, EmployeeOption>();

    // Filtered users for each select
    filteredRequestedUsers: EmployeeOption[] = [];
    filteredVerifiedISUsers: EmployeeOption[] = [];
    filteredVerifiedUsers: EmployeeOption[] = [];
    filteredApprovedUsers: EmployeeOption[] = [];
    filteredApprovedUsers2: EmployeeOption[] = [];
    filteredAcknowledgedUsers: EmployeeOption[] = [];
    filteredActionByAdminUsers: EmployeeOption[] = [];

    // Search controls
    requestedSearchCtrl = new FormControl('');
    verifiedISSearchCtrl = new FormControl('');
    verifiedSearchCtrl = new FormControl('');
    approvedSearchCtrl = new FormControl('');
    approvedSearchCtrl2 = new FormControl('');
    acknowledgedSearchCtrl = new FormControl('');
    actionByAdminSearchCtrl = new FormControl('');

    /** Currency options for dropdown – common/base currencies used in general (หน่วยเงินพื้นฐานที่ใช้งานทั่วไป) */
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

    /** Selected currency for display (table headers, amounts) */
    get selectedCurrency(): string {
        return this.form?.get('currency')?.value || 'THB';
    }

    get requiredFieldTotal(): number {
        return this.requiredControlsForCounter.length + this.requiredItemControlCountForCounter;
    }

    get requiredFieldsLeft(): number {
        const missingFormControls = this.requiredControlsForCounter.filter((name) => {
            const control = this.form.get(name);
            return control ? control.invalid : false;
        }).length;

        let missingItemControls = 0;
        this.itemsFormArray.controls.forEach((group) => {
            ['description', 'quantity', 'unitPrice'].forEach((name) => {
                const control = group.get(name);
                if (control?.invalid) {
                    missingItemControls += 1;
                }
            });
        });

        return missingFormControls + missingItemControls;
    }

    get requiredProgressPercent(): number {
        if (!this.requiredFieldTotal) {
            return 100;
        }

        const completed = this.requiredFieldTotal - this.requiredFieldsLeft;
        return Math.max(6, Math.round((completed / this.requiredFieldTotal) * 100));
    }

    private get requiredControlsForCounter(): string[] {
        const controls = [
            'to',
            'subject',
            'requestedBy',
            'currency',
            'date',
            'reasonsForPurchase',
            'verifiedBy',
            'approvedBy',
            'acknowledgedBy',
            'actionByAdmin',
        ];

        return this.requiresSecondApprover() ? [...controls, 'approvedBy2'] : controls;
    }

    private get requiredItemControlCountForCounter(): number {
        return this.itemsFormArray.length * 3;
    }

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute,
        private dialog: MatDialog,
        private http: HttpClient,
        private apiConfig: ApiConfig,
        private employeeService: EmployeeService,
        private purchaseRequisitionService: PurchaseRequisitionService,
        private purchaseRequisitionNotificationService: PurchaseRequisitionNotificationService,
        private authService: AuthService,
        private fuseConfirmationService: FuseConfirmationService,
        private toastr: ToastrService
    ) {
        this.form = this.createForm();
        // Set locale for date formatting
        if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
            // This will help with date formatting
        }
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    ngOnInit(): void {
        this.initializeForm();
        this.loadUsers();
        this.checkEditMode();
    }

    private createForm(): FormGroup {
        return this.fb.group({
	            // General Request Information
	            to: ['', Validators.required],
	            subject: ['', [Validators.required, Validators.pattern(/\S/), trimmedMinLengthValidator(6)]],
	            requestedBy: ['', Validators.required],
            currency: ['THB', Validators.required],
            deadline: [''],
            reasonsForPurchase: ['', [Validators.required, Validators.minLength(10)]],
            date: [new Date(), Validators.required],
            recommendedBy: [''],
            receivedFrom: [''],

            // Items
            items: this.fb.array([]),

            // Terms and Conditions
            paymentTerm: [this.defaultPaymentTerm],
            otherConditions: [''],
            quotationAttached: [false],
            notITEquipment: [false],
            vat: [false],
            discount: [0],
            subTotal: [0],
            vatValue: [0],
            grandTotal: [0],

            // Documents
            documents: this.fb.group({
                attachments: this.fb.array([])
            }),

            // Approval and Action Workflow
            requestedDate: [new Date()],
            verifiedByIS: [''],
            verifiedISDate: [null],
            verifiedBy: ['', Validators.required],
            verifiedDate: [null],
            approvedBy: ['', Validators.required],
            approvedDate: [null],
            approvedBy2: [''],
            approvedBy2Date: [null],
            acknowledgedBy: ['', Validators.required],
            acknowledgedDate: [null],
            needAssetCodeRegistration: [''],
            actionByAdmin: ['', Validators.required],
            actionByAdminDate: [null],

            // Status
            status: ['DRAFT'],
            createdBy: [''],
            createdAt: [''],
            updatedAt: ['']
        });
    }

    private initializeForm(): void {
        this.addItem();
        this.form.get('vat')?.valueChanges
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => this.calculateTotals());
        this.form.get('discount')?.valueChanges
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => this.calculateTotals());

        this.form.get('approvedBy')?.valueChanges
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => this.updateSecondApproverRequirement());

        this.form.get('approvedBy2')?.valueChanges
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => this.updateSecondApproverRequirement());

        this.form.get('notITEquipment')?.valueChanges
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((isNotIT) => {
                if (isNotIT) {
                    this.form.patchValue({
                        verifiedByIS: '',
                        verifiedISDate: null
                    });
                } else {
                    // Default back to ATC if available (and not in edit mode)
                    if (this.filteredVerifiedISUsers.length > 0 && !this.isEditMode) {
                        this.form.patchValue({
                            verifiedByIS: this.filteredVerifiedISUsers[0].code
                        });
                    }
                }
            });
    }

    private loadUsers(): void {
        this.employeeService.getEmployeeOptions().subscribe({
            next: (employees) => {
                this.users = employees;
                
                // ✅ FIX: ใส่พนักงานทั้งหมดลงใน Cache Map (รองรับทั้ง id และ code)
                employees.forEach(e => {
                    if (e.id) this.allLoadedEmployees.set(String(e.id), e);
                    if (e.code) this.allLoadedEmployees.set(e.code, e);
                });

                // Initialize filtered arrays
                this.filteredRequestedUsers = this.users;
                this.filteredVerifiedUsers = this.users;
                this.filteredApprovedUsers = this.users;
                this.filteredApprovedUsers2 = this.users;
                
                // Load Verified By IS with 'ATC' search and auto-select first
                this.loadVerifiedISUsers();
                // Load Acknowledged with 'JN' search and auto-select first
                this.loadAcknowledgedUsers();
                // Load Action By Admin with 'OKK' search and auto-select first
                this.loadActionByAdminUsers();

                // Setup search filters
                this.setupSearchFilters();
                // Sync "To" from "Verify by" (MD/DI/AD/TL) selection
                this.setupVerifiedByToSync();

                // Default Requested by = logged-in user (new form only)
                const routeId = this.route.snapshot.paramMap.get('id');
                if (!routeId || routeId === 'new') {
                    const userCode = getCurrentUserCode();
                    const codeToSet = userCode ?? this.findEmployeeCodeByCurrentUser();
                    if (codeToSet) {
                        this.form.patchValue({ requestedBy: codeToSet });
                    }
                }
            },
            error: (error) => {
                console.error('Error loading employees:', error);
                this.toastr.error('Failed to load employees. Please try again.');
            }
        });
    }

    /**
     * ✅ FIX: ตัวช่วย อัปเดตรายชื่อพนักงานที่กรอง พร้อมกับดันคนเดิมที่เลือกค้างไว้ให้ไม่หลุดลิสต์
     */
    private updateFilteredUsers(
        employees: EmployeeOption[], 
        listName: 'filteredRequestedUsers' | 'filteredVerifiedISUsers' | 'filteredVerifiedUsers' | 'filteredApprovedUsers' | 'filteredApprovedUsers2' | 'filteredAcknowledgedUsers' | 'filteredActionByAdminUsers',
        formControlName: string
    ): void {
        // อัปเดตพนักงานใหม่ที่ดึงมาลงใน Map
        employees.forEach(e => {
            if (e.id) this.allLoadedEmployees.set(String(e.id), e);
            if (e.code) this.allLoadedEmployees.set(e.code, e);
        });
        
        let list = [...employees];
        const currentVal = this.form.get(formControlName)?.value;
        if (currentVal && !list.some(u => u.code === currentVal || String(u.id) === String(currentVal))) {
            const savedUser = this.allLoadedEmployees.get(String(currentVal));
            if (savedUser) {
                list.unshift(savedUser); // ยัดกลับเข้าไปเป็นไอเท็มแรกสุด
            }
        }
        (this as any)[listName] = list;
    }

    /**
     * ✅ FIX: อัปเดตรายชื่อพนักงานในทุก dropdown เพื่อให้ค่าที่เคยเลือกไว้ไม่หลุดหาย
     */
    private updateAllFilteredUsers(): void {
        this.updateFilteredUsers(this.filteredRequestedUsers, 'filteredRequestedUsers', 'requestedBy');
        this.updateFilteredUsers(this.filteredVerifiedISUsers, 'filteredVerifiedISUsers', 'verifiedByIS');
        this.updateFilteredUsers(this.filteredVerifiedUsers, 'filteredVerifiedUsers', 'verifiedBy');
        this.updateFilteredUsers(this.filteredApprovedUsers, 'filteredApprovedUsers', 'approvedBy');
        this.updateFilteredUsers(this.filteredApprovedUsers2, 'filteredApprovedUsers2', 'approvedBy2');
        this.updateFilteredUsers(this.filteredAcknowledgedUsers, 'filteredAcknowledgedUsers', 'acknowledgedBy');
        this.updateFilteredUsers(this.filteredActionByAdminUsers, 'filteredActionByAdminUsers', 'actionByAdmin');
    }

    /**
     * Load Verified By IS users with 'ATC' search term and auto-select first
     */
    private loadVerifiedISUsers(): void {
        const isNotIT = this.form.get('notITEquipment')?.value === true;
        this.employeeService.getEmployeeOptions('ATC', 50).subscribe({
            next: (employees) => {
                this.updateFilteredUsers(employees, 'filteredVerifiedISUsers', 'verifiedByIS');
                
                const currentVal = this.form.get('verifiedByIS')?.value;
                if (employees.length > 0 && !this.isEditMode && !isNotIT && (!currentVal || currentVal === '')) {
                    this.form.patchValue({ verifiedByIS: employees[0].code });
                }
            },
            error: (error) => {
                console.error('Error loading ATC employees:', error);
            }
        });
    }

    /**
     * Setup search filters for each select
     */
    private setupSearchFilters(): void {
        // Requested By search - ใช้ API search
        this.requestedSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    return this.employeeService.getEmployeeOptions(searchTerm, 50);
                }),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((employees) => {
                this.updateFilteredUsers(employees, 'filteredRequestedUsers', 'requestedBy');
            });

        // Verified By IS search - ใช้ API search
        this.verifiedISSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    return this.employeeService.getEmployeeOptions(searchTerm, 50);
                }),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((employees) => {
                this.updateFilteredUsers(employees, 'filteredVerifiedISUsers', 'verifiedByIS');
            });

        // Verified By search - ใช้ API search
        this.verifiedSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    return this.employeeService.getEmployeeOptions(searchTerm, 50);
                }),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((employees) => {
                this.updateFilteredUsers(employees, 'filteredVerifiedUsers', 'verifiedBy');
            });

        // Approved By search - ใช้ API search
        this.approvedSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    return this.employeeService.getEmployeeOptions(searchTerm, 50);
                }),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((employees) => {
                this.updateFilteredUsers(employees, 'filteredApprovedUsers', 'approvedBy');
            });

        // Approved By 2 search
        this.approvedSearchCtrl2.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    return this.employeeService.getEmployeeOptions(searchTerm, 50);
                }),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((employees) => {
                this.updateFilteredUsers(employees, 'filteredApprovedUsers2', 'approvedBy2');
            });

        // Acknowledged By search
        this.acknowledgedSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    return this.employeeService.getEmployeeOptions(searchTerm, 50);
                }),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((employees) => {
                this.updateFilteredUsers(employees, 'filteredAcknowledgedUsers', 'acknowledgedBy');
            });

        // Action By Admin search
        this.actionByAdminSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    return this.employeeService.getEmployeeOptions(searchTerm, 50);
                }),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((employees) => {
                this.updateFilteredUsers(employees, 'filteredActionByAdminUsers', 'actionByAdmin');
            });
    }

    /**
     * Load Acknowledged users with 'JN' search term and auto-select first
     */
    private loadAcknowledgedUsers(): void {
        this.employeeService.getEmployeeOptions('JN', 50).subscribe({
            next: (employees) => {
                this.updateFilteredUsers(employees, 'filteredAcknowledgedUsers', 'acknowledgedBy');
                
                const currentVal = this.form.get('acknowledgedBy')?.value;
                if (employees.length > 0 && !this.isEditMode && (!currentVal || currentVal === '')) {
                    this.form.patchValue({ acknowledgedBy: employees[0].code });
                }
            },
            error: (error) => {
                console.error('Error loading JN employees:', error);
            }
        });
    }

    /**
     * Load Action By Admin users with 'OKK' search term and auto-select first
     */
    private loadActionByAdminUsers(): void {
        this.employeeService.getEmployeeOptions('OKK', 50).subscribe({
            next: (employees) => {
                this.updateFilteredUsers(employees, 'filteredActionByAdminUsers', 'actionByAdmin');
                
                const currentVal = this.form.get('actionByAdmin')?.value;
                if (employees.length > 0 && !this.isEditMode && (!currentVal || currentVal === '')) {
                    this.form.patchValue({ actionByAdmin: employees[0].code });
                }
            },
            error: (error) => {
                console.error('Error loading OKK employees:', error);
            }
        });
    }

    /**
     * Sync "To" field from "Verified By" (MD/DI/AD/TL) selection: when user selects Verified By, patch To with that person's display label.
     */
    private setupVerifiedByToSync(): void {
        this.form.get('verifiedBy')?.valueChanges
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((code: string) => {
                if (!code || typeof code !== 'string') return;
                const codeTrim = code.trim();
                if (!codeTrim) return;
                // Look in users first, then in filtered list (user may have selected from search results)
                const user = this.users.find(u => u.code === codeTrim)
                    ?? this.filteredVerifiedUsers.find(u => u.code === codeTrim);
                if (user?.displayLabel) {
                    this.form.patchValue({ to: user.displayLabel }, { emitEvent: false });
                }
            });
    }

    /**
     * Find employee code by current logged-in user (email match) when user_raw_data has no code.
     */
    private findEmployeeCodeByCurrentUser(): string | null {
        const currentUser = this.authService.currentUserValue;
        if (!currentUser?.email || !this.users.length) return null;
        const match = this.users.find(u => (u.email || '').toLowerCase() === (currentUser.email || '').toLowerCase());
        return match ? match.code : null;
    }

    private checkEditMode(): void {
        this.route.paramMap.subscribe(params => {
            const id = params.get('id');
            if (id && id !== 'new') {
                this.isEditMode = true;
                this.currentRequisitionId = id;
                this.loadRequisition(id);
            }
        });
    }

    private loadRequisition(id: string): void {
        this.isLoading = true;

        this.purchaseRequisitionService.findOne(id)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (response: any) => {
                    // Handle both response formats: { status, data } or direct data
                    let data: any;
                    if (response.status !== undefined && response.data) {
                        data = response.data;
                    } else if (response.id) {
                        data = response;
                    } else {
                        data = response;
                    }

                    // Clear existing items
                    while (this.itemsFormArray.length !== 0) {
                        this.itemsFormArray.removeAt(0);
                    }

                    // Load items
                    const items = data.items || [];
                    items.forEach((item: any) => {
                        const itemGroup = this.createItemFormGroup();
                        itemGroup.patchValue({
                            item: item.item || '',
                            description: item.description || '',
                            needAssetCodeRegistration: this.toBooleanFlag(item.need_asset_code_registration),
                            quantity: this.toNumericValue(item.quantity),
                            unitPrice: this.toNumericValue(item.unit_price),
                            amount: this.toNumericValue(item.amount)
                        });
                        this.itemsFormArray.push(itemGroup);
                    });

                    // If no items, add one empty item
                    if (this.itemsFormArray.length === 0) {
                        this.addItem();
                    }

                    // Parse dates
                    const parseDate = (dateStr: string | null | undefined): Date | null => {
                        if (!dateStr) return null;
                        try {
                            const date = new Date(dateStr);
                            return isNaN(date.getTime()) ? null : date;
                        } catch {
                            return null;
                        }
                    };

                    // Patch form with data
                    this.form.patchValue({
	                        to: data.to || '',
	                        subject: data.subject || '',
	                        requestedBy: data.requested_by || '',
                        currency: data.currency_code || data.currency || 'THB',
                        deadline: parseDate(data.deadline),
                        reasonsForPurchase: data.reasons_for_purchase || '',
                        date: parseDate(data.date) || new Date(),
                        recommendedBy: data.recommended_by || '',
                        receivedFrom: data.received_from || '',
                        paymentTerm: data.payment_term ?? this.defaultPaymentTerm,
                        otherConditions: data.other_conditions || '',
                        quotationAttached: data.quotation_attached === 1 || data.quotation_attached === true,
                        notITEquipment: data.not_it_equipment === 1 || data.not_it_equipment === true,
                        vat: data.vat === true || data.vat === 1,
                        discount: this.toNumericValue(data.discount),
                        requestedDate: parseDate(data.requested_date),
                        verifiedByIS: data.verified_by_is || '',
                        verifiedISDate: parseDate(data.verified_is_date),
                        verifiedBy: data.verified_by || '',
                        verifiedDate: parseDate(data.verified_date),
                        approvedBy: data.approved_by || '',
                        approvedDate: parseDate(data.approved_date),
                        approvedBy2: data.approved_by_2 || '',
                        approvedBy2Date: parseDate(data.approved_by_2_date),
                        acknowledgedBy: data.acknowledged_by || '',
                        acknowledgedDate: parseDate(data.acknowledged_date),
                        needAssetCodeRegistration: this.toNeedAssetCodeRegistrationFormValue(data.need_asset_code_registration),
                        actionByAdmin: data.action_by_admin || '',
                        actionByAdminDate: parseDate(data.action_by_admin_date),
                        status: (data.status || 'SUBMITTED').toUpperCase()
                    });
                    this.currentDocumentStatus = (data.status || 'SUBMITTED').toUpperCase() as any;

                    // ✅ FIX: หลังจาก patchValue แล้ว ต้องบังคับ updateFilteredUsers ทุก dropdown 
                    // เพื่อดึงรายชื่อคนที่เลือกไว้ขึ้นมาแสดง (ในกรณีที่เขาไม่ได้อยู่ในลิสต์เริ่มต้น)
                    this.updateAllFilteredUsers();

                    // Optional: Fetch missing employees to ensure they have display names
                    const codesToFetch = [
                        data.requested_by,
                        data.verified_by_is,
                        data.verified_by,
                        data.approved_by,
                        data.approved_by_2,
                        data.acknowledged_by,
                        data.action_by_admin
                    ].filter(code => code && !this.allLoadedEmployees.has(String(code)));

                    if (codesToFetch.length > 0) {
                        codesToFetch.forEach(code => {
                            this.employeeService.getEmployeeOptions(code, 1).subscribe(res => {
                                if (res.length > 0) {
                                    this.updateFilteredUsers(res, 'filteredRequestedUsers', 'requestedBy'); // This will update cache
                                    this.updateAllFilteredUsers(); // Force refresh all lists
                                }
                            });
                        });
                    }

                    if (Array.isArray(data.attachments) && data.attachments.length > 0) {
                        const arr = this.attachmentsArray;
                        arr.clear();
                        data.attachments.forEach((path: string) => {
                            const name = path.split('/').pop() || path;
                            arr.push(this.fb.group({
                                id: [null],
                                file_name: [name],
                                file_path: [path],
                                file_url: [''],
                                file_size: [null],
                                mime_type: [''],
                                description: [''],
                                uploaded_at: [null],
                                type: ['file'],
                                file: [null]
                            }));
                        });
                    }

                    // Recalculate totals
                    this.calculateTotals();

                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Error loading requisition:', error);
                    this.toastr.error(error?.error?.message || 'Failed to load requisition. Please try again.');
                    this.isLoading = false;
                }
            });
    }

    get itemsFormArray(): FormArray {
        return this.form.get('items') as FormArray;
    }

    createItemFormGroup(): FormGroup {
        return this.fb.group({
            item: [''],
            description: ['', Validators.required],
            needAssetCodeRegistration: [false],
            quantity: [1, [Validators.required, Validators.min(1)]],
            unitPrice: [0, [Validators.required, Validators.min(0)]],
            amount: [0]
        });
    }

    addItem(): void {
        const itemGroup = this.createItemFormGroup();
        this.itemsFormArray.push(itemGroup);

        // Subscribe to quantity and unitPrice changes to calculate amount
        const quantityControl = itemGroup.get('quantity');
        const unitPriceControl = itemGroup.get('unitPrice');

        if (quantityControl && unitPriceControl) {
            quantityControl.valueChanges.subscribe((value) => {
                const numericValue = this.toNumericValue(value, 0);
                if (value !== numericValue) {
                    quantityControl.setValue(numericValue, { emitEvent: false });
                }
                this.calculateItemAmount(itemGroup);
            });
            unitPriceControl.valueChanges.subscribe((value) => {
                const numericValue = this.toNumericValue(value, 0);
                if (value !== numericValue) {
                    unitPriceControl.setValue(numericValue, { emitEvent: false });
                }
                this.calculateItemAmount(itemGroup);
            });
        }
    }

    removeItem(index: number): void {
        if (this.itemsFormArray.length > 1) {
            this.itemsFormArray.removeAt(index);
            this.calculateTotals();
        }
    }

    calculateItemAmount(itemGroup: FormGroup): void {
        const quantity = Number(itemGroup.get('quantity')?.value) || 0;
        const unitPrice = Number(itemGroup.get('unitPrice')?.value) || 0;
        const amount = Number.isFinite(quantity) && Number.isFinite(unitPrice)
            ? this.roundToCurrency(quantity * unitPrice)
            : 0;
        itemGroup.get('amount')?.setValue(amount);
        this.calculateTotals();
    }

    calculateTotals(): void {
        const items = this.itemsFormArray.value;
        const itemsTotal = this.roundToCurrency(items.reduce((sum: number, item: RequisitionItem) => {
            const amount = Number(item.amount);
            return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0));
        const discount = Math.max(0, this.roundToCurrency(Number(this.form.get('discount')?.value) || 0));
        const subTotal = this.roundToCurrency(Math.max(0, itemsTotal - discount));
        const vatChecked = this.form.get('vat')?.value === true;
        const vat = vatChecked ? this.roundToCurrency(subTotal * 0.07) : 0;
        const grandTotal = this.roundToCurrency(Number(subTotal) + Number(vat));

        // Update form with calculated values (if form has these controls)
        this.form.patchValue({
            subTotal: subTotal,
            vatValue: vat,
            grandTotal: grandTotal
        }, { emitEvent: false });
        this.updateSecondApproverRequirement();
    }

    requiresSecondApprover(): boolean {
        const grandTotal = Number(this.form?.get('grandTotal')?.value || 0);
        return Number.isFinite(grandTotal) && grandTotal > PurchaseRequisitionFormComponent.SECOND_APPROVER_THRESHOLD;
    }

    private updateSecondApproverRequirement(): void {
        const approvedBy2Control = this.form.get('approvedBy2');
        if (!approvedBy2Control) {
            return;
        }

        if (this.requiresSecondApprover()) {
            approvedBy2Control.setValidators([Validators.required]);
        } else {
            approvedBy2Control.setValue('', { emitEvent: false });
            approvedBy2Control.clearValidators();
        }

        approvedBy2Control.updateValueAndValidity({ emitEvent: false });

        const approvedBy = String(this.form.get('approvedBy')?.value || '').trim();
        const approvedBy2 = String(approvedBy2Control.value || '').trim();
        if (this.requiresSecondApprover() && approvedBy && approvedBy2 && approvedBy === approvedBy2) {
            approvedBy2Control.setErrors({
                ...(approvedBy2Control.errors || {}),
                duplicateApprover: true
            });
        }
    }

    onSubmit(): void {
        if (this.isSubmitting || this.isSavingDraft) return;
        this.suppressValidationErrors = false;

        if (!this.form.valid) {
            this.markFormGroupTouched();
            const missingLabels = this.getMissingSubmitFieldLabels();
            this.toastr.error(
                missingLabels.length > 0
                    ? `Please fill in required fields: ${missingLabels.join(', ')}`
                    : 'Please fill in all required fields correctly.'
            );
            this.scrollToFirstInvalidControl();
            return;
        }

        const confirmation = this.fuseConfirmationService.open({
            title: this.isEditMode ? 'Confirm workflow reset' : 'Confirm submit',
            message: this.isEditMode
                ? 'If you save this update, the entire approval workflow will be reset and new emails will be sent in sequence. Do you want to continue?'
                : 'Are you sure you want to submit this purchase requisition?',
            icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
            actions: {
                cancel: { show: true, label: 'Cancel' },
                confirm: { show: true, label: this.isEditMode ? 'Update' : 'Submit', color: 'primary' },
            },
            dismissible: false,
        });

        confirmation.afterClosed().subscribe((result) => {
            if (result !== 'confirmed') return;
            this.submitForm('submitted');
        });
    }

    onSaveDraft(): void {
        if (!this.canSaveDraft || this.isSubmitting || this.isSavingDraft) {
            return;
        }

        this.suppressValidationErrors = true;
        this.clearFormValidationState();
        this.submitForm('draft');
    }

    get canSaveDraft(): boolean {
        return !this.isEditMode || this.currentDocumentStatus === 'DRAFT';
    }

    private submitForm(targetStatus: 'draft' | 'submitted' = 'submitted'): void {
        const isDraft = targetStatus === 'draft';
        this.isSubmitting = !isDraft;
        this.isSavingDraft = isDraft;
        this.calculateTotals();

        const formData = this.form.value;

        // Add calculated totals
        const items = formData.items;
        const itemsTotal = this.roundToCurrency(
            items.reduce((sum: number, item: RequisitionItem) => sum + (Number(item.amount) || 0), 0)
        );
        const discount = Math.max(0, this.roundToCurrency(Number(formData.discount) || 0));
        const subTotal = this.roundToCurrency(Math.max(0, itemsTotal - discount));
        const vatChecked = formData.vat === true;
        const vatAmount = vatChecked ? this.roundToCurrency(subTotal * 0.07) : 0;
        const grandTotal = this.roundToCurrency(Number(subTotal) + Number(vatAmount));

        if (!this.ensurePdfOnlyAttachments()) {
            this.isSubmitting = false;
            this.isSavingDraft = false;
            return;
        }

        const attachmentsPaths = (this.attachmentsArray?.value || [])
            .map((a: { file_path?: string }) => a?.file_path)
            .filter((p: string | undefined): p is string => !!p)
            .map((p: string) => p.startsWith('/') ? p : `/${p}`);
        // Transform camelCase to snake_case for API
        const apiPayload: any = {
            status: targetStatus,
            to: formData.to || '',
            subject: formData.subject || '',
            currency_code: formData.currency || 'THB',
            date: this.formatDate(formData.date),
            deadline: formData.deadline ? this.formatDate(formData.deadline) : null,
            recommended_by: formData.recommendedBy || null,
            received_from: formData.receivedFrom || null,
            reasons_for_purchase: formData.reasonsForPurchase || '',
            items: (formData.items || [])
                .map((item: RequisitionItem) => ({
                    item: String(item.item ?? '').trim(),
                    description: item.description || '',
                    need_asset_code_registration: item.needAssetCodeRegistration ? 1 : 0,
                    quantity: Number(item.quantity) || 0,
                    unit_price: Number(item.unitPrice) || 0,
                    amount: Number(item.amount) || 0
                }))
                .filter((item) => !isDraft || !this.isItemPayloadEmpty(item)),
            payment_term: formData.paymentTerm ?? this.defaultPaymentTerm,
            other_conditions: formData.otherConditions || '',
            quotation_attached: formData.quotationAttached ? 1 : 0,
            not_it_equipment: formData.notITEquipment ? 1 : 0,
            vat: formData.vat ? 1 : 0,
            // Add totals fields
            discount,
            sub_total: subTotal,
            vat_value: vatAmount,
            grand_total: grandTotal,
            attachments: attachmentsPaths,
            // Approval and Action Workflow - send code
            requested_by: (formData.requestedBy && formData.requestedBy.trim() !== '') ? formData.requestedBy : null,
            requested_by_status: (!isDraft && formData.requestedBy && formData.requestedBy.trim() !== '') ? 'pending' : null,
            requested_date: (!isDraft && formData.requestedDate) ? this.formatDate(formData.requestedDate) : null,
            verified_by_is: formData.notITEquipment ? null : ((formData.verifiedByIS && formData.verifiedByIS.trim() !== '') ? formData.verifiedByIS : null),
            verified_by_is_status: (!isDraft && !formData.notITEquipment && formData.verifiedByIS && formData.verifiedByIS.trim() !== '') ? 'pending' : null,
            verified_is_date: (!isDraft && !formData.notITEquipment && formData.verifiedISDate) ? this.formatDate(formData.verifiedISDate) : null,
            verified_by: (formData.verifiedBy && formData.verifiedBy.trim() !== '') ? formData.verifiedBy : null,
            verified_by_status: (!isDraft && formData.verifiedBy && formData.verifiedBy.trim() !== '') ? 'pending' : null,
            verified_date: (!isDraft && formData.verifiedDate) ? this.formatDate(formData.verifiedDate) : null,
            approved_by: (formData.approvedBy && formData.approvedBy.trim() !== '') ? formData.approvedBy : null,
            approved_by_status: (!isDraft && formData.approvedBy && formData.approvedBy.trim() !== '') ? 'pending' : null,
            approved_date: (!isDraft && formData.approvedDate) ? this.formatDate(formData.approvedDate) : null,
            approved_by_2: this.requiresSecondApprover() && formData.approvedBy2 && formData.approvedBy2.trim() !== '' ? formData.approvedBy2 : null,
            approved_by_2_status: (!isDraft && this.requiresSecondApprover() && formData.approvedBy2 && formData.approvedBy2.trim() !== '') ? 'pending' : null,
            approved_by_2_date: (!isDraft && this.requiresSecondApprover() && formData.approvedBy2Date) ? this.formatDate(formData.approvedBy2Date) : null,
            acknowledged_by: (formData.acknowledgedBy && formData.acknowledgedBy.trim() !== '') ? formData.acknowledgedBy : null,
            acknowledged_by_status: (!isDraft && formData.acknowledgedBy && formData.acknowledgedBy.trim() !== '') ? 'pending' : null,
            acknowledged_date: (!isDraft && formData.acknowledgedDate) ? this.formatDate(formData.acknowledgedDate) : null,
            need_asset_code_registration: this.toNeedAssetCodeRegistrationPayload(formData.needAssetCodeRegistration),
            action_by_admin: (formData.actionByAdmin && formData.actionByAdmin.trim() !== '') ? formData.actionByAdmin : null,
            action_by_admin_date: (!isDraft && formData.actionByAdminDate) ? this.formatDate(formData.actionByAdminDate) : null
        };

        if (this.isEditMode && this.currentRequisitionId) {
            this.purchaseRequisitionService.update(this.currentRequisitionId, apiPayload).subscribe({
                next: (response) => {
                    this.isSubmitting = false;
                    this.isSavingDraft = false;
                    if (isDraft) {
                        this.handleDraftSaved(response);
                        return;
                    }

                    this.currentDocumentStatus = 'SUBMITTED';
                    this.toastr.success('Purchase Requisition updated successfully!');
                    this.sendInitialEmailNotification(apiPayload, response, this.currentRequisitionId);

                    setTimeout(() => {
                        this.router.navigate(['/purchase-requisition/view', this.currentRequisitionId]);
                    }, 1500);
                },
                error: (error) => {
                    this.isSubmitting = false;
                    this.isSavingDraft = false;
                    this.toastr.error(error?.error?.message || (isDraft ? 'Failed to save draft. Please try again.' : 'Failed to update purchase requisition. Please try again.'));
                }
            });
        } else {
            this.purchaseRequisitionService.create(apiPayload).subscribe({
                next: (response) => {
                    this.isSubmitting = false;
                    this.isSavingDraft = false;
                    if (isDraft) {
                        this.handleDraftSaved(response);
                        return;
                    }

                    this.currentDocumentStatus = 'SUBMITTED';
                    this.toastr.success('Purchase Requisition created successfully!');
                    const requisitionId = this.getRequisitionIdFromResponse(response);
                    this.sendInitialEmailNotification(apiPayload, response);

                    setTimeout(() => {
                        if (requisitionId !== null && requisitionId !== undefined && String(requisitionId) !== '') {
                            this.router.navigate(['/purchase-requisition/view', requisitionId]);
                            return;
                        }

                        this.router.navigate(['/purchase-requisition']);
                    }, 1500);
                },
                error: (error) => {
                    this.isSubmitting = false;
                    this.isSavingDraft = false;
                    this.toastr.error(error?.error?.message || (isDraft ? 'Failed to save draft. Please try again.' : 'Failed to create purchase requisition. Please try again.'));
                }
            });
        }
    }

    private handleDraftSaved(response: any): void {
        const created = this.unwrapApiResponse(response);
        const requisitionId = this.getRequisitionIdFromResponse(response, this.currentRequisitionId);

        if (requisitionId !== null && requisitionId !== undefined && String(requisitionId) !== '') {
            this.currentRequisitionId = String(requisitionId);
            this.isEditMode = true;
            this.router.navigate(['/purchase-requisition/edit', requisitionId], { replaceUrl: true });
        }

        this.currentDocumentStatus = 'DRAFT';
        this.form.patchValue({
            status: 'DRAFT',
            subject: created?.subject ?? this.form.get('subject')?.value
        }, { emitEvent: false });
        this.toastr.success('Purchase Requisition draft saved successfully!');
    }

    private sendInitialEmailNotification(apiPayload: any, response: any, fallbackId: string | number | null = null): void {
        const created = this.unwrapApiResponse(response);
        const requisitionId = this.getRequisitionIdFromResponse(response, fallbackId);
        const notificationSource = {
            ...apiPayload,
            ...(created || {}),
            id: requisitionId
        };

        this.purchaseRequisitionNotificationService
            .notifyInitialAction(notificationSource, requisitionId)
            .subscribe({
                error: (error) => {
                    console.error('Failed to send purchase requisition email notification:', error);
                    this.toastr.warning('Purchase Requisition was saved, but email notification could not be sent.');
                }
            });
    }

    private getRequisitionIdFromResponse(response: any, fallbackId: string | number | null = null): string | number | null {
        const created = this.unwrapApiResponse(response);
        return created?.id ?? (response as any)?.id ?? fallbackId;
    }

    private unwrapApiResponse(response: any): any {
        if (response?.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
            return response.data;
        }

        return response;
    }

    private markFormGroupTouched(): void {
        Object.keys(this.form.controls).forEach(key => {
            const control = this.form.get(key);
            control?.markAsTouched();

            if (control instanceof FormArray) {
                control.controls.forEach(item => {
                    if (item instanceof FormGroup) {
                        Object.keys(item.controls).forEach(itemKey => {
                            item.get(itemKey)?.markAsTouched();
                        });
                    }
                });
            }
        });
    }

    private clearFormValidationState(): void {
        this.markControlClean(this.form);
    }

    private markControlClean(control: AbstractControl): void {
        control.markAsPristine({ onlySelf: true });
        control.markAsUntouched({ onlySelf: true });

        if (control instanceof FormGroup || control instanceof FormArray) {
            Object.values(control.controls).forEach((childControl) => {
                this.markControlClean(childControl);
            });
        }
    }

    isFieldInvalid(fieldName: string): boolean {
        if (this.suppressValidationErrors) {
            return false;
        }

        const field = this.form.get(fieldName);
        return !!(field && field.invalid && (field.dirty || field.touched));
    }

    getErrorMessage(fieldName: string): string {
        const field = this.form.get(fieldName);
        if (field?.hasError('required')) {
            return `${this.getFieldLabel(fieldName)} is required`;
        }
        if (fieldName === 'subject' && field?.hasError('pattern')) {
            return 'Subject is required';
        }
        if (fieldName === 'subject' && field?.hasError('trimmedMinLength')) {
            return 'Subject must be more than 5 characters';
        }
        if (field?.hasError('min')) {
            return `${this.getFieldLabel(fieldName)} must be greater than 0`;
        }
        if (field?.hasError('minlength')) {
            return `${this.getFieldLabel(fieldName)} must be at least 10 characters`;
        }
        if (field?.hasError('duplicateApprover')) {
            return `${this.getFieldLabel(fieldName)} must be different from Approved By`;
        }
        return '';
    }

    private getFieldLabel(fieldName: string): string {
        const labels: { [key: string]: string } = {
            to: 'To',
            subject: 'Subject',
            requestedBy: 'Requested By',
            currency: 'Currency',
            date: 'Date',
            reasonsForPurchase: 'Reasons for Purchase',
            deadline: 'Deadline',
            receivedFrom: 'Received From',
            verifiedBy: 'Verified By',
            approvedBy: 'Approved By',
            approvedBy2: 'Approved By 2',
            acknowledgedBy: 'Acknowledged',
            actionByAdmin: 'Action By Admin'
        };
        return labels[fieldName] || fieldName;
    }

    private getMissingRequiredFieldLabels(): string[] {
        const fieldLabels: Record<string, string> = {
            to: 'To',
            subject: 'Subject',
            requestedBy: 'Requested By',
            currency: 'Currency',
            reasonsForPurchase: 'Reasons for Purchase',
            date: 'Date',
            verifiedBy: 'Verified By (MD/DI/AD/TL)',
            approvedBy: 'Approved By',
            approvedBy2: 'Approved By 2',
            acknowledgedBy: 'Acknowledged',
            actionByAdmin: 'Action By (Admin)'
        };

        return Object.entries(fieldLabels)
            .filter(([controlName]) => {
                const control = this.form.get(controlName);
                return control?.hasError('required')
                    || (controlName === 'subject' && control?.hasError('pattern'));
            })
            .map(([_, label]) => label);
    }

    private getMissingSubmitFieldLabels(): string[] {
        return [
            ...this.getMissingRequiredFieldLabels(),
            ...this.getMissingItemRequiredFieldLabels()
        ];
    }

    private getMissingItemRequiredFieldLabels(): string[] {
        const missingLabels: string[] = [];

        this.itemsFormArray.controls.forEach((group, index) => {
            const itemPrefix = `Item ${index + 1}`;

            if (group.get('description')?.invalid) {
                missingLabels.push(`${itemPrefix} Description`);
            }

            if (group.get('quantity')?.invalid) {
                missingLabels.push(`${itemPrefix} Quantity`);
            }

            if (group.get('unitPrice')?.invalid) {
                missingLabels.push(`${itemPrefix} Unit Price`);
            }
        });

        return missingLabels;
    }

    private scrollToFirstInvalidControl(): void {
        const firstInvalidName = Object.keys(this.form.controls).find(
            (name) => this.form.get(name)?.invalid
        );
        if (!firstInvalidName) return;

        const selector = `[formControlName="${firstInvalidName}"], #control-${firstInvalidName}`;
        const target = document.querySelector(selector) as HTMLElement | null;
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.focus?.();
        }
    }

    onCancel(): void {
        this.router.navigate(['/purchase-requisition']);
    }

    getSubTotal(): number {
        return this.toNumericValue(this.form.get('subTotal')?.value);
    }

    getDiscount(): number {
        return Math.max(0, this.toNumericValue(this.form.get('discount')?.value));
    }

    getVatAmount(): number {
        return this.toNumericValue(this.form.get('vatValue')?.value);
    }

    getGrandTotal(): number {
        return this.toNumericValue(this.form.get('grandTotal')?.value);
    }

    private roundToCurrency(value: number): number {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    private toNumericValue(value: unknown, fallback = 0): number {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : fallback;
    }

    private isItemPayloadEmpty(item: {
        item?: string;
        description?: string;
        unit_price?: number;
        amount?: number;
    }): boolean {
        const unitPrice = Number(item.unit_price);
        const amount = Number(item.amount);

        return String(item.item ?? '').trim() === '' &&
            String(item.description ?? '').trim() === '' &&
            (unitPrice === 0 || !Number.isFinite(unitPrice)) &&
            (amount === 0 || !Number.isFinite(amount));
    }

    private toBooleanFlag(value: unknown): boolean {
        return value === 1 || value === '1' || value === true;
    }

    private toNeedAssetCodeRegistrationFormValue(value: unknown): 'yes' | 'no' | '' {
        if (value === 1 || value === '1' || value === true) {
            return 'yes';
        }

        if (value === 0 || value === '0' || value === false) {
            return 'no';
        }

        return '';
    }

    private toNeedAssetCodeRegistrationPayload(value: unknown): 1 | 0 | null {
        if (value === 'yes' || value === 1 || value === '1' || value === true) {
            return 1;
        }

        if (value === 'no' || value === 0 || value === '0' || value === false) {
            return 0;
        }

        return null;
    }

    /** Coerce value to number for currency pipe (avoids InvalidPipeArgument) */
    toAmountNumber(value: unknown): number {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    // Documents management
    get documentsFormGroup(): FormGroup {
        return this.form.get('documents') as FormGroup;
    }

    get attachmentsArray(): FormArray {
        return this.documentsFormGroup.get('attachments') as FormArray;
    }

    openUploadDialog(): void {
        const ref = this.dialog.open(FuseUploadDialogComponent, {
            width: '560px',
            data: {
                allowedExtensions: ['pdf'],
                accept: 'application/pdf,.pdf',
                allowLinks: false
            }
        });

        ref.afterClosed().subscribe((result) => {
            if (!result) return;

            // Handle both single result and array of results
            const results = Array.isArray(result) ? result : [result];

            results.forEach((item: any) => {
                const attachmentGroup = this.fb.group({
                    id: [item.id || null],
                    file_name: [item.file_name || item.name || ''],
                    file_path: [item.file_path || ''],
                    file_url: [item.file_url || item.url || ''],
                    file_size: [item.file_size || (item.file ? item.file.size : 0)],
                    mime_type: [item.mime_type || (item.file ? item.file.type : '')],
                    description: [item.description || ''],
                    uploaded_at: [item.uploaded_at || new Date()],
                    type: [item.type || 'file'],
                    file: [item.file || null]
                });

                this.attachmentsArray.push(attachmentGroup);
            });
        });
    }

    removeAttachment(index: number): void {
        this.attachmentsArray.removeAt(index);
    }

    private ensurePdfOnlyAttachments(): boolean {
        const invalidAttachment = (this.attachmentsArray?.value || []).find((attachment: any) => {
            const path = String(
                attachment?.file_path ||
                attachment?.file_url ||
                attachment?.url ||
                attachment?.file_name ||
                attachment?.name ||
                ''
            ).trim();

            return !/\.pdf(?:$|[?#])/i.test(path);
        });

        if (invalidAttachment) {
            const name = invalidAttachment.file_name || invalidAttachment.file_path || 'selected attachment';
            this.toastr.error(`Purchase Requisition attachments must be PDF files only: ${name}`);
            return false;
        }

        return true;
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

    getStepNumber(stepKey: string): number {
        let num = 1;
        if (stepKey === 'requested') return num;
        num++;

        const isNotIT = this.form.get('notITEquipment')?.value;
        if (!isNotIT) {
            if (stepKey === 'verifiedIS') return num;
            num++;
        }

        if (stepKey === 'verified') return num;
        num++;

        if (stepKey === 'approved') return num;
        num++;

        if (this.requiresSecondApprover()) {
            if (stepKey === 'approved2') return num;
            num++;
        }

        if (stepKey === 'acknowledged') return num;
        num++;

        if (stepKey === 'actionByAdmin') return num;
        
        return num;
    }
}
