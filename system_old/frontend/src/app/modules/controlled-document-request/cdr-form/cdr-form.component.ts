import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
    FormArray,
    FormBuilder,
    FormControl,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { AuthService } from 'app/core/services/auth.service';
import { CommitteesService } from 'app/core/services/committees.service';
import { ControlledDocumentRequestService } from 'app/core/services/controlled-document-request.service';
import {
    EmployeeOption,
    EmployeeService,
} from 'app/core/services/employee.service';
import {
    CONTROLLED_DOCUMENT_REQUEST_EMAIL_CONFIG,
    WorkflowEmailNotificationService,
} from 'app/core/services/workflow-email-notification.service';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, of, Subject, takeUntil } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import {
    addCalendarDays,
    atLeastOneCdrRequestForValidator,
    exactlyOneCdrCategoryValidator,
} from './cdr-form.validation';

@Component({
    selector: 'app-cdr-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        MatCheckboxModule,
        MatRadioModule,
        MatSelectModule,
        MatIconModule,
        MatDividerModule,
        MatDatepickerModule,
        MatDialogModule,
        NgxMatSelectSearchModule,
        MatProgressSpinnerModule,
    ],
    templateUrl: './cdr-form.component.html',
    styleUrls: ['./cdr-form.component.scss'],
})
export class CdrFormComponent implements OnInit, OnDestroy {
    form: FormGroup;
    readonly today = this.startOfToday();
    minimumEffectiveDate = addCalendarDays(this.today, 3);
    readonly nextNumber = this.defaultNextNumber(this.today);

    users: EmployeeOption[] = [];
    isLoading = false;
    isSubmitting = false;
    isEditMode = false;
    currentRequestId: string | null = null;
    loadedRequestData: any = null;

    // Filtered users for each select
    filteredRequestedUsers: EmployeeOption[] = [];
    filteredReviewedUsers: EmployeeOption[] = [];
    filteredApprovedUsers: EmployeeOption[] = [];
    filteredActionUsers: EmployeeOption[] = [];
    private approvedCommitteeUsers: EmployeeOption[] = [];
    private actionCommitteeUsers: EmployeeOption[] = [];

    // Search controls
    reviewedSearchCtrl = new FormControl('');
    approvedSearchCtrl = new FormControl('');
    actionSearchCtrl = new FormControl('');

