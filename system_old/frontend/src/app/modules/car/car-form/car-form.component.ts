import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormArray, FormControl } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { HttpClient } from '@angular/common/http';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ApiConfig } from 'app/core/config/api.config';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { Subject, of } from 'rxjs';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';
import {
    CarSeverity,
    CarSeverityOption,
    CarSource,
    CarSourceOption,
    CreateCarRequest,
    NonConformityType,
    NonConformityTypeOption,
    UpdateCarRequest,
    User,
} from 'app/core/models/car.model';
import { AuthService } from 'app/core/services/auth.service';
import { CarService } from 'app/core/services/car.service';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ExternalProject, ExternalProjectService } from 'app/core/services/external-project.service';
import { startWith, map, shareReplay } from 'rxjs/operators';
import { Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { CAR_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';

@Component({
    selector: 'app-car-form',
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
        MatAutocompleteModule,
        // FuseAlertComponent,
        NgxMatSelectSearchModule
    ],
    templateUrl: './car-form.component.html',
    styleUrls: ['./car-form.component.scss'],
})
export class CarFormComponent implements OnInit, OnDestroy {
    form: FormGroup;
    submitted = false;
    loading = false;
    isEdit = false;
    carId: string | null = null;
    users: EmployeeOption[] = [];
    filteredResponsibleUsers: EmployeeOption[] = [];
    filteredImrUsers: EmployeeOption[] = [];
    filteredCompletedUsers: EmployeeOption[] = [];
    filteredAcknowledgedUsers: EmployeeOption[] = [];
    filteredVerifiedUsers: EmployeeOption[] = [];
    filteredApprovedUsers: EmployeeOption[] = [];
    filteredCarIssuedByUsers: EmployeeOption[] = [];
    filteredToUsers: EmployeeOption[] = [];
    responsibleSearchCtrl = new FormControl('');
    imrSearchCtrl = new FormControl('');
    completedSearchCtrl = new FormControl('');
    acknowledgedSearchCtrl = new FormControl('');
    verifiedSearchCtrl = new FormControl('');
    approvedSearchCtrl = new FormControl('');
    carIssuedBySearchCtrl = new FormControl('');
    toSearchCtrl = new FormControl('');
    projectSearchCtrl = new FormControl('');
    today = new Date();
    refNoAutoLoading = false;

    // Project No / Name from ExternalProjectService
    filteredProjectOptions: ExternalProject[] = [];

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // Keep a local cache of users found from all searches so selected values never disappear from mat-select
    private userOptionCache = new Map<string, EmployeeOption>();

    severityOptions: CarSeverityOption[] = [
        {
            value: CarSeverity.MAJOR,
            label: 'MAJOR',
            description: 'Must respond within 48 hours',
        },
        {
            value: CarSeverity.MINOR,
            label: 'MINOR',
            description: 'Must respond within 7 days',
        },
    ];

    sourceOptions: CarSourceOption[] = [
        { value: CarSource.INTERNAL_IMS_AUDIT, label: 'Internal IMS Audit' },
        { value: CarSource.EXTERNAL_IMS_AUDIT, label: 'External IMS Audit' },
        { value: CarSource.MANAGEMENT_REVIEW, label: 'Management Review' },
        { value: CarSource.NON_CONFORMITY, label: 'Non-Conformity' },
        {
            value: CarSource.CLIENT_EXTERNAL_COMPLAINT,
            label: "Client's or External Complaint",
        },
        {
            value: CarSource.INCIDENT_REPORTING_INVESTIGATION,
            label: 'Incident Reporting & Investigation',
        },
        { value: CarSource.OTHERS, label: 'Others' },
    ];

    nonConformityTypeOptions: NonConformityTypeOption[] = [
        {
            value: NonConformityType.NOT_CONFORM_CLIENT_REQUIREMENTS,
            label: "Not conform to client's requirements",
        },
        {
            value: NonConformityType.VE_REQUESTED_MTL_DESIGN,
            label: "VE has been requested on MTL's Design",
        },
        { value: NonConformityType.ERROR_IN_DESIGN, label: 'Error in design' },
        {
            value: NonConformityType.NOT_COMPLY_LAW_REGULATIONS,
            label: 'Not comply with law and related regulations',
        },
        {
            value: NonConformityType.ENVIRONMENTAL_ISSUE,
            label: 'Environmental issue',
        },
        {
            value: NonConformityType.HEALTH_SAFETY_ISSUE,
            label: 'Health & Safety issue',
        },
        {
            value: NonConformityType.NOT_FOLLOW_PROCEDURES,
            label: 'Not follow the Procedures',
        },
        {
            value: NonConformityType.OBJECTIVES_NOT_MET,
            label: 'Objectives not met',
        },
        { value: NonConformityType.OTHER_ISSUES, label: 'Other issues' },
    ];


    constructor(
        private fb: FormBuilder,
        private carService: CarService,
        private employeeService: EmployeeService,
        private projectService: ExternalProjectService,
        private authService: AuthService,
        public router: Router,
        private route: ActivatedRoute,
        private http: HttpClient,
        private apiConfig: ApiConfig,
        private workflowEmailNotificationService: WorkflowEmailNotificationService,
        private fuseConfirmationService: FuseConfirmationService,
        private toastr: ToastrService
    ) {}

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    ngOnInit(): void {
        this.initializeForm();
        this.loadUsers();
        this.setupProjectSearch();
        this.checkEditMode();
        this.setupRefNoAutoGeneration();
    }

    private initializeForm(): void {
        this.form = this.fb.group({
            to_head: ['-'],
            circ: ['-'],
            circ_position: [''],
            department: ['', Validators.required],
            projectId: [null, Validators.required],
            projectName: [''],
            refNo: [''],
            projectNo: [''],
            to: ['', Validators.required],
            date: [new Date(), Validators.required],
            carIssuedBy: ['', Validators.required],
            // sources: this.fb.array([], Validators.required),
             sources: this.fb.array([], this.minSelected(1)), //t
            otherSourceDescription: [''],
            severity: [CarSeverity.MAJOR, Validators.required],
            // nonConformityTypes: this.fb.array([], Validators.required),
            nonConformityTypes: this.fb.array([], this.minSelected(1)), //t
            nonConformityDescription: [
                '',
                [Validators.required, Validators.minLength(10)],
            ],
            responsiblePersonId: [''],
            imrId: [''],
            // Section 2: Cause/Remedial/Corrective filled in Complete By action request
            // Section 3: Follow Up Remedial and Corrective Results
            imrComments: [''],
            // Completed By
            completedBy: ['', Validators.required],
            completedByDate: [null],
            completedByStatus: [''],
            // Acknowledged By
            acknowledgedBy: ['', Validators.required],
            acknowledgedByDate: [null],
            acknowledgedByStatus: [''],
            // Verified By
            verifiedBy: ['', Validators.required],
            verifiedByDate: [null],
            verifiedByStatus: [''],
            // Approved By
            approvedBy: ['', Validators.required],
            approvedByDate: [null],
            approvedByStatus: [''],
            // Checkboxes (will be converted to 1/0)
            responseTimeCheck: [false],
            raCaSatisfactory: [false],
            raCaSatisfactoryDescription: [''],
            furtherActionRequired: [false],
            furtherActionDescription: [''],
        });

        this.setupFollowUpOptionSync();

        // Sync 'To' and 'Completed by' fields
        this.form.get('to')?.valueChanges.pipe(takeUntil(this._unsubscribeAll)).subscribe((val) => {
            if (this.form.get('completedBy')?.value !== val) {
                this.form.get('completedBy')?.patchValue(val, { emitEvent: false });
                
                // Ensure the value is in the filtered list
                this.filteredCompletedUsers = this.withSelectedOption('completedBy', this.users);
            }
        });

        this.form.get('completedBy')?.valueChanges.pipe(takeUntil(this._unsubscribeAll)).subscribe((val) => {
            if (this.form.get('to')?.value !== val) {
                this.form.get('to')?.patchValue(val, { emitEvent: false });
                
                // Ensure the value is in the filtered list
                this.filteredToUsers = this.withSelectedOption('to', this.users);
            }
        });

        // Sync 'CAR Issued By' and 'Verified by' fields
        this.form.get('carIssuedBy')?.valueChanges.pipe(takeUntil(this._unsubscribeAll)).subscribe((val) => {
            if (this.form.get('verifiedBy')?.value !== val) {
                this.form.get('verifiedBy')?.patchValue(val, { emitEvent: false });
                this.filteredVerifiedUsers = this.withSelectedOption('verifiedBy', this.users);
            }
        });

        this.form.get('verifiedBy')?.valueChanges.pipe(takeUntil(this._unsubscribeAll)).subscribe((val) => {
            if (this.form.get('carIssuedBy')?.value !== val) {
                this.form.get('carIssuedBy')?.patchValue(val, { emitEvent: false });
                this.filteredCarIssuedByUsers = this.withSelectedOption('carIssuedBy', this.users);
            }
        });
    }

    private setupFollowUpOptionSync(): void {
        const raControl = this.form.get('raCaSatisfactory');
        const raDescriptionControl = this.form.get('raCaSatisfactoryDescription');
        const furtherControl = this.form.get('furtherActionRequired');
        const furtherDescriptionControl = this.form.get('furtherActionDescription');

        raControl?.valueChanges.pipe(takeUntil(this._unsubscribeAll)).subscribe((checked: boolean) => {
            if (!checked) return;

            furtherControl?.patchValue(false, { emitEvent: false });
            furtherDescriptionControl?.patchValue('', { emitEvent: false });
        });

        furtherControl?.valueChanges.pipe(takeUntil(this._unsubscribeAll)).subscribe((checked: boolean) => {
            if (!checked) return;

            raControl?.patchValue(false, { emitEvent: false });
            raDescriptionControl?.patchValue('', { emitEvent: false });
        });
    }

    private minSelected(min = 1) {
    return (ctrl: import('@angular/forms').AbstractControl) => {
      const fa = ctrl as FormArray;
      return fa && fa.length >= min ? null : { minSelected: { required: min } };
    };
  }

    private setupProjectSearch(): void {
        this.projectSearchCtrl.valueChanges
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) =>
                    this.projectService.getProjects(term ? term.toString().trim() : '', 20)
                ),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((projects) => {
                this.filteredProjectOptions = projects;
            });

        this.projectService
            .getProjects('', 20)
            .pipe(takeUntil(this._unsubscribeAll))
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

    displayProjectNo(value: any | string | null): string {
        if (!value) return '';
        return typeof value === 'object' && value?.code ? value.code : String(value ?? '');
    }

    displayProjectName(value: ExternalProject | string | null): string {
        if (!value) return '';
        return typeof value === 'object' && value?.name ? value.name : String(value ?? '');
    }

  // 🆕 Getters เพื่อใช้ใน template เช็ก invalid ได้สะดวก
  get sourcesInvalid() {
    return this.form.get('sources')?.invalid;
  }
  get nonConformityInvalid() {
    return this.form.get('nonConformityTypes')?.invalid;
  }

    private checkEditMode(): void {
        this.carId = this.route.snapshot.paramMap.get('id');
        if (this.carId) {
            this.isEdit = true;
            this.loadCarData();
        }
    }

    private setupRefNoAutoGeneration(): void {
        if (this.isEdit) {
            return;
        }

        this.loadNextRefNo(this.form.get('date')?.value);
        this.form.get('date')?.valueChanges
            .pipe(
                debounceTime(250),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((date) => {
                this.loadNextRefNo(date);
            });
    }

    private loadNextRefNo(date: Date | string | null | undefined): void {
        this.refNoAutoLoading = true;

        this.carService
            .getNextRefNo(this.formatDateForApiValue(date))
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (refNo) => {
                    this.refNoAutoLoading = false;
                    this.form.get('refNo')?.patchValue(refNo, { emitEvent: false });
                },
                error: () => {
                    this.refNoAutoLoading = false;
                    this.form.get('refNo')?.patchValue('', { emitEvent: false });
                },
            });
    }

    private loadUsers(): void {
        this.employeeService.getEmployeeOptions().subscribe({
            next: (employees) => {
                this.users = employees;
                this.upsertUserOptions(employees);

                // Initialize filtered arrays - แสดงทั้งหมดไม่ filter
                this.filteredResponsibleUsers = this.users;
                this.filteredImrUsers = this.users;
                this.filteredCompletedUsers = this.users;
                this.filteredAcknowledgedUsers = this.users;
                this.filteredVerifiedUsers = this.users;
                this.filteredApprovedUsers = this.users;
                this.filteredCarIssuedByUsers = this.users;
                this.filteredToUsers = this.users;

                // Setup search filters
                this.setupSearchFilters();

                // Default to current user if not in edit mode
                if (!this.isEdit) {
                    const userCode = getCurrentUserCode();
                    if (userCode) {
                        // Patch the form first
                        this.form.get('carIssuedBy')?.patchValue(userCode);
                        this.form.get('verifiedBy')?.patchValue(userCode);
                        
                        // Then ensure they're in the filtered lists
                        this.filteredCarIssuedByUsers = this.withSelectedOption('carIssuedBy', this.users);
                        this.filteredVerifiedUsers = this.withSelectedOption('verifiedBy', this.users);
                    }
                }
            },
            error: (error) => {
                console.error('Error loading employees:', error);
                this.users = [];
                this.filteredResponsibleUsers = [];
                this.filteredImrUsers = [];
                this.filteredCompletedUsers = [];
                this.filteredAcknowledgedUsers = [];
                this.filteredVerifiedUsers = [];
                this.filteredApprovedUsers = [];
                this.filteredCarIssuedByUsers = [];
            }
        });
    }

    private upsertUserOptions(employees: EmployeeOption[]): void {
        employees.forEach((employee) => {
            if (employee?.code) {
                this.userOptionCache.set(employee.code, employee);
            }
        });
    }

    private withSelectedOption(controlName: string, employees: EmployeeOption[]): EmployeeOption[] {
        const selectedCode = this.form?.get(controlName)?.value;
        if (!selectedCode || typeof selectedCode !== 'string') {
            return employees;
        }

        const existsInList = employees.some((emp) => emp.code === selectedCode);
        if (existsInList) {
            return employees;
        }

        const selected = this.userOptionCache.get(selectedCode);
        if (!selected) {
            return employees;
        }

        return [selected, ...employees];
    }

    /**
     * Setup search filters for each select - ใช้ API search แบบ real-time
     */
    private setupSearchFilters(): void {
        // Responsible Person search - ใช้ API search
        this.responsibleSearchCtrl.valueChanges
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
                this.upsertUserOptions(employees);
                this.filteredResponsibleUsers = this.withSelectedOption('responsiblePersonId', employees);
            });

        // IMR search - ใช้ API search และ filter IMR
        this.imrSearchCtrl.valueChanges
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
                this.upsertUserOptions(employees);
                this.filteredImrUsers = this.withSelectedOption('imrId', employees);
            });

        // Completed By search - ใช้ API search
        this.completedSearchCtrl.valueChanges
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
                this.upsertUserOptions(employees);
                this.filteredCompletedUsers = this.withSelectedOption('completedBy', employees);
            });

        // Acknowledged By search - ใช้ API search และ filter MD, DI, TL
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
                this.upsertUserOptions(employees);
                this.filteredAcknowledgedUsers = this.withSelectedOption('acknowledgedBy', employees);
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
                this.upsertUserOptions(employees);
                this.filteredVerifiedUsers = this.withSelectedOption('verifiedBy', employees);
            });

        // Approved By search - ใช้ API search และ filter IMR
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
                this.upsertUserOptions(employees);
                this.filteredApprovedUsers = this.withSelectedOption('approvedBy', employees);
            });

        // CAR Issued By search - ใช้ API search
        this.carIssuedBySearchCtrl.valueChanges
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
                this.upsertUserOptions(employees);
                this.filteredCarIssuedByUsers = this.withSelectedOption('carIssuedBy', employees);
            });

        // To search - ใช้ API search
        this.toSearchCtrl.valueChanges
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
                this.upsertUserOptions(employees);
                this.filteredToUsers = this.withSelectedOption('to', employees);
            });
    }

    private loadCarData(): void {
        this.loading = true;
        this.carService.findOne(this.carId!).subscribe({
            next: (car) => {
                // Parse date with null handling
                const parsedDate = this.parseDateString(car.date);
                const parsedCompletedDate = car.completedByDate || car.completedDate ? this.parseDateString(car.completedByDate || car.completedDate) : null;
                const parsedAcknowledgedDate = car.acknowledgedByDate || car.acknowledgedDate ? this.parseDateString(car.acknowledgedByDate || car.acknowledgedDate) : null;
                const parsedVerifiedDate = car.verifiedByDate || car.verifiedDate ? this.parseDateString(car.verifiedByDate || car.verifiedDate) : null;
                const parsedApprovedDate = car.approvedByDate || car.approvedDate ? this.parseDateString(car.approvedByDate || car.approvedDate) : null;

                // Normalize severity (API might send "Major" but enum expects "major")
                let normalizedSeverity = car.severity;
                if (typeof normalizedSeverity === 'string') {
                    normalizedSeverity = normalizedSeverity.toLowerCase() as any;
                }

                this.form.patchValue({
                    department: car.department || '',
                    projectId: (car as any).projectId,
                    projectName: car.projectName || '',
                    refNo: car.refNo || '',
                    projectNo: car.projectNo || '',
                    to: car.to || '',
                    date: parsedDate || new Date(),
                    carIssuedBy: car.carIssuedBy || '',
                    severity: normalizedSeverity || CarSeverity.MAJOR,
                    nonConformityDescription: car.nonConformityDescription || '',
                    otherSourceDescription: car.otherSourceDescription || '',
                    responsiblePersonId: car.responsiblePersonId || '',
                    imrId: car.imrId || '',
                    // Section 2: Cause/Remedial/Corrective filled in action request
                    // Section 3: Follow Up Remedial and Corrective Results
                    imrComments: car.imrComments || '',
                    // Completed By
                    completedBy: car.completedBy || '',
                    completedByDate: parsedCompletedDate,
                    completedByStatus: car.completedByStatus || '',
                    // Acknowledged By
                    acknowledgedBy: car.acknowledgedBy || '',
                    acknowledgedByDate: parsedAcknowledgedDate,
                    acknowledgedByStatus: car.acknowledgedByStatus || '',
                    // Verified By
                    verifiedBy: car.verifiedBy || '',
                    verifiedByDate: parsedVerifiedDate,
                    verifiedByStatus: car.verifiedByStatus || '',
                    // Approved By
                    approvedBy: car.approvedBy || '',
                    approvedByDate: parsedApprovedDate,
                    approvedByStatus: car.approvedByStatus || '',
                    // Checkboxes - convert to boolean
                    responseTimeCheck: car.responseTimeCheck === true || car.responseTimeCheck === 1 || false,
                    raCaSatisfactory: car.raCaSatisfactory === true || car.raCaSatisfactory === 1 || false,
                    raCaSatisfactoryDescription: car.raCaSatisfactoryDescription || '',
                    furtherActionRequired: car.furtherActionRequired === true || car.furtherActionRequired === 1 || false,
                    furtherActionDescription: car.furtherActionDescription || ''
                });

                // Clear existing sources and non-conformity types before adding new ones
                while (this.sourcesArray.length !== 0) {
                    this.sourcesArray.removeAt(0);
                }
                while (this.nonConformityTypesArray.length !== 0) {
                    this.nonConformityTypesArray.removeAt(0);
                }

                // Set sources
                if (car.sources && Array.isArray(car.sources)) {
                    car.sources.forEach((source) => {
                        this.addSource(source as any);
                    });
                }

                // Set non-conformity types
                if (car.nonConformityTypes && Array.isArray(car.nonConformityTypes)) {
                    car.nonConformityTypes.forEach((type) => {
                        this.addNonConformityType(type as any);
                    });
                }

                this.loading = false;
            },
            error: (error) => {
                this.loading = false;
                this.toastr.error('Failed to load CAR data. Please try again.');
            },
        });
    }

    get sourcesArray(): FormArray {
        return this.form.get('sources') as FormArray;
    }

    get nonConformityTypesArray(): FormArray {
        return this.form.get('nonConformityTypes') as FormArray;
    }

    addSource(source?: CarSource | string): void {
        const sourcesArray = this.sourcesArray;
        if (source && !sourcesArray.value.includes(source)) {
            sourcesArray.push(this.fb.control(source));
        }
    }

    removeSource(index: number): void {
        this.sourcesArray.removeAt(index);
    }

    addNonConformityType(type?: NonConformityType | string): void {
        const typesArray = this.nonConformityTypesArray;
        if (type && !typesArray.value.includes(type)) {
            typesArray.push(this.fb.control(type));
        }
    }

    removeNonConformityType(index: number): void {
        this.nonConformityTypesArray.removeAt(index);
    }

    onSourceChange(event: any): void {
        const value = event.source.value;
        const checked = event.checked;



        if (checked) {
            this.addSource(value);
        } else {
            const sourcesArray = this.sourcesArray;
            const index = sourcesArray.value.indexOf(value);
            if (index > -1) {
                this.removeSource(index);
            }
        }

    }

    onNonConformityTypeChange(event: any): void {
        const value = event.source.value;
        const checked = event.checked;



        if (checked) {
            this.addNonConformityType(value);
        } else {
            const typesArray = this.nonConformityTypesArray;
            const index = typesArray.value.indexOf(value);
            if (index > -1) {
                this.removeNonConformityType(index);
            }
        }
    }

    isSourceSelected(source: CarSource | string): boolean {
        return this.sourcesArray.value.includes(source);
    }

    isNonConformityTypeSelected(type: NonConformityType | string): boolean {
        return this.nonConformityTypesArray.value.includes(type);
    }

    formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private formatDateForApiValue(date: Date | string | null | undefined): string | null {
        if (!date) return null;
        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return null;
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    parseDateString(dateString: string | null | undefined): Date | null {
        if (!dateString) return null;

        // Try parsing YYYY-MM-DD format (from API)
        const parts = dateString.split('-');
        if (parts.length === 3) {
            // Check if it's YYYY-MM-DD format (year is first, 4 digits)
            if (parts[0].length === 4) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed in Date constructor
                const day = parseInt(parts[2], 10);

                if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                    return new Date(year, month, day);
                }
            } else {
                // Try DD-MM-YYYY format (legacy)
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const year = parseInt(parts[2], 10);

                if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                    return new Date(year, month, day);
                }
            }
        }

        // Try parsing ISO format
        const isoDate = new Date(dateString);
        if (!isNaN(isoDate.getTime())) {
            return isoDate;
        }

        // Fallback to null if parsing fails
        return null;
    }

    onSubmit(): void {
        if (this.loading) return;

        this.submitted = true;



        // Log individual field errors
        Object.keys(this.form.controls).forEach(key => {
            const control = this.form.get(key);
            if (control && control.invalid) {
            }
        });

        if (this.form.invalid) {
            this.markFormGroupTouched();
            this.toastr.error('Please fill in all required fields.');

            return;
        }

        const confirmation = this.fuseConfirmationService.open({
            title: this.isEdit ? 'Confirm update' : 'Confirm submit',
            message: this.isEdit
                ? 'Are you sure you want to update this CAR?'
                : 'Are you sure you want to submit this CAR?',
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

        // Helper function to format date for API (YYYY-MM-DD)
        const formatDateForAPI = (date: Date | string | null | undefined): string | null => {
            if (!date) return null;
            const d = typeof date === 'string' ? new Date(date) : date;
            if (isNaN(d.getTime())) return null;
            const year = d.getFullYear();
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            const day = d.getDate().toString().padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // Extract project code/name (in case value is object from autocomplete)
        const projectNoVal = formData.projectNo;
        const projectNameVal = formData.projectName;
        const projectNoStr = typeof projectNoVal === 'object' && projectNoVal?.code
            ? projectNoVal.code
            : String(projectNoVal ?? '');
        const projectNameStr = typeof projectNameVal === 'object' && projectNameVal?.name
            ? projectNameVal.name
            : String(projectNameVal ?? '');
        const furtherActionRequired = !!formData.furtherActionRequired;
        const raCaSatisfactory = !!formData.raCaSatisfactory && !furtherActionRequired;

        // Ensure sources and nonConformityTypes are properly formatted as enum arrays
        const processedFormData = {
            ...formData,
            projectNo: projectNoStr,
            projectName: projectNameStr,
            date: formatDateForAPI(formData.date),
            sources: this.sourcesArray.value.filter(source => source), // Remove empty values
            nonConformityTypes: this.nonConformityTypesArray.value.filter(type => type), // Remove empty values
            // Format date fields
            completedByDate: formData.completedByDate ? formatDateForAPI(formData.completedByDate) : null,
            acknowledgedByDate: formData.acknowledgedByDate ? formatDateForAPI(formData.acknowledgedByDate) : null,
            verifiedByDate: formData.verifiedByDate ? formatDateForAPI(formData.verifiedByDate) : null,
            approvedByDate: formData.approvedByDate ? formatDateForAPI(formData.approvedByDate) : null,
            // Convert boolean to 1/0
            responseTimeCheck: formData.responseTimeCheck ? 1 : 0,
            raCaSatisfactory: raCaSatisfactory ? 1 : 0,
            raCaSatisfactoryDescription: raCaSatisfactory
                ? (formData.raCaSatisfactoryDescription || '').trim()
                : '',
            furtherActionRequired: furtherActionRequired ? 1 : 0,
            furtherActionDescription: furtherActionRequired
                ? (formData.furtherActionDescription || '').trim()
                : ''
        };



        if (this.isEdit && this.carId) {
            // Transform camelCase to snake_case for API - matches the API documentation
            // When updating CAR, set all status fields to "pending"
            const apiPayload = {
                department: processedFormData.department,
                project_id: processedFormData.projectId,
                project_name: processedFormData.projectName,
                ref_no: processedFormData.refNo,
                project_no: processedFormData.projectNo,
                to: processedFormData.to,
                date: processedFormData.date,
                car_issued_by: processedFormData.carIssuedBy,
                sources: processedFormData.sources,
                other_source_description: processedFormData.otherSourceDescription || '',
                severity: processedFormData.severity,
                non_conformity_types: processedFormData.nonConformityTypes,
                non_conformity_description: processedFormData.nonConformityDescription,
                cause_of_non_conformity: '', // Filled in Complete By action request
                remedial_action: '',
                corrective_action: '',
                imr_comments: processedFormData.imrComments || '',
                completed_by: processedFormData.completedBy || '',
                completed_by_date: processedFormData.completedByDate,
                completed_by_status: 'pending',
                acknowledged_by: processedFormData.acknowledgedBy || '',
                acknowledged_by_date: processedFormData.acknowledgedByDate,
                acknowledged_by_status: 'pending',
                verified_by: processedFormData.verifiedBy || '',
                verified_by_date: null,
                verified_by_status: 'pending',
                verified_by_date_2: null,
                verified_by_status_2: null,
                approved_by: processedFormData.approvedBy || '',
                approved_by_date: processedFormData.approvedByDate,
                approved_by_status: 'pending',
                approve_by_date_2: null,
                approve_by_status_2: 'pending',
                approved_by_date_2: null,
                approved_by_status_2: 'pending',
                response_time_check: processedFormData.responseTimeCheck,
                ra_ca_satisfactory: processedFormData.raCaSatisfactory,
                ra_ca_satisfactory_description: processedFormData.raCaSatisfactoryDescription,
                further_action_required: processedFormData.furtherActionRequired,
                further_action_description: processedFormData.furtherActionDescription,
                attachments: []
            };

            this.carService.update(this.carId, apiPayload as any).subscribe({
                next: (response) => {
                    this.loading = false;
                    this.toastr.success('CAR updated successfully!');

                    setTimeout(() => {
                        this.router.navigate(['/cars']);
                    }, 1500);
                },
                error: (error) => {
                    this.loading = false;
                    this.toastr.error(
                        error.error?.message ||
                        'Failed to update CAR. Please try again.'
                    );
                },
            });
        } else {
            // Transform camelCase to snake_case for API - matches the API documentation
            // When creating new CAR, set all status fields to "pending"
            // Set default values for fields that should be done in action request
            // Get today's date in YYYY-MM-DD format
            const today = new Date();
            const todayString = formatDateForAPI(today);

            const apiPayload = {
                department: processedFormData.department,
                project_id: processedFormData.projectId,
                project_name: processedFormData.projectName,
                ref_no: processedFormData.refNo,
                project_no: processedFormData.projectNo,
                to: processedFormData.to,
                date: processedFormData.date,
                car_issued_by: processedFormData.carIssuedBy,
                sources: processedFormData.sources,
                other_source_description: processedFormData.otherSourceDescription || '',
                severity: processedFormData.severity,
                non_conformity_types: processedFormData.nonConformityTypes,
                non_conformity_description: processedFormData.nonConformityDescription,
                cause_of_non_conformity: '', // Filled in Complete By action request
                remedial_action: '',
                corrective_action: '',
                imr_comments: '-', // Default to "-" for new CAR, will be updated in action request
                completed_by: processedFormData.completedBy || '',
                completed_by_date: todayString, // Send today's date for new CAR
                completed_by_status: 'pending',
                acknowledged_by: processedFormData.acknowledgedBy || '',
                acknowledged_by_date: todayString, // Send today's date for new CAR
                acknowledged_by_status: 'pending',
                verified_by: processedFormData.verifiedBy || '',
                verified_by_date: null,
                verified_by_status: 'pending',
                verified_by_date_2: null,
                verified_by_status_2: null,
                approved_by: processedFormData.approvedBy || '',
                approved_by_date: todayString, // Send today's date for new CAR
                approved_by_status: 'pending',
                approve_by_date_2: null,
                approve_by_status_2: 'pending',
                approved_by_date_2: null,
                approved_by_status_2: 'pending',
                response_time_check: 0, // Default to 0 for new CAR
                ra_ca_satisfactory: 0, // Default to 0 for new CAR
                ra_ca_satisfactory_description: '',
                further_action_required: 0, // Default to 0 for new CAR
                further_action_description: '',
                attachments: []
            };

            this.carService.create(apiPayload as any).subscribe({
                next: (response) => {
                    this.loading = false;
                    this.toastr.success('CAR created successfully!');
                    this.sendInitialEmailNotification(apiPayload, response);

                    setTimeout(() => {
                        this.router.navigate(['/cars']);
                    }, 1500);
                },
                error: (error) => {
                    this.loading = false;
                    this.toastr.error(
                        error.error?.message ||
                        'Failed to create CAR. Please try again.'
                    );
                },
            });
        }
    }

    private sendInitialEmailNotification(apiPayload: any, response: any): void {
        const carId = this.workflowEmailNotificationService.readResponseId(response);
        const notificationSource = {
            ...this.workflowEmailNotificationService.createNotificationSource(apiPayload, response),
            id: carId
        };

        this.workflowEmailNotificationService
            .notifyInitialAction(CAR_EMAIL_CONFIG, notificationSource, carId)
            .subscribe({
                error: (error) => {
                    console.error('Failed to send CAR email notification:', error);
                    this.toastr.warning('CAR was saved, but email notification could not be sent.');
                }
            });
    }

    private markFormGroupTouched(): void {
        Object.keys(this.form.controls).forEach((key) => {
            const control = this.form.get(key);
            control?.markAsTouched();
        });
    }

    getErrorMessage(fieldName: string): string {
        const control = this.form.get(fieldName);
        if (control?.hasError('required')) {
            return `${this.getFieldLabel(fieldName)} is required`;
        }
        if (control?.hasError('minlength')) {
            return `${this.getFieldLabel(fieldName)} must be at least ${control.errors?.['minlength'].requiredLength} characters`;
        }
        return '';
    }

    private getFieldLabel(fieldName: string): string {
        const labels: { [key: string]: string } = {
            department: 'Department',
            projectName: 'Project Name',
            refNo: 'Ref No.',
            projectNo: 'Project No.',
            to: 'To',
            date: 'Date',
            carIssuedBy: 'CAR Issued By',
            sources: 'Sources',
            severity: 'Severity',
            nonConformityTypes: 'Non-Conformity Types',
            nonConformityDescription: 'Non-Conformity Description',
            causeOfNonConformity: 'Cause of Non-conformity',
            remedialAction: 'Remedial Action',
            correctiveAction: 'Corrective Action',
            dueDate: 'Due Date',
            completedBy: 'Completed By',
            completedDate: 'Completed Date',
            acknowledgedBy: 'Acknowledged By',
            acknowledgedDate: 'Acknowledged Date',
            verifiedBy: 'Verified By',
            verifiedDate: 'Verified Date',
            approvedBy: 'Approved By',
            approvedDate: 'Approved Date',
            imrComments: 'IMR Comments'
        };
        return labels[fieldName] || fieldName;
    }

    isFieldInvalid(fieldName: string): boolean {
        const control = this.form.get(fieldName);
        return !!(
            control &&
            control.invalid &&
            (control.dirty || control.touched)
        );
    }

    getSelectedSeverityDescription(): string {
        const severity = this.form.get('severity')?.value;
        const option = this.severityOptions.find(
            (opt) => opt.value === severity
        );
        return option?.description || '';
    }
}
