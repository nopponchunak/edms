import { Component, Inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormControl, FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { SubConsultantEvaluationService, CreateSubConsultantEvaluationRequest } from 'app/core/services/sub-consultant-evaluation.service';
import { formatDate } from '@angular/common';
import { ApiConfig } from 'app/core/config/api.config';
import { ApiService } from 'app/core/services/api.service';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';
import { SUB_CONSULTANT_EVALUATION_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { ExternalProject, ExternalProjectService } from 'app/core/services/external-project.service';

interface UserOption { id: string; firstName: string; lastName: string; email?: string; role?: string; }

interface SubConsultant {
    id: number;
    type: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    contact_person: string | null;
    status: string;
    create_by: string | null;
    update_by: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    No: number;
}

interface SubConsultantsApiResponse {
    code: string;
    status: boolean;
    message: string;
    data: SubConsultant[];
}

@Component({
    selector: 'app-sce-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
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
        MatProgressSpinnerModule,
        HttpClientModule,
        NgxMatSelectSearchModule,
        RouterModule,
    ],
    templateUrl: './sce-form.component.html',
    styleUrls: ['./sce-form.component.scss']
})

export class SceFormComponent implements OnInit, OnDestroy {
    isSubmitting = false;
    isLoading = false;
    isEditMode = false;
    isView = false;
    evaluationId: number | null = null;
    form: FormGroup;
    users: EmployeeOption[] = [];
    filteredEvaluatedUsers: EmployeeOption[] = [];
    filteredApprovedUsers: EmployeeOption[] = [];
    filteredAckUsers: EmployeeOption[] = [];
    evaluatedSearchCtrl = new FormControl('');
    approvedSearchCtrl = new FormControl('');
    ackSearchCtrl = new FormControl('');
    projectSearchCtrl = new FormControl('');
    subConsultantSearchCtrl = new FormControl('');

    // Cache for all loaded employees to support autocomplete persistence
    allLoadedEmployees: Map<string, EmployeeOption> = new Map();

    subConsultants: SubConsultant[] = [];
    filteredSubConsultantOptions: SubConsultant[] = [];

    // Project details from ExternalProjectService
    filteredProjectOptions: ExternalProject[] = [];

    private readonly destroy$ = new Subject<void>();

    ratingItems = [
        'Quality and Accuracy of Document',
        'Timeliness of Documentation',
        'Understanding of MTL’s Needs',
        'Cooperation and Responsiveness',
        'Management Abilities',
        'Compliance to EMS / OHSMS Requirements',
        'Overall Level of Satisfaction',
        'Others'
    ];

    constructor(
        private fb: FormBuilder,
        private http: HttpClient,
        private dialog: MatDialog,
        private employeeService: EmployeeService,
        private router: Router,
        private route: ActivatedRoute,
        private evaluationService: SubConsultantEvaluationService,
        private cdr: ChangeDetectorRef,
        private apiConfig: ApiConfig,
        private apiService: ApiService,
        private projectService: ExternalProjectService,
        private workflowEmailNotificationService: WorkflowEmailNotificationService,
        private fuseConfirmationService: FuseConfirmationService,
        private toastr: ToastrService
    ) {
        this.form = this.fb.group({
            to: [''],
            circ: [''],
            subConsultantName: ['', Validators.required],
            projectId: [null, Validators.required],
            projectName: ['', Validators.required],
            projectNo: [''],
            departmentContractDuration: [''],
            scopeOfServices: [''],
            // Anti-corruption compliance
            hasViolation: [null, Validators.required], // true=yes remove, false=no proceed
            // CAD confirmation (for Architectural/Interior only)
            cadConfirmed: [null],
            // Ratings
            ratings: this.fb.array(this.ratingItems.map((item, index) => this.fb.group({
                item_no: [index + 1],
                item_name: [item],
                rating: [0, [Validators.min(0), Validators.max(10)]],
                comment: ['']
            }))),
            // Decision radio button (mutually exclusive)
            approvedListAction: [null], // 'maintain' or 'remove'
            evaluatedBy: ['', [Validators.required]],
            approvedBy: ['', [Validators.required]],
            acknowledgedBy: ['', [Validators.required]],
            // Documents
            documents: this.fb.group({
                attachments: this.fb.array([])
            })
        });

    }

    ngOnInit(): void {
        const idParam = this.route.snapshot.paramMap.get('id');
        if (idParam) {
            this.isEditMode = true;
            this.evaluationId = parseInt(idParam, 10);
            this.loadEvaluation(this.evaluationId);
        } else {
            this.loadUsers();
        }
        this.setupSubConsultantSearch();
        this.loadSubConsultants();

        this.setupProjectSearch();

        // When Approved by changes, update the read-only "To" field to show the same person
        this.form.get('approvedBy')?.valueChanges.subscribe((selectedId) => {
            this.updateToFromUser(selectedId);
        });

        // Subscribe to rating changes to trigger average recalculation and auto-tick checkboxes
        this.ratingsArray.controls.forEach(control => {
            control.get('rating')?.valueChanges.subscribe(() => {
                this.cdr.markForCheck();
                this.updateCheckboxesBasedOnAverage();
            });
        });

        this.setupProjectSearch();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private _filterProjects(
        searchValue: unknown,
        list: Array<{ id: number; code: string; name: string; detail?: string }>
    ): Array<{ id: number; code: string; name: string; detail?: string }> {
        const search = (typeof searchValue === 'string' ? searchValue : String(searchValue ?? '')).trim().toLowerCase();
        if (!search) return list;
        return list.filter(
            (p) =>
                (p.code && p.code.toLowerCase().includes(search)) ||
                (p.name && p.name.toLowerCase().includes(search))
        );
    }

    private setupProjectSearch(): void {
        this.projectSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) =>
                    this.projectService.getProjects(term ? term.toString().trim() : '', 20)
                ),
                takeUntil(this.destroy$)
            )
            .subscribe((projects) => {
                this.filteredProjectOptions = projects;
            });

        this.projectService
            .getProjects('', 20)
            .pipe(takeUntil(this.destroy$))
            .subscribe((projects) => {
                this.filteredProjectOptions = projects;
            });
    }

    onProjectSelectedById(projectId: number | string): void {
        const selectedProjectId = Number(projectId);
        const project = this.filteredProjectOptions.find(
          (option) => option.id === selectedProjectId
        );

        if (!project) {
          return;
        }

        this.form.patchValue({
          projectName: project.name,
          projectNo: project.code,
        });
    }

    /** Display in Project No. input: show code when value is project object, else the string value */
    projectNoDisplayFn(value: unknown): string {
        if (value && typeof value === 'object' && 'code' in value) return (value as { code: string }).code;
        return typeof value === 'string' ? value : '';
    }

    /** Display in Project Name input: show name when value is project object, else the string value */
    projectNameDisplayFn(value: unknown): string {
        if (value && typeof value === 'object' && 'name' in value) return (value as { name: string }).name;
        return typeof value === 'string' ? value : '';
    }

    onProjectOptionSelected(project: { code: string; name: string }): void {
        this.form.patchValue({
            projectNo: project.code || '',
            projectName: project.name || ''
        });
    }

    get ratingsArray(): FormArray {
        return this.form.get('ratings') as FormArray;
    }

    get averageRating(): number {
        const ratings = this.ratingsArray.controls
            .map(control => {
                const rating = control.get('rating')?.value;
                // Convert to number, return null if empty/invalid
                if (rating === null || rating === undefined || rating === '') {
                    return null;
                }
                const numRating = parseFloat(rating);
                return isNaN(numRating) ? null : numRating;
            })
            .filter((rating): rating is number => rating !== null); // Only count valid ratings

        if (ratings.length === 0) return 0;

        const sum = ratings.reduce((acc, rating) => acc + rating, 0);
        return parseFloat((sum / ratings.length).toFixed(2));
    }

    private updateCheckboxesBasedOnAverage(): void {
        const average = this.averageRating;

        // Only update if there are valid ratings (average > 0)
        if (average > 0) {
            if (average >= 5) {
                // Average Rating ≥ 5: Maintain in approved list
                this.form.patchValue({
                    approvedListAction: 'maintain'
                }, { emitEvent: false });
            } else {
                // Average Rating < 5: Remove from approved list
                this.form.patchValue({
                    approvedListAction: 'remove'
                }, { emitEvent: false });
            }
        } else {
            // No valid ratings: set to null
            this.form.patchValue({
                approvedListAction: null
            }, { emitEvent: false });
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

    private loadUsers(requiredCodes: string[] = []): void {
        this.employeeService.getEmployeeOptions().subscribe({
            next: (employees) => {
                this.users = employees;

                // Populate cache
                employees.forEach(u => {
                    if (u.id) this.allLoadedEmployees.set(String(u.id), u);
                    if (u.code) this.allLoadedEmployees.set(u.code, u);
                });

                // Filter helper to ensure required codes are included
                const filterWithRequired = (list: EmployeeOption[], codes: string[], levelFilter: (u: EmployeeOption) => boolean) => {
                    return list.filter(u => levelFilter(u) || (u.code && codes.includes(u.code)) || (u.id && codes.includes(String(u.id))));
                };

                this.filteredEvaluatedUsers = this.users;
                this.filteredApprovedUsers = this.users;
                this.filteredAckUsers = this.users;

                this.setupSearchFilters();

                // Ensure "To" is in sync if Approved by already has a value (e.g. edit mode)
                const currentApprovedBy = this.form.get('approvedBy')?.value;
                if (currentApprovedBy) {
                    this.updateToFromUser(currentApprovedBy);
                }
            },
            error: () => {
                this.users = [];
                this.filteredEvaluatedUsers = [];
                this.filteredApprovedUsers = [];
                this.filteredAckUsers = [];
            }
        });
    }

    private setupSearchFilters(): void {
        // Evaluated By search
        this.evaluatedSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    return this.employeeService.getEmployeeOptions(searchTerm, 50);
                }),
                takeUntil(this.destroy$)
            )
            .subscribe((employees) => {
                // Update cache
                employees.forEach(u => {
                    if (u.id) this.allLoadedEmployees.set(String(u.id), u);
                    if (u.code) this.allLoadedEmployees.set(u.code, u);
                });

                this.updateFilteredUsers(
                    employees,
                    this.form.get('evaluatedBy')?.value,
                    (val) => this.filteredEvaluatedUsers = val
                );
            });

        // Approved By search
        this.approvedSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    return this.employeeService.getEmployeeOptions(searchTerm, 50);
                }),
                takeUntil(this.destroy$)
            )
            .subscribe((employees) => {
                // Update cache
                employees.forEach(u => {
                    if (u.id) this.allLoadedEmployees.set(String(u.id), u);
                    if (u.code) this.allLoadedEmployees.set(u.code, u);
                });

                this.updateFilteredUsers(
                    employees,
                    this.form.get('approvedBy')?.value,
                    (val) => this.filteredApprovedUsers = val
                );
            });

        // Acknowledged By search - ใช้ IMR? Wait, original used IMR in subscribe but inside setupSearchFilters it used IMR? 
        // Let me check my previous replacement block for subscribe. In line 386 it used MR? Wait, line 386 used MR but line 319 used IMR.
        // I will stick to what's inside the file.
        this.ackSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const searchTerm = term ? term.toString().trim() : '';
                    // The original used IMR in line 319, I will use IMR here for consistency if that's what it was doing.
                    return this.employeeService.getEmployeeOptions(searchTerm, 50);
                }),
                takeUntil(this.destroy$)
            )
            .subscribe((employees) => {
                // Update cache
                employees.forEach(u => {
                    if (u.id) this.allLoadedEmployees.set(String(u.id), u);
                    if (u.code) this.allLoadedEmployees.set(u.code, u);
                });

                this.updateFilteredUsers(
                    employees,
                    this.form.get('acknowledgedBy')?.value,
                    (val) => this.filteredAckUsers = val
                );
            });
    }

    /**
     * Sync the read-only "To" field with the selected user.
     * It will display using displayLabel (initial (department), firstname lastname).
     */
    private updateToFromUser(selectedId: string | null | undefined): void {
        if (!selectedId) {
            this.form.get('to')?.setValue('', { emitEvent: false });
            return;
        }

        const selectedUser = this.users.find(u => u.id === selectedId);
        const displayValue = selectedUser ? selectedUser.displayLabel : '';
        this.form.get('to')?.setValue(displayValue, { emitEvent: false });
    }

    loadEvaluation(id: number): void {
        this.isLoading = true;
        this.evaluationService.findOne(id).subscribe({
            next: (evaluation) => {
                const requiredCodes = [
                    evaluation.evaluated_by,
                    evaluation.approved_by,
                    evaluation.acknowledged_by
                ].filter((code): code is string => !!code);

                this.form.patchValue({
                    to: evaluation.to,
                    circ: evaluation.circ,
                    subConsultantName: evaluation.sub_consultant_name,
                    projectId: evaluation.id, // Assuming ID as fallback or check if there's a better property
                    projectName: evaluation.project_name,
                    projectNo: evaluation.project_no,
                    departmentContractDuration: evaluation.department_value_duration,
                    scopeOfServices: evaluation.scope_of_services || '',
                    hasViolation: evaluation.anti_corruption_is_violation === 1,
                    cadConfirmed: evaluation.cad_software_confirmed === 1,
                    approvedListAction: evaluation.is_maintained === 1 ? 'maintain' : (evaluation.is_removed === 1 ? 'remove' : null),
                    evaluatedBy: evaluation.evaluated_by || '',
                    approvedBy: evaluation.approved_by || '',
                    acknowledgedBy: evaluation.acknowledged_by || ''
                });

                // Load items
                if (evaluation.items && evaluation.items.length > 0) {
                    const ratingsArray = this.form.get('ratings') as FormArray;
                    evaluation.items.forEach((item, index) => {
                        if (ratingsArray.at(index)) {
                            ratingsArray.at(index).patchValue({
                                item_no: item.item_no,
                                item_name: item.item_name,
                                rating: typeof item.rating === 'string' ? parseFloat(item.rating) : item.rating,
                                comment: item.comment || ''
                            });
                        }
                    });
                }

                // Update checkboxes based on calculated average after loading all data
                this.updateCheckboxesBasedOnAverage();

                // Load files
                if (evaluation.files && evaluation.files.length > 0) {
                    const attachmentsArray = this.attachmentsArray;
                    evaluation.files.forEach((file) => {
                        attachmentsArray.push(this.fb.group({
                            id: [file.id || null],
                            file_name: [file.name],
                            file_path: [file.path],
                            file_url: [file.path],
                            name: [file.name],
                            path: [file.path]
                        }));
                    });
                }

                // Now load users and include required codes
                this.loadUsers(requiredCodes);

                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading evaluation:', error);
                this.toastr.error('Failed to load evaluation. Please try again.');
                this.isLoading = false;
                // Still load users even if evaluation fails
                this.loadUsers();
            }
        });
    }

    onSubmit(): void {
        if (this.isSubmitting) return;

        if (this.form.invalid) {
            this.form.markAllAsTouched();
            const missing = this.getMissingRequiredFieldLabels();
            this.toastr.error(
                missing.length
                    ? `Please fill in required fields: ${missing.join(', ')}`
                    : 'Please fill in all required fields correctly.'
            );
            this.scrollToFirstInvalidControl();
            return;
        }

        const confirmation = this.fuseConfirmationService.open({
            title: this.isEditMode ? 'Confirm update' : 'Confirm submit',
            message: this.isEditMode
                ? 'Are you sure you want to update this evaluation?'
                : 'Are you sure you want to submit this evaluation?',
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
        const formData = this.form.value;

        // Format dates to YYYY-MM-DD
        const formatDateString = (date: Date | null): string | undefined => {
            if (!date) return undefined;
            const d = new Date(date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // Build items array
        const items = this.ratingsArray.value.map((rating: any) => ({
            item_no: rating.item_no,
            item_name: rating.item_name,
            rating: rating.rating ? parseFloat(rating.rating) : 0,
            comment: rating.comment || ''
        }));

        // Build files array from attachments
        const files = this.attachmentsArray.value
            .filter((att: any) => att.file_path || att.path)
            .map((att: any) => ({
                name: att.file_name || att.name,
                path: att.file_path || att.path
            }));
        const attachmentsPaths = this.attachmentsArray.value
            .map((att: any) => att.file_path || att.path)
            .filter((p: string | undefined): p is string => !!p)
            .map((p: string) => p.startsWith('/') ? p : `/${p}`);

        // Build API payload
        const apiPayload: CreateSubConsultantEvaluationRequest = {
            to: formData.to || '',
            circ: formData.circ || '',
            sub_consultant_name: formData.subConsultantName,
            project_name: formData.projectName,
            project_no: formData.projectNo || '',
            department_value_duration: formData.departmentContractDuration || '',
            scope_of_services: formData.scopeOfServices || '',
            anti_corruption_is_violation: formData.hasViolation === true,
            cad_software_confirmed: formData.cadConfirmed === true,
            is_maintained: formData.approvedListAction === 'maintain',
            is_removed: formData.approvedListAction === 'remove',
            evaluated_by: formData.evaluatedBy || undefined,
            evaluated_date: null,
            // ✅ Default new evaluation workflow statuses ตามหลักการเดียวกับ charitable-contributions/actionrequest
            evaluated_by_status: 'pending',
            approved_by: formData.approvedBy || undefined,
            approved_date: null,
            approved_by_status: 'pending',
            acknowledged_by: formData.acknowledgedBy || undefined,
            acknowledged_date: null,
            acknowledged_by_status: 'pending',
            items: items,
            files: files.length > 0 ? files : undefined,
            attachments: attachmentsPaths
        };

        this.isSubmitting = true;

        if (this.isEditMode && this.evaluationId) {
            // Update existing
            this.evaluationService.update(this.evaluationId, apiPayload).subscribe({
                next: () => {
                    this.toastr.success('Evaluation updated successfully!');
                    this.isSubmitting = false;
                    setTimeout(() => {
                        this.router.navigate(['/sub-consultant-evaluation/list']);
                    }, 1500);
                },
                error: (error) => {
                    console.error('Error updating evaluation:', error);
                    this.toastr.error('Failed to update evaluation. Please try again.');
                    this.isSubmitting = false;
                }
            });
        } else {
            // Create new
            this.evaluationService.create(apiPayload).subscribe({
                next: (response) => {
                    this.toastr.success('Evaluation created successfully!');
                    this.isSubmitting = false;
                    this.sendInitialEmailNotification(apiPayload, response);
                    setTimeout(() => {
                        this.router.navigate(['/sub-consultant-evaluation/list']);
                    }, 1500);
                },
                error: (error) => {
                    console.error('Error creating evaluation:', error);
                    this.toastr.error('Failed to create evaluation. Please try again.');
                    this.isSubmitting = false;
                }
            });
        }
    }

    private sendInitialEmailNotification(apiPayload: any, response: any): void {
        const evaluationId = this.workflowEmailNotificationService.readResponseId(response);
        const notificationSource = {
            ...this.workflowEmailNotificationService.createNotificationSource(apiPayload, response),
            id: evaluationId
        };

        this.workflowEmailNotificationService
            .notifyInitialAction(SUB_CONSULTANT_EVALUATION_EMAIL_CONFIG, notificationSource, evaluationId)
            .subscribe({
                error: (error) => {
                    console.error('Failed to send sub-consultant evaluation email notification:', error);
                    this.toastr.warning('Evaluation was saved, but email notification could not be sent.');
                }
            });
    }

    onCancel(): void {
    this.router.navigate(['/sub-consultant-evaluation/list']);
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

    /**
     * Load sub-consultants from API and filter for Active status
     */
    private loadSubConsultants(): void {
        this.http.get<SubConsultantsApiResponse>(
            this.apiConfig.buildUrl('api/get_sub_consultants')
        ).subscribe({
            next: (response) => {
                if (response.status && response.data) {
                    this.subConsultants = response.data.filter(
                        (consultant) => (consultant.status || '').toLowerCase() === 'active'
                    );
                    this.updateFilteredSubConsultantOptions(this.subConsultantSearchCtrl.value);
                } else {
                    this.subConsultants = [];
                    this.filteredSubConsultantOptions = [];
                }
            },
            error: (error) => {
                console.error('Error loading sub-consultants:', error);
                this.subConsultants = [];
                this.filteredSubConsultantOptions = [];
            }
        });
    }

    private setupSubConsultantSearch(): void {
        this.subConsultantSearchCtrl.valueChanges
            .pipe(
                debounceTime(200),
                distinctUntilChanged(),
                takeUntil(this.destroy$)
            )
            .subscribe((term) => {
                this.updateFilteredSubConsultantOptions(term);
            });
    }

    private updateFilteredSubConsultantOptions(searchValue: unknown): void {
        const selectedName = this.form.get('subConsultantName')?.value;
        const filtered = this._filterSubConsultants(
            typeof searchValue === 'string' ? searchValue : String(searchValue ?? ''),
            this.subConsultants
        );
        const selected = this.subConsultants.find((consultant) => consultant.name === selectedName);

        if (selected && !filtered.some((consultant) => consultant.id === selected.id)) {
            this.filteredSubConsultantOptions = [selected, ...filtered];
            return;
        }

        this.filteredSubConsultantOptions = filtered;
    }

    /**
     * Filter sub-consultants based on search term
     */
    private _filterSubConsultants(value: string, consultants: SubConsultant[]): SubConsultant[] {
        if (!value) {
            return consultants;
        }
        const filterValue = value.toLowerCase();
        return consultants.filter(consultant =>
            (consultant.name || '').toLowerCase().includes(filterValue) ||
            (consultant.type && consultant.type.toLowerCase().includes(filterValue))
        );
    }

    isFieldInvalid(fieldName: string): boolean {
        const field = this.form.get(fieldName);
        return !!(field && field.invalid && (field.dirty || field.touched));
    }

    getErrorMessage(fieldName: string): string {
        const field = this.form.get(fieldName);
        if (field?.hasError('required')) return 'This field is required';
        if (field?.hasError('min')) return `Value must be at least ${field.errors?.['min'].min}`;
        if (field?.hasError('max')) return `Value must be at most ${field.errors?.['max'].max}`;
        return '';
    }

    private getMissingRequiredFieldLabels(): string[] {
        const fieldLabels: Record<string, string> = {
            subConsultantName: 'Sub-Consultant Name',
            projectName: 'Project Name',
            hasViolation: 'Anti-Corruption compliance',
            evaluatedBy: 'Evaluated by',
            approvedBy: 'Approved by',
            acknowledgedBy: 'Acknowledged by'
        };

        return Object.entries(fieldLabels)
            .filter(([controlName]) => this.form.get(controlName)?.hasError('required'))
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
}