    // Cache for all loaded employees to support autocomplete persistence
    allLoadedEmployees: Map<string, EmployeeOption> = new Map();

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private fb: FormBuilder,
        private dialog: MatDialog,
        private employeeService: EmployeeService,
        private committeesService: CommitteesService,
        private cdrService: ControlledDocumentRequestService,
        private authService: AuthService,
        private router: Router,
        private route: ActivatedRoute,
        private workflowEmailNotificationService: WorkflowEmailNotificationService,
        private fuseConfirmationService: FuseConfirmationService,
        private toastr: ToastrService
    ) {
        this.form = this.fb.group({
            to: ['', Validators.required],
            from: ['', Validators.required],
            date: [new Date(), Validators.required],
            cdrNo: [this.nextNumber],
            categories: this.fb.group(
                {
                    ims: [false],
                    acp: [false],
                    masterTechSpecs: [false],
                    antiCorruption: [false],
                    other: [false],
                    otherText: [''],
                },
                { validators: exactlyOneCdrCategoryValidator }
            ),

            // PART 1
            requestFor: this.fb.group(
                {
                    addition: [false],
                    amendment: [false],
                    deletion: [false],
                    copy: [false],
                },
                { validators: atLeastOneCdrRequestForValidator }
            ),
            documentName: ['', Validators.required],
            currentRevision: ['', Validators.required],
            reasonDescription: ['', Validators.required],
            effectiveDatePurpose: [
                this.minimumEffectiveDate,
                Validators.required,
            ],
            attachDocumentNote: [''],
            attachments: this.fb.array([], Validators.required),
            // requestedBy: [''],
            requestedBy: [null, Validators.required],

            requestedDate: [this.today],
            // PART 2
            reviewComments: [''],
            reviewSignedBy: [null, Validators.required],
            reviewSignedDate: [null],
            // PART 3
            approval: ['approved'], // 'approved' | 'notApproved'
            approvalComments: [''],
            approvalSignedBy: [null, Validators.required],
            approvalDate: [null],

            // PART 4
            actionBy: [null, Validators.required],
            actionDate: [null],
        });
    }

    ngOnInit(): void {
        this.loadUsers();
        this.setupSearchFilters();
        this.loadNextCdrNo();
        this.checkEditMode();
        this.configureOtherCategoryValidation();

        this.form
            .get('date')
            ?.valueChanges.pipe(
                debounceTime(150),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe(() => {
                this.loadNextCdrNo();
                this.minimumEffectiveDate = addCalendarDays(
                    this.normalizedDate(this.form.get('date')?.value),
                    3
                );
                if (!this.isEditMode) {
                    this.form.patchValue(
                        {
                            effectiveDatePurpose: this.minimumEffectiveDate,
                        },
                        { emitEvent: false }
                    );
                }
            });

        // Auto-fill "From" based on Requested by selection
        this.form
            .get('requestedBy')
            ?.valueChanges.pipe(takeUntil(this._unsubscribeAll))
            .subscribe((code: string | null) => {
                this.syncFromWithRequestedBy(code);
            });

        // Auto-fill "To" based on Signed by (IMR/DI/MD) selection
        this.form
            .get('approvalSignedBy')
            ?.valueChanges.pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => {
                this.syncToWithRecipients();
            });

        this.form
            .get('reviewSignedBy')
            ?.valueChanges.pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => {
                this.syncToWithRecipients();
            });

        this.form
            .get('actionBy')
            ?.valueChanges.pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => {
                this.syncToWithRecipients();
            });
    }

    private waitForUsersAndLoadRequest(id: string): void {
        // รอให้ users โหลดเสร็จก่อน แล้วค่อย load request
        if (this.users.length > 0) {
            this.loadRequest(id);
        } else {
            // ถ้ายังไม่มี users ให้รอสักครู่แล้วลองใหม่
            setTimeout(() => {
                if (this.users.length > 0) {
                    this.loadRequest(id);
                } else {
                    // ถ้ายังไม่มี users ให้ load request ไปก่อน (อาจจะไม่มี users ใน dropdown)
                    this.loadRequest(id);
                }
            }, 500);
        }
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

        const exists = newResults.some(
            (u) => u.id === selectedId || u.code === selectedId
        );
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

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    private loadUsers(): void {
        forkJoin({
            employees: this.employeeService.getEmployeeOptions(),
            approvedCommitteeUsers:
                this.committeesService.getEmployeeOptionsByName('IMR/DI/MD'),
            actionCommitteeUsers:
                this.committeesService.getEmployeeOptionsByName('IMS/ADM'),
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: ({
                    employees,
                    approvedCommitteeUsers,
                    actionCommitteeUsers,
                }) => {
                    this.approvedCommitteeUsers = approvedCommitteeUsers;
                    this.actionCommitteeUsers = actionCommitteeUsers;
                    this.users = this.mergeEmployeeOptions(
                        employees,
                        approvedCommitteeUsers,
                        actionCommitteeUsers
                    );
                    this.employeeService.rememberEmployeeOptions(this.users);

                    // Populate cache
                    this.users.forEach((u) => {
                        if (u.id) this.allLoadedEmployees.set(String(u.id), u);
                        if (u.code) this.allLoadedEmployees.set(u.code, u);
                        if (u.employeeId != null) {
                            this.allLoadedEmployees.set(
                                String(u.employeeId),
                                u
                            );
                        }
                    });

                    // Initialize filtered arrays - แสดงทั้งหมดไม่ filter
                    this.filteredRequestedUsers = employees;
                    this.filteredReviewedUsers = employees;
                    this.filteredApprovedUsers = approvedCommitteeUsers;
                    this.filteredActionUsers = actionCommitteeUsers;

                    const routeId = this.route.snapshot.paramMap.get('id');
                    if (!routeId || routeId === 'new') {
                        this.assignCurrentUserAsRequester();
                    }

                    this.syncFromWithRequestedBy(
                        this.form.get('requestedBy')?.value
                    );
                    this.syncToWithRecipients();
                },
                error: (error) => {
                    console.error('Error loading CDR users:', error);
                },
            });
    }

    private setupSearchFilters(): void {
        // Requested By search - ใช้ API search
        // Reviewed By search - ใช้ API search
        this.reviewedSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    return this.employeeService.getEmployeeOptions(
                        searchTerm,
                        50
                    );
                }),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((employees) => {
                // Update cache
                employees.forEach((u) => {
                    if (u.id) this.allLoadedEmployees.set(String(u.id), u);
                    if (u.code) this.allLoadedEmployees.set(u.code, u);
                });

                this.updateFilteredUsers(
                    employees,
                    this.form.get('reviewSignedBy')?.value,
                    (val) => (this.filteredReviewedUsers = val)
                );
            });

        // Approved By search - ใช้ API search
        this.approvedSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    return of(
                        this.employeeService.searchEmployees(
                            searchTerm,
                            this.approvedCommitteeUsers
                        )
                    );
                }),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((employees) => {
                // Update cache
                employees.forEach((u) => {
                    if (u.id) this.allLoadedEmployees.set(String(u.id), u);
                    if (u.code) this.allLoadedEmployees.set(u.code, u);
                });

                this.updateFilteredUsers(
                    employees,
                    this.form.get('approvalSignedBy')?.value,
                    (val) => (this.filteredApprovedUsers = val)
                );
            });

        // Action By search - ใช้ API search
        this.actionSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    return of(
                        this.employeeService.searchEmployees(
                            searchTerm,
                            this.actionCommitteeUsers
                        )
                    );
                }),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((employees) => {
                // Update cache
                employees.forEach((u) => {
                    if (u.id) this.allLoadedEmployees.set(String(u.id), u);
                    if (u.code) this.allLoadedEmployees.set(u.code, u);
                });

                this.updateFilteredUsers(
                    employees,
                    this.form.get('actionBy')?.value,
                    (val) => (this.filteredActionUsers = val)
                );
            });
    }

    private loadNextCdrNo(): void {
        const routeId = this.route.snapshot.paramMap.get('id');
        if (routeId && routeId !== 'new') {
            return;
        }

        const documentDate = this.form.get('date')?.value;

        this.cdrService
            .getNextNumber(documentDate)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (nextNumber) => {
                    this.form.patchValue(
                        { cdrNo: nextNumber },
                        { emitEvent: false }
                    );
                },
                error: () => {
                    this.form.patchValue(
                        { cdrNo: this.defaultNextNumber(documentDate) },
                        { emitEvent: false }
                    );
                },
            });
    }

    private defaultNextNumber(date: Date | string | null | undefined): string {
        const year = this.yearFromDate(date);
        const sequence = year === 2026 ? 3 : 1;

        return `${String(sequence).padStart(3, '0')}/${year}`;
    }

    private yearFromDate(date: Date | string | null | undefined): number {
        if (date instanceof Date && !isNaN(date.getTime())) {
            return date.getFullYear();
        }

        const value = String(date || '').trim();
        if (/^\d{4}$/.test(value)) {
            return Number(value);
        }

        const parsed = value ? new Date(value) : new Date();
        if (!isNaN(parsed.getTime())) {
            return parsed.getFullYear();
        }

        return new Date().getFullYear();
    }

    // ⬇️ วางไว้ท้ายคลาสก็ได้
    private startOfToday(): Date {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }

    private findEmployeeCodeByCurrentUser(): string | null {
        const currentUser = this.authService.currentUserValue;
        if (!currentUser?.email || !this.users.length) {
            return null;
        }

        const match = this.users.find(
            (user) =>
                (user.email || '').toLowerCase() ===
                currentUser.email!.toLowerCase()
        );
        return match ? match.code : null;
    }

    private assignCurrentUserAsRequester(): void {
        const reference =
            getCurrentUserCode() ?? this.findEmployeeCodeByCurrentUser();
        if (!reference) {
            return;
        }

        this.employeeService
            .getEmployeeOptionByReference(reference)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((option) => {
                if (option) {
                    this.users = this.mergeEmployeeOptions(this.users, [
                        option,
                    ]);
                    this.employeeService.rememberEmployeeOptions([option]);
                    this.cacheEmployeeOptions([option]);
                }

                const requesterCode = option?.code || String(reference);
                this.form.patchValue({ requestedBy: requesterCode });
                this.syncFromWithRequestedBy(requesterCode);
            });
    }

    private cacheEmployeeOptions(options: EmployeeOption[]): void {
        options.forEach((option) => {
            if (option.id) {
                this.allLoadedEmployees.set(String(option.id), option);
            }
            if (option.code) {
                this.allLoadedEmployees.set(option.code, option);
            }
            if (option.employeeId != null) {
                this.allLoadedEmployees.set(String(option.employeeId), option);
            }
        });
    }

    private mergeEmployeeOptions(
        ...groups: EmployeeOption[][]
    ): EmployeeOption[] {
        const merged = new Map<string, EmployeeOption>();
        groups.flat().forEach((option) => {
            const key = String(
                option?.code || option?.id || option?.employeeId || ''
            ).trim();
            if (key && !merged.has(key)) {
                merged.set(key, option);
            }
        });
        return Array.from(merged.values());
    }

    private configureOtherCategoryValidation(): void {
        const otherControl = this.form.get('categories.other');
        const otherTextControl = this.form.get('categories.otherText');
        otherControl?.valueChanges
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((selected) => {
                if (selected === true) {
                    otherTextControl?.setValidators([Validators.required]);
                } else {
                    otherTextControl?.clearValidators();
                    otherTextControl?.setValue('', { emitEvent: false });
                }
                otherTextControl?.updateValueAndValidity({ emitEvent: false });
            });
    }

    onCategoryChange(selectedControl: string, checked: boolean): void {
        if (!checked) {
            return;
        }

        const categories = this.form.get('categories') as FormGroup;
        ['ims', 'acp', 'masterTechSpecs', 'antiCorruption', 'other']
            .filter((controlName) => controlName !== selectedControl)
            .forEach((controlName) => {
                categories.get(controlName)?.setValue(false, {
                    emitEvent: controlName === 'other',
                });
            });
    }

    get requestedByDisplayLabel(): string {
        const reference = this.form.get('requestedBy')?.value;
        return reference ? this.resolveEmployeeDisplayLabel(reference) : '';
    }

    private normalizedDate(value: Date | string | null | undefined): Date {
        const parsed =
            value instanceof Date ? new Date(value) : new Date(value || '');
        if (isNaN(parsed.getTime())) {
            return this.startOfToday();
        }
        parsed.setHours(0, 0, 0, 0);
        return parsed;
    }

    private syncFromWithRequestedBy(
        requestedBy: string | null | undefined
    ): void {
        if (!requestedBy) {
            this.form.patchValue({ from: '' }, { emitEvent: false });
            return;
        }

        this.form.patchValue(
            { from: this.resolveEmployeeDisplayLabel(requestedBy) },
            { emitEvent: false }
        );
    }

    private resolveEmployeeDisplayLabel(reference: string | number): string {
        const normalizedReference = String(reference).trim();
        const user =
            this.allLoadedEmployees.get(normalizedReference) ||
            this.users.find((option) =>
                [option.code, option.id, option.employeeId]
                    .map((value) => String(value ?? '').trim())
                    .includes(normalizedReference)
            );

        return user?.displayLabel || normalizedReference;
    }

    private syncToWithRecipients(): void {
        const recipients = [
            this.form.get('reviewSignedBy')?.value,
            this.form.get('approvalSignedBy')?.value,
            this.form.get('actionBy')?.value,
        ]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .map((reference) => this.resolveEmployeeDisplayLabel(reference));

        if (!recipients.length) {
            this.form.patchValue({ to: '' }, { emitEvent: false });
            return;
        }

        this.form.patchValue(
            { to: recipients.join(',') },
            { emitEvent: false }
        );
    }

    get attachmentsArray(): FormArray {
        return this.form.get('attachments') as FormArray;
    }

    openUploadDialog(): void {
        const ref = this.dialog.open(FuseUploadDialogComponent, {
            width: '560px',
            data: { uploadPath: 'uploads/files/', original: 'Y' as const },
        });

        ref.afterClosed().subscribe((result) => {
            if (!result) return;

            const results = Array.isArray(result) ? result : [result];

            results.forEach((item: any) => {
                const group = this.fb.group({
                    type: [item.type],
                    name: [item.name || item.file_name || ''],
                    url: [item.url || item.file_url || ''],
                    file: [item.file || null],
                    file_path: [item.file_path || ''],
                });
                this.attachmentsArray.push(group);
            });
        });
    }

    removeAttachment(index: number): void {
        this.attachmentsArray.removeAt(index);
    }

    private checkEditMode(): void {
        this.route.paramMap
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((params) => {
                const id = params.get('id');
                if (id && id !== 'new') {
                    this.isEditMode = true;
                    this.currentRequestId = id;
                    this.waitForUsersAndLoadRequest(id);
                }
            });
    }

    private loadRequest(id: string): void {
        this.isLoading = true;
        this.cdrService
            .findOne(id)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (response: any) => {
                    // Handle both response formats: { status, data } or direct data
                    let data: any;
                    if (response.status !== undefined && response.data) {
                        // API returns { code, status, message, data }
                        data = response.data;
                    } else if (response.id) {
                        // API returns data directly
                        data = response;
                    } else {
                        console.error('Unexpected response format:', response);
                        this.toastr.error(
                            'Unexpected response format from server.'
                        );
                        this.isLoading = false;
                        return;
                    }

                    this.loadedRequestData = data;

                    // Parse categories (comma-separated string to checkboxes)
                    const categories = (data.categories || '')
                        .split(',')
                        .map((c: string) => c.trim())
                        .filter((c: string) => c.length > 0);
                    const categoriesGroup = {
                        ims: categories.includes('ims'),
                        acp: categories.includes('acp'),
                        masterTechSpecs:
                            categories.includes('master_tech_specs'),
                        antiCorruption: categories.includes('anti_corruption'),
                        other: categories.some(
                            (c: string) =>
                                ![
                                    'ims',
                                    'acp',
                                    'master_tech_specs',
                                    'anti_corruption',
                                ].includes(c)
                        ),
                        otherText:
                            categories.find(
                                (c: string) =>
                                    ![
                                        'ims',
                                        'acp',
                                        'master_tech_specs',
                                        'anti_corruption',
                                    ].includes(c)
                            ) || '',
                    };

                    // Parse requestFor (comma-separated string to checkboxes)
                    const requestFor = (data.request_for || '')
                        .split(',')
                        .map((r: string) => r.trim())
                        .filter((r: string) => r.length > 0);
                    const requestForGroup = {
                        addition: requestFor.includes('addition'),
                        amendment: requestFor.includes('amendment'),
                        deletion: requestFor.includes('deletion'),
                        copy: requestFor.includes('copy'),
                    };

                    // Parse dates
                    const parseDate = (
                        dateStr: string | null | undefined
                    ): Date | null => {
                        if (!dateStr || dateStr === 'null' || dateStr === null)
                            return null;
                        try {
                            const date = new Date(dateStr);
                            if (isNaN(date.getTime())) return null;
                            date.setHours(0, 0, 0, 0);
                            return date;
                        } catch {
                            return null;
                        }
                    };

                    // Patch form with data
                    const formData: any = {
                        to: data.to || '',
                        from: data.from || '',
                        date: parseDate(data.date) || new Date(),
                        cdrNo: data.cdr_no || '',
                        categories: categoriesGroup,
                        requestFor: requestForGroup,
                        documentName: data.document_name || '',
                        currentRevision: data.current_revision || '',
                        reasonDescription: data.reason_description || '',
                        effectiveDatePurpose: parseDate(
                            data.effective_date_purpose
                        ),
                        attachDocumentNote: data.attach_document_note || '',
                        requestedBy: data.requested_by || '',
                        requestedDate:
                            parseDate(data.requested_date) || this.today,
                        reviewComments: data.review_comments || '',
                        reviewSignedBy: data.reviewed_by || '',
                        reviewSignedDate: parseDate(data.reviewed_by_date),
                        approvalComments: data.approval_comments || '',
                        approvalSignedBy: data.approved_by || '',
                        approvalDate: parseDate(data.approved_by_date),
                        newRevision: data.new_revision || '',
                        actionEffectiveDate: parseDate(
                            data.action_effective_date
                        ),
                        actionBy: data.acknowledged_by || '',
                        actionDate: parseDate(data.acknowledged_by_date),
                    };

                    this.form.patchValue(formData);
                    this.ensureSelectedWorkflowOptions(data);
                    this.syncFromWithRequestedBy(formData.requestedBy);
                    this.syncToWithRecipients();

                    if (
                        Array.isArray(data.attachments) &&
                        data.attachments.length > 0
                    ) {
                        const arr = this.attachmentsArray;
                        arr.clear();
                        data.attachments.forEach((path: string) => {
                            const name = path.split('/').pop() || path;
                            arr.push(
                                this.fb.group({
                                    type: ['file'],
                                    name: [name],
                                    url: [''],
                                    file: [null],
                                    file_path: [path],
                                })
                            );
                        });
                    }

                    this.isLoading = false;
                },
                error: (error) => {
                    console.error('Error loading request:', error);
                    this.toastr.error(
                        error?.error?.message ||
                            'Failed to load request. Please try again.'
                    );
                    this.isLoading = false;
                },
            });
    }

    private formatDate(date: Date | string): string {
        if (!date) return '';
        let dateObj: Date;
        if (typeof date === 'string') {
            dateObj = new Date(date);
        } else {
            dateObj = new Date(date.getTime());
        }
        if (isNaN(dateObj.getTime())) return '';
        dateObj.setHours(0, 0, 0, 0);
        const year = dateObj.getFullYear();
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const day = dateObj.getDate().toString().padStart(2, '0');
        const hours = dateObj.getHours().toString().padStart(2, '0');
        const minutes = dateObj.getMinutes().toString().padStart(2, '0');
        const seconds = dateObj.getSeconds().toString().padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    private ensureSelectedWorkflowOptions(data: any): void {
        const selections = [
            { ref: data.requested_by, control: 'requestedBy', list: 'requested' },
            { ref: data.reviewed_by, control: 'reviewSignedBy', list: 'reviewed' },
            { ref: data.approved_by, control: 'approvalSignedBy', list: 'approved' },
            { ref: data.acknowledged_by, control: 'actionBy', list: 'action' },
        ].filter((selection) => String(selection.ref ?? '').trim() !== '');
        if (selections.length === 0) return;

        forkJoin(selections.map((selection) => this.employeeService.getEmployeeOptionByReference(selection.ref)))
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((options) => {
                const found = options.filter((option): option is EmployeeOption => !!option);
                if (found.length === 0) return;
                this.users = this.mergeEmployeeOptions(this.users, found);
                this.employeeService.rememberEmployeeOptions(found);
                this.cacheEmployeeOptions(found);

                options.forEach((option, index) => {
                    if (!option?.code) return;
                    const selection = selections[index];
                    this.form.get(selection.control)?.setValue(option.code, { emitEvent: false });
                    if (selection.list === 'requested') {
                        this.filteredRequestedUsers = this.mergeEmployeeOptions(this.filteredRequestedUsers, [option]);
                        this.syncFromWithRequestedBy(option.code);
                    } else if (selection.list === 'reviewed') {
                        this.filteredReviewedUsers = this.mergeEmployeeOptions(this.filteredReviewedUsers, [option]);
                    } else if (selection.list === 'approved') {
                        this.filteredApprovedUsers = this.mergeEmployeeOptions(this.filteredApprovedUsers, [option]);
                    } else {
                        this.filteredActionUsers = this.mergeEmployeeOptions(this.filteredActionUsers, [option]);
                    }
                });
            });
    }

    onSubmit(): void {
        if (this.isSubmitting) return;

        if (this.form.invalid) {
            this.form.markAllAsTouched();
            this.toastr.error('Please fill in all required fields correctly.');
            return;
        }

        const confirmation = this.fuseConfirmationService.open({
            title: this.isEditMode ? 'Confirm update' : 'Confirm submit',
            message: this.isEditMode
                ? 'Are you sure you want to update this request?'
                : 'Are you sure you want to submit this request?',
            icon: {
                show: true,
                name: 'heroicons_outline:question-mark-circle',
                color: 'primary',
            },
            actions: {
                cancel: { show: true, label: 'Cancel' },
                confirm: {
                    show: true,
                    label: this.isEditMode ? 'Update' : 'Submit',
                    color: 'primary',
                },
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

        const formData = this.form.value;

        // Build categories array
        const categories: string[] = [];
        if (formData.categories.ims) categories.push('ims');
        if (formData.categories.acp) categories.push('acp');
        if (formData.categories.masterTechSpecs)
            categories.push('master_tech_specs');
        if (formData.categories.antiCorruption)
            categories.push('anti_corruption');
        if (formData.categories.other && formData.categories.otherText)
            categories.push(formData.categories.otherText);

        // Build requestFor array
        const requestFor: string[] = [];
        if (formData.requestFor.addition) requestFor.push('addition');
        if (formData.requestFor.amendment) requestFor.push('amendment');
        if (formData.requestFor.deletion) requestFor.push('deletion');
        if (formData.requestFor.copy) requestFor.push('copy');

        // Transform to API payload format
        // สำหรับ comment: ถ้าเป็น create และ comment ว่าง ให้ส่งเป็น "-"
        const reviewCommentsValue = formData.reviewComments?.trim() || '';
        const approvalCommentsValue = formData.approvalComments?.trim() || '';

        const attachmentsPaths = (this.attachmentsArray?.value || [])
            .map((a: { file_path?: string }) => a?.file_path)
            .filter((p: string | undefined): p is string => !!p)
            .map((p: string) => (p.startsWith('/') ? p : `/${p}`));
        const apiPayload: any = {
            to: formData.to || '',
            from: formData.from || '',
            date: this.formatDate(formData.date),
            cdr_no: formData.cdrNo || '',
            categories: categories.join(','),
            request_for: requestFor.join(','),
            document_name: formData.documentName || '',
            current_revision: formData.currentRevision || '',
            reason_description: formData.reasonDescription || '',
            effective_date_purpose: formData.effectiveDatePurpose
                ? this.formatDate(formData.effectiveDatePurpose)
                : null,
            attach_document_note: formData.attachDocumentNote || '',
            requested_by:
                formData.requestedBy && formData.requestedBy.trim() !== ''
                    ? formData.requestedBy
                    : null,
            requested_date: formData.requestedDate
                ? this.formatDate(formData.requestedDate)
                : null,
            review_comments: this.isEditMode
                ? reviewCommentsValue
                : reviewCommentsValue || '-',
            reviewed_by:
                formData.reviewSignedBy && formData.reviewSignedBy.trim() !== ''
                    ? formData.reviewSignedBy
                    : null,
            reviewed_by_status:
                formData.reviewSignedBy && formData.reviewSignedBy.trim() !== ''
                    ? this.isEditMode && this.loadedRequestData
                        ? formData.reviewSignedBy === this.loadedRequestData.reviewed_by
                            ? this.loadedRequestData.reviewed_by_status || 'pending'
                            : 'pending'
                        : 'pending'
                    : null,
            reviewed_by_date: this.isEditMode && this.loadedRequestData
                ? formData.reviewSignedBy === this.loadedRequestData.reviewed_by
                    ? this.loadedRequestData.reviewed_by_date || null
                    : null
                : null,
            approval_comments: this.isEditMode
                ? approvalCommentsValue
                : approvalCommentsValue || '-',
            approved_by:
                formData.approvalSignedBy &&
                formData.approvalSignedBy.trim() !== ''
                    ? formData.approvalSignedBy
                    : null,
            approved_by_status:
                formData.approvalSignedBy &&
                formData.approvalSignedBy.trim() !== ''
                    ? this.isEditMode && this.loadedRequestData
                        ? formData.approvalSignedBy === this.loadedRequestData.approved_by
                            ? this.loadedRequestData.approved_by_status || 'pending'
                            : 'pending'
                        : 'pending'
                    : null,
            approved_by_date: this.isEditMode && this.loadedRequestData
                ? formData.approvalSignedBy === this.loadedRequestData.approved_by
                    ? this.loadedRequestData.approved_by_date || null
                    : null
                : null,
            new_revision:
                this.isEditMode && this.loadedRequestData
                    ? this.loadedRequestData.new_revision
                    : '',
            action_effective_date:
                this.isEditMode && this.loadedRequestData
                    ? this.loadedRequestData.action_effective_date
                    : null,
            acknowledged_by:
                formData.actionBy && formData.actionBy.trim() !== ''
                    ? formData.actionBy
                    : null,
            acknowledged_by_status_2:
                formData.actionBy && formData.actionBy.trim() !== ''
                    ? this.isEditMode && this.loadedRequestData
                        ? formData.actionBy === this.loadedRequestData.acknowledged_by
                            ? this.loadedRequestData.acknowledged_by_status_2 || 'pending'
                            : 'pending'
                        : 'pending'
                    : null,
            acknowledged_by_date: this.isEditMode && this.loadedRequestData
                ? formData.actionBy === this.loadedRequestData.acknowledged_by
                    ? this.loadedRequestData.acknowledged_by_date || null
                    : null
                : null,
            attachments: attachmentsPaths,
        };

        if (this.isEditMode && this.currentRequestId) {
            this.cdrService
                .update(this.currentRequestId, apiPayload)
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: () => {
                        this.isSubmitting = false;
                        this.toastr.success('Request updated successfully!');
                        setTimeout(() => {
                            this.router.navigate([
                                '/controlled-document-request/list',
                            ]);
                        }, 1500);
                    },
                    error: (error) => {
                        this.isSubmitting = false;
                        this.toastr.error(
                            error?.error?.message ||
                                'Failed to update request. Please try again.'
                        );
                    },
                });
        } else {
            this.cdrService
                .create(apiPayload)
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: (response) => {
                        this.isSubmitting = false;
                        this.toastr.success('Request created successfully!');
                        this.sendInitialEmailNotification(apiPayload, response);
                        setTimeout(() => {
                            this.router.navigate([
                                '/controlled-document-request/list',
                            ]);
                        }, 1500);
                    },
                    error: (error) => {
                        this.isSubmitting = false;
                        this.toastr.error(
                            error?.error?.message ||
                                'Failed to create request. Please try again.'
                        );
                    },
                });
        }
    }

    private sendInitialEmailNotification(apiPayload: any, response: any): void {
        const requestId =
            this.workflowEmailNotificationService.readResponseId(response);
        const notificationSource = {
            ...this.workflowEmailNotificationService.createNotificationSource(
                apiPayload,
                response
            ),
            id: requestId,
        };

        this.workflowEmailNotificationService
            .notifyInitialAction(
                CONTROLLED_DOCUMENT_REQUEST_EMAIL_CONFIG,
                notificationSource,
                requestId
            )
            .subscribe({
                error: (error) => {
                    console.error(
                        'Failed to send controlled document request email notification:',
                        error
                    );
                    this.toastr.warning(
                        'Request was saved, but email notification could not be sent.'
                    );
                },
            });
    }
}
