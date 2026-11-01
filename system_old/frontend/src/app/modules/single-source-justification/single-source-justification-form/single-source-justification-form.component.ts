import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import {
    FormBuilder,
    FormGroup,
    FormsModule,
    ReactiveFormsModule,
    Validators,
    FormArray,
    FormControl,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { HttpClient } from '@angular/common/http';
import { ApiConfig } from 'app/core/config/api.config';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { ApiService } from 'app/core/services/api.service';
import { SINGLE_SOURCE_JUSTIFICATION_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';

export interface SingleSourceJustification {
    id?: string;
    subConsultantSupplierName: string;
    itemsSupplied: string;
    justificationType: 'single-source' | 'price-justification';
    circumstances: string;
    alternativesConsidered: boolean;
    alternativesReason?: string;
    comments?: string;
    rationale: string;
    assessedBy?: {
        name: string;
        date: Date;
    };
    correspondingPO?: string;
    verifiedBy?: {
        name: string;
        date: Date;
        comments?: string;
        status?: string;
    };
    approvedBy?: {
        name: string;
        date: Date;
        comments?: string;
    };
    acknowledgedBy?: {
        name: string;
        date: Date;
        comments?: string;
    };
    status:
        | 'draft'
        | 'assessed'
        | 'verified'
        | 'approved'
        | 'acknowledged'
        | 'rejected';
    createdAt?: Date;
    updatedAt?: Date;
}

@Component({
    selector: 'app-single-source-justification-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatRadioModule,
        MatCheckboxModule,
        MatProgressSpinnerModule,
        MatCardModule,
        MatDividerModule,
        MatIconModule,
        MatDatepickerModule,
        MatDialogModule,
        NgxMatSelectSearchModule,
    ],
    templateUrl: './single-source-justification-form.component.html',
    styleUrls: ['./single-source-justification-form.component.scss'],
})
export class SingleSourceJustificationFormComponent implements OnInit, OnDestroy {
    form: FormGroup;
    isLoading = false;
    isSubmitting = false;
    isEditMode = false;
    currentId: string | null = null;

    // Cache for all loaded employees to support autocomplete persistence
    allLoadedEmployees: Map<string, EmployeeOption> = new Map();

    users: EmployeeOption[] = [];

    // Filtered users for each select
    filteredAssessedUsers: EmployeeOption[] = [];
    filteredVerifiedUsers: EmployeeOption[] = [];
    filteredApprovedUsers: EmployeeOption[] = [];
    filteredAcknowledgedUsers: EmployeeOption[] = [];

    // Search controls
    assessedSearchCtrl = new FormControl('');
    verifiedSearchCtrl = new FormControl('');
    approvedSearchCtrl = new FormControl('');
    acknowledgedSearchCtrl = new FormControl('');

    // Project types for Item(s) Supplied dropdown
    projectTypes: Array<{
        id: number;
        code: string;
        name: string;
        detail?: string;
        is_active: number;
    }> = [];

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute,
        private dialog: MatDialog,
        private http: HttpClient,
        private apiConfig: ApiConfig,
        private employeeService: EmployeeService,
        private apiService: ApiService,
        private workflowEmailNotificationService: WorkflowEmailNotificationService,
        private fuseConfirmationService: FuseConfirmationService,
        private toastr: ToastrService
    ) {
        this.form = this.createForm();
    }

    ngOnInit(): void {
        this.initializeForm();

        // Check if edit mode
        this.route.params.subscribe(params => {
            const id = params['id'];
            if (id) {
                this.currentId = id;
                this.isEditMode = this.route.snapshot.url.some(segment => segment.path === 'edit');
            }
        });

        // Load dropdown data
        this.loadProjectTypes();

        // Load users first, then load justification data if in edit mode
        this.loadUsers();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
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

                // Initialize filtered arrays
                this.filteredAssessedUsers = this.users;
                this.filteredVerifiedUsers = this.users;
                this.filteredApprovedUsers = this.users;
                this.filteredAcknowledgedUsers = this.users;

                // Setup search filters
                this.setupSearchFilters();

                // Load justification data if in edit mode (after users are loaded)
                if (this.isEditMode && this.currentId) {
                    this.loadJustification(this.currentId);
                }
            },
            error: (error) => {
                console.error('Error loading users:', error);
                this.toastr.error('Failed to load users. Please try again.');
            }
        });
    }

    /**
     * Load project types for Item(s) Supplied dropdown
     * GET /api/get_project_types and filter is_active = 1
     */
    private loadProjectTypes(): void {
        this.apiService.getProjectTypes().subscribe({
            next: (response) => {
                if (response?.status && Array.isArray(response.data)) {
                    this.projectTypes = response.data.filter(
                        (item: any) => item.is_active === 1
                    );
                } else {
                    this.projectTypes = [];
                }
            },
            error: (error) => {
                console.error('Error loading project types:', error);
                this.projectTypes = [];
            }
        });
    }

    /**
     * Setup search filters for each select
     */
    private setupSearchFilters(): void {
        // Assessed By search - ใช้ API search
        this.assessedSearchCtrl.valueChanges
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
                // Update cache
                employees.forEach(u => {
                    if (u.id) this.allLoadedEmployees.set(String(u.id), u);
                    if (u.code) this.allLoadedEmployees.set(u.code, u);
                });

                this.updateFilteredUsers(
                    employees,
                    this.form.get('assessedBy.id')?.value,
                    (val) => this.filteredAssessedUsers = val
                );
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
                employees.forEach(u => {
                    if (u.id) this.allLoadedEmployees.set(String(u.id), u);
                    if (u.code) this.allLoadedEmployees.set(u.code, u);
                });

                this.updateFilteredUsers(
                    employees,
                    this.form.get('verifiedBy.id')?.value,
                    (val) => this.filteredVerifiedUsers = val
                );
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
                // Update cache
                employees.forEach(u => {
                    if (u.id) this.allLoadedEmployees.set(String(u.id), u);
                    if (u.code) this.allLoadedEmployees.set(u.code, u);
                });

                this.updateFilteredUsers(
                    employees,
                    this.form.get('approvedBy.id')?.value,
                    (val) => this.filteredApprovedUsers = val
                );
            });

        // Acknowledged By search - ใช้ API search
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
                // Update cache
                employees.forEach(u => {
                    if (u.id) this.allLoadedEmployees.set(String(u.id), u);
                    if (u.code) this.allLoadedEmployees.set(u.code, u);
                });

                this.updateFilteredUsers(
                    employees,
                    this.form.get('acknowledgedBy.id')?.value,
                    (val) => this.filteredAcknowledgedUsers = val
                );
            });
    }

    private createForm(): FormGroup {
        return this.fb.group({
            subConsultantSupplierName: ['', [Validators.required]],
            itemsSupplied: ['', [Validators.required]],
            justificationType: ['', [Validators.required]],
            circumstances: ['', [Validators.required]],
            alternativesConsidered: [false],
            alternativesReason: [''],
            comments: [''],
            rationale: ['', [Validators.required]],
            assessedBy: this.fb.group({
                id: [''],
                date: [new Date()],
            }),
            correspondingPO: [''],
            verifiedBy: this.fb.group({
                id: ['', [Validators.required]],
                date: [new Date()],
                comments: [''],
            }),
            approvedBy: this.fb.group({
                id: ['', [Validators.required]],
                date: [new Date()],
                comments: [''],
            }),
            acknowledgedBy: this.fb.group({
                id: ['', [Validators.required]],
                date: [new Date()],
                comments: [''],
            }),
            // Documents
            documents: this.fb.group({
                attachments: this.fb.array([])
            }),
            status: ['draft'],
        });
    }

    private initializeForm(): void {
        // Set default values
        this.form.patchValue({
            status: 'draft',
        });

        // Watch for alternatives considered changes
        this.form
            .get('alternativesConsidered')
            ?.valueChanges.subscribe((value) => {
                if (value === false) {
                    this.form
                        .get('alternativesReason')
                        ?.setValidators([Validators.required]);
                } else {
                    this.form.get('alternativesReason')?.clearValidators();
                }
                this.form.get('alternativesReason')?.updateValueAndValidity();
            });
    }

    onJustificationTypeChange(
        type: 'single-source' | 'price-justification'
    ): void {
        this.form.patchValue({ justificationType: type });
    }

    onAlternativesConsideredChange(considered: boolean): void {
        this.form.patchValue({ alternativesConsidered: considered });
    }

    onSubmit(): void {
        if (this.isSubmitting) return;

        if (!this.form.valid) {
            this.markFormGroupTouched();
            this.toastr.error('Please fill in all required fields.');
            return;
        }

        const confirmation = this.fuseConfirmationService.open({
            title: this.isEditMode ? 'Confirm update' : 'Confirm submit',
            message: this.isEditMode
                ? 'Are you sure you want to update this justification?'
                : 'Are you sure you want to submit this justification?',
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

        const formData = this.form.value;

            // Transform form data to API format (snake_case)
            const attachmentsPaths = (this.attachmentsArray?.value || [])
                .map((a: { file_path?: string }) => a?.file_path)
                .filter((p: string | undefined): p is string => !!p)
                .map((p: string) => p.startsWith('/') ? p : `/${p}`);
            const apiPayload = {
                sub_consultant_supplier_name: formData.subConsultantSupplierName,
                items_supplied: formData.itemsSupplied,
                justification_type: formData.justificationType === 'single-source' ? 'single_source' :
                                   formData.justificationType === 'price-justification' ? 'price_justification' :
                                   formData.justificationType,
                circumstances_selection: formData.circumstances,
                alternatives_considered: formData.alternativesConsidered ? 1 : 0,
                reason_no_alternatives: formData.alternativesReason || null,
                comments: formData.comments || null,
                rationale_selection: formData.rationale,
                assessed_by: (formData.assessedBy?.id && String(formData.assessedBy.id).trim() !== '') ?
                            this.getEmployeeCode(formData.assessedBy.id) : null,
                assessed_by_date: null,
                corresponding_po_no: formData.correspondingPO || null,
                verify_by: (formData.verifiedBy?.id && String(formData.verifiedBy.id).trim() !== '') ?
                           this.getEmployeeCode(formData.verifiedBy.id) : null,
                verify_by_date: null,
                verify_by_comment: formData.verifiedBy?.comments || null,
                approved_by: (formData.approvedBy?.id && String(formData.approvedBy.id).trim() !== '') ?
                            this.getEmployeeCode(formData.approvedBy.id) : null,
                approved_by_date: null,
                approved_by_comments: formData.approvedBy?.comments || null,
                acknowledged_by: (formData.acknowledgedBy?.id && String(formData.acknowledgedBy.id).trim() !== '') ?
                                this.getEmployeeCode(formData.acknowledgedBy.id) : null,
                acknowledged_by_date: null,
                acknowledged_by_comments: formData.acknowledgedBy?.comments || null,
                attachments: attachmentsPaths,
            };

            const apiCall = this.isEditMode && this.currentId
                ? this.apiService.updateSingleSourceJustification(this.currentId, apiPayload)
                : this.apiService.createSingleSourceJustification(apiPayload);

            apiCall.subscribe({
                next: (response) => {
                    this.isSubmitting = false;
                    if (response.status) {
                        this.toastr.success(
                            response.message ||
                            (this.isEditMode ? 'Justification updated successfully!' : 'Justification created successfully!')
                        );
                        if (!this.isEditMode) {
                            this.sendInitialEmailNotification(apiPayload, response);
                        }
                        setTimeout(() => {
                            this.router.navigate(['/single-source-justification']);
                        }, 2000);
                    } else {
                        this.toastr.error(response.message || 'Failed to submit form. Please try again.');
                    }
                },
                error: (error) => {
                    console.error('Error submitting form:', error);
                    this.isSubmitting = false;
                    this.toastr.error(error.error?.message || 'Failed to submit form. Please try again.');
                }
            });
    }

    private sendInitialEmailNotification(apiPayload: any, response: any): void {
        const justificationId = this.workflowEmailNotificationService.readResponseId(response);
        const notificationSource = {
            ...this.workflowEmailNotificationService.createNotificationSource(apiPayload, response),
            id: justificationId
        };

        this.workflowEmailNotificationService
            .notifyInitialAction(SINGLE_SOURCE_JUSTIFICATION_EMAIL_CONFIG, notificationSource, justificationId)
            .subscribe({
                error: (error) => {
                    console.error('Failed to send single source justification email notification:', error);
                    this.toastr.warning('Justification was saved, but email notification could not be sent.');
                }
            });
    }

    /**
     * Load justification data for edit mode
     */
    private loadJustification(id: string): void {
        this.isLoading = true;
        this.apiService.getSingleSourceJustification(id).subscribe({
            next: (response) => {
                this.isLoading = false;
                if (response.status && response.data) {
                    const data = response.data;

                    // Find employee IDs from codes
                    const getEmployeeId = (code: string | null): string => {
                        if (!code) return '';
                        const employee = this.users.find(u => u.code === code);
                        return employee ? employee.id : '';
                    };

                    // Parse dates
                    const parseDate = (dateString: string | null): Date | null => {
                        if (!dateString) return null;
                        try {
                            return new Date(dateString);
                        } catch {
                            return null;
                        }
                    };

                    // Populate form
                    this.form.patchValue({
                        subConsultantSupplierName: data.sub_consultant_supplier_name || '',
                        itemsSupplied: data.items_supplied || '',
                        justificationType: data.justification_type === 'single_source' ? 'single-source' :
                                         data.justification_type === 'price_justification' ? 'price-justification' :
                                         data.justification_type || '',
                        circumstances: data.circumstances_selection || '',
                        alternativesConsidered: (data.alternatives_considered || 0) > 0,
                        alternativesReason: data.reason_no_alternatives || '',
                        comments: data.comments || '',
                        rationale: data.rationale_selection || '',
                        correspondingPO: data.corresponding_po_no || '',
                        assessedBy: {
                            id: getEmployeeId(data.assessed_by),
                            date: parseDate(data.assessed_by_date)
                        },
                        verifiedBy: {
                            id: getEmployeeId(data.verify_by),
                            date: parseDate(data.verify_by_date),
                            comments: data.verify_by_comment || ''
                        },
                        approvedBy: {
                            id: getEmployeeId(data.approved_by),
                            date: parseDate(data.approved_by_date),
                            comments: data.approved_by_comments || ''
                        },
                        acknowledgedBy: {
                            id: getEmployeeId(data.acknowledged_by),
                            date: parseDate(data.acknowledged_by_date),
                            comments: data.acknowledged_by_comments || ''
                        }
                    });
                    if (Array.isArray(data.attachments) && data.attachments.length > 0) {
                        const docsGroup = this.form.get('documents') as FormGroup;
                        const arr = docsGroup.get('attachments') as FormArray;
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
                } else {
                    this.toastr.error(response.message || 'Failed to load justification data.');
                }
            },
            error: (error) => {
                console.error('Error loading justification:', error);
                this.isLoading = false;
                this.toastr.error(error.error?.message || 'Failed to load justification data. Please try again.');
            }
        });
    }

    /**
     * Get employee code from employee ID
     */
    private getEmployeeCode(employeeId: string): string | null {
        const employee = this.users.find(u => u.id === employeeId);
        return employee ? employee.code : null;
    }

    /**
     * Format date to YYYY-MM-DD format for API
     */
    private formatDateForAPI(date: Date | string): string | null {
        if (!date) return null;
        try {
            const dateObj = typeof date === 'string' ? new Date(date) : date;
            if (isNaN(dateObj.getTime())) return null;
            const year = dateObj.getFullYear();
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            const day = dateObj.getDate().toString().padStart(2, '0');
            const hours = dateObj.getHours().toString().padStart(2, '0');
            const minutes = dateObj.getMinutes().toString().padStart(2, '0');
            const seconds = dateObj.getSeconds().toString().padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } catch {
            return null;
        }
    }

    onCancel(): void {
        this.router.navigate(['/single-source-justification']);
    }

    private markFormGroupTouched(): void {
        Object.keys(this.form.controls).forEach((key) => {
            const control = this.form.get(key);
            if (control instanceof FormGroup) {
                Object.keys(control.controls).forEach((nestedKey) => {
                    control.get(nestedKey)?.markAsTouched();
                });
            } else {
                control?.markAsTouched();
            }
        });
    }

    private getMissingRequiredFieldLabels(): string[] {
        const fieldLabels: Record<string, string> = {
            subConsultantSupplierName: 'Sub-Consultant / Supplier Name',
            itemsSupplied: 'Item(s) Supplied',
            justificationType: 'Justification Type',
            circumstances: 'Circumstances',
            rationale: 'Rationale',
            verifiedBy: 'Verified by',
            approvedBy: 'Approved by',
            acknowledgedBy: 'Acknowledged by'
        };
        return Object.entries(fieldLabels)
            .filter(([controlName]) => this.form.get(controlName)?.invalid)
            .map(([_, label]) => label);
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
    isFieldInvalid(fieldName: string): boolean {
        const field = this.form.get(fieldName);
        return !!(field && field.invalid && (field.dirty || field.touched));
    }

    getErrorMessage(fieldName: string): string {
        const field = this.form.get(fieldName);
        if (field?.hasError('required')) {
            return `${fieldName} is required`;
        }
        return '';
    }

    formatDate(date: Date): string {
        if (!date) return '';
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }

    parseDateString(dateString: string): Date {
        // Parse DD-MM-YYYY format
        const parts = dateString.split('-');
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed in Date constructor
            const year = parseInt(parts[2], 10);

            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                return new Date(year, month, day);
            }
        }
        // Fallback to current date if parsing fails
        return new Date();
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
            data: {}
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
}
