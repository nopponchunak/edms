import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, FormsModule, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Router, ActivatedRoute } from '@angular/router';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { SupplierEvaluationService } from 'app/core/services/supplier-evaluation.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ApiService } from 'app/core/services/api.service';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { SuppliersService, SupplierOption } from 'app/core/services/suppliers.service';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { SUPPLIER_EVALUATION_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { startWith, map, shareReplay, debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { Observable, of, BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from 'app/core/services/auth.service';
import { ExternalProject, ExternalProjectService } from 'app/core/services/external-project.service';

@Component({
  selector: 'app-supplier-evaluation-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatDialogModule,
    MatSelectModule,
    MatAutocompleteModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './supplier-evaluation-form.component.html',
  styleUrls: ['./supplier-evaluation-form.component.scss']
})
export class SupplierEvaluationFormComponent implements OnInit {
  form: FormGroup;
  isSubmitting = false;
  isEditMode = false;
  isView = false;
  currentId: string | null = null;

  // Cache for all loaded employees to support autocomplete persistence
  allLoadedEmployees: Map<string, EmployeeOption> = new Map();

  // Users for select search
  users: EmployeeOption[] = [];
  filteredEvaluatedUsers: EmployeeOption[] = [];
  filteredApprovedUsers: EmployeeOption[] = [];
  filteredAcknowledgedUsers: EmployeeOption[] = [];

  // Search controls
  evaluatedSearchCtrl = new FormControl('');
  approvedSearchCtrl = new FormControl('');
  acknowledgedSearchCtrl = new FormControl('');
  projectSearchCtrl = new FormControl('');

  // Suppliers for autocomplete
  suppliers: SupplierOption[] = [];
  suppliers$ = new BehaviorSubject<SupplierOption[]>([]);
  filteredSuppliers$: Observable<SupplierOption[]>;

  // Project details from ExternalProjectService
  filteredProjectOptions: ExternalProject[] = [];

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    private supplierEvaluationService: SupplierEvaluationService,
    private apiService: ApiService,
    private projectService: ExternalProjectService,
    private employeeService: EmployeeService,
    private suppliersService: SuppliersService,
    private authService: AuthService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private fuseConfirmationService: FuseConfirmationService,
    private toastr: ToastrService
  ) {
    this.form = this.createForm();

    // Setup filtered suppliers observable - combine form value changes with suppliers list
    this.filteredSuppliers$ = combineLatest([
      this.form.get('supplierName')!.valueChanges.pipe(startWith('')),
      this.suppliers$
    ]).pipe(
      map(([searchValue, suppliers]) => {
        const search = typeof searchValue === 'string' ? searchValue : '';
        return this._filterSuppliers(search, suppliers);
      }),
      shareReplay(1)
    );

  }

  ngOnInit(): void {
    this.initializeForm();
    this.loadUsers();
    this.loadSuppliers();
    this.setupProjectSearch();
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

  private createForm(): FormGroup {
    return this.fb.group({
      // Supplier and Project Information
      supplierName: ['', [Validators.required]],
      projectId: [null],
      projectName: [''],
      projectNo: [''],
      departmentValueDuration: [''],

      // Anti-Corruption Compliance
      antiCorruptionCompliance: [''],

      // Evaluation Ratings and Comments
      qualityRating: [0, [Validators.min(0), Validators.max(10)]],
      qualityComment: [''],
      timelinessRating: [0, [Validators.min(0), Validators.max(10)]],
      timelinessComment: [''],
      understandingRating: [0, [Validators.min(0), Validators.max(10)]],
      understandingComment: [''],
      cooperationRating: [0, [Validators.min(0), Validators.max(10)]],
      cooperationComment: [''],
      deliveryRating: [0, [Validators.min(0), Validators.max(10)]],
      deliveryComment: [''],
      productQualityRating: [0, [Validators.min(0), Validators.max(10)]],
      productQualityComment: [''],
      emsRating: [0, [Validators.min(0), Validators.max(10)]],
      emsComment: [''],
      othersRating: [0, [Validators.min(0), Validators.max(10)]],
      othersComment: [''],

      // Average
      averageRating: [0, [Validators.required, Validators.min(0), Validators.max(10)]],
      averageComment: [''],

      // Decision
      decision: [''],

      // Documents
      documents: this.fb.group({
        attachments: this.fb.array([])
      }),

      // Signatures
      evaluatedBy: ['', Validators.required],
      evaluatedDate: [new Date()],
      approvedBy: ['', Validators.required],
      approvedDate: [new Date()],
      acknowledgedBy: ['', Validators.required],
      acknowledgedDate: [new Date()],

      // Status
      status: ['draft']
    });
  }

  private initializeForm(): void {
    // Check if we're in edit mode
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.isEditMode = true;
        this.currentId = params['id'];
        this.loadEvaluation(params['id']);
      }
    });

    // Set default values
    this.form.patchValue({
      status: 'draft'
    });

    // Setup auto-calculation for average rating and decision
    this.setupAutoCalculation();
  }

  /**
   * Setup listeners for auto-calculating average rating and decision
   */
  private setupAutoCalculation(): void {
    // List of all rating fields
    const ratingFields = [
      'qualityRating',
      'timelinessRating',
      'understandingRating',
      'cooperationRating',
      'deliveryRating',
      'productQualityRating',
      'emsRating',
      'othersRating'
    ];

    // Listen to changes in all rating fields
    ratingFields.forEach(field => {
      this.form.get(field)?.valueChanges.subscribe(() => {
        this.calculateAverageRating();
      });
    });

    // Listen to average rating changes to update decision
    this.form.get('averageRating')?.valueChanges.subscribe(() => {
      this.updateDecision();
    });

    // Make averageRating field readonly (but still send value to API)
    this.form.get('averageRating')?.disable();
  }

  /**
   * Calculate average rating from all 8 rating fields
   */
  private calculateAverageRating(): void {
    const ratings = [
      this.form.get('qualityRating')?.value || 0,
      this.form.get('timelinessRating')?.value || 0,
      this.form.get('understandingRating')?.value || 0,
      this.form.get('cooperationRating')?.value || 0,
      this.form.get('deliveryRating')?.value || 0,
      this.form.get('productQualityRating')?.value || 0,
      this.form.get('emsRating')?.value || 0,
      this.form.get('othersRating')?.value || 0
    ];

    // Calculate average
    const sum = ratings.reduce((acc, rating) => {
      const num = parseFloat(rating) || 0;
      return acc + num;
    }, 0);
    const average = sum / 8;

    // Update average rating (enable temporarily to set value, then disable again)
    const averageControl = this.form.get('averageRating');
    if (averageControl) {
      averageControl.enable({ emitEvent: false });
      averageControl.setValue(parseFloat(average.toFixed(2)), { emitEvent: false });
      averageControl.disable({ emitEvent: false });
    }

    // Update decision based on average
    this.updateDecision();
  }

  /**
   * Auto-update decision based on average rating
   * ≥ 5 = maintain, < 5 = remove
   */
  private updateDecision(): void {
    const averageRating = parseFloat(this.form.get('averageRating')?.value) || 0;
    const decision = averageRating >= 5 ? 'maintain' : 'remove';

    this.form.get('decision')?.setValue(decision, { emitEvent: false });
  }

  private loadEvaluation(id: string): void {
    this.isSubmitting = true;

    this.supplierEvaluationService.findOne(id).subscribe({
      next: (data) => {
        // Map items array to form fields
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
          // Map each item to corresponding form field
          const itemMap: { [key: string]: { rating: string; comment: string } } = {
            'Quality and Accuracy of Document': { rating: 'qualityRating', comment: 'qualityComment' },
            'Timeliness of Documentation': { rating: 'timelinessRating', comment: 'timelinessComment' },
            'Understanding of MTL\'s Needs': { rating: 'understandingRating', comment: 'understandingComment' },
            'Cooperation and Responsiveness of Frontline Staff': { rating: 'cooperationRating', comment: 'cooperationComment' },
            'Timeliness of Delivery': { rating: 'deliveryRating', comment: 'deliveryComment' },
            'Quality of Products': { rating: 'productQualityRating', comment: 'productQualityComment' },
            'Meet EMS / OHSMS Requirements': { rating: 'emsRating', comment: 'emsComment' },
            'Others': { rating: 'othersRating', comment: 'othersComment' }
          };

          data.items.forEach((item: any) => {
            const mapping = itemMap[item.item_name];
            if (mapping) {
              this.form.patchValue({
                [mapping.rating]: item.rating || 0,
                [mapping.comment]: item.comment || ''
              }, { emitEvent: false });
            }
          });
        }

        // Parse dates
        const evaluatedDate = data.evaluatedDate ? new Date(data.evaluatedDate) : null;
        const approvedDate = data.approvedDate ? new Date(data.approvedDate) : null;
        const acknowledgedDate = data.acknowledgedDate ? new Date(data.acknowledgedDate) : null;

        // Patch form with data
        this.form.patchValue({
          supplierName: data.supplierName || '',
          projectId: data.project_id,
          projectName: data.projectName || '',
          projectNo: data.projectNo || '',
          departmentValueDuration: data.departmentValueDuration || '',
          antiCorruptionCompliance: data.antiCorruptionFlag ? true : false,
          averageRating: data.averageRating || 0,
          decision: data.decision || 'maintain',
          evaluatedBy: data.evaluatedBy || '',
          evaluatedDate: evaluatedDate,
          approvedBy: data.approvedBy || '',
          approvedDate: approvedDate,
          acknowledgedBy: data.acknowledgedBy || '',
          acknowledgedDate: acknowledgedDate
        }, { emitEvent: false });

        // Recalculate average and decision after patching
        this.calculateAverageRating();

        this.isSubmitting = false;
      },
      error: (error) => {
        console.error('Error loading supplier evaluation:', error);
        this.isSubmitting = false;
        this.toastr.error(error?.error?.message || 'Failed to load evaluation. Please try again.');
        // Navigate back to list after error
        setTimeout(() => {
          this.router.navigate(['/supplier-evaluation']);
        }, 3000);
      }
    });
  }

  onSubmit(): void {
    if (this.isSubmitting) return;

    if (!this.form.valid) {
      this.markFormGroupTouched();
      const missingLabels = this.getMissingRequiredFieldLabels();
      this.toastr.error(
        missingLabels.length > 0
          ? `Please fill in required fields: ${missingLabels.join(', ')}`
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
    this.isSubmitting = true;

      // Get raw form values (includes disabled fields)
      const formData = this.form.getRawValue();

      // Map form fields to items array
      const items = [
        {
          item_name: 'Quality and Accuracy of Document',
          rating: formData.qualityRating || 0,
          comment: formData.qualityComment || ''
        },
        {
          item_name: 'Timeliness of Documentation',
          rating: formData.timelinessRating || 0,
          comment: formData.timelinessComment || ''
        },
        {
          item_name: 'Understanding of MTL\'s Needs',
          rating: formData.understandingRating || 0,
          comment: formData.understandingComment || ''
        },
        {
          item_name: 'Cooperation and Responsiveness of Frontline Staff',
          rating: formData.cooperationRating || 0,
          comment: formData.cooperationComment || ''
        },
        {
          item_name: 'Timeliness of Delivery',
          rating: formData.deliveryRating || 0,
          comment: formData.deliveryComment || ''
        },
        {
          item_name: 'Quality of Products',
          rating: formData.productQualityRating || 0,
          comment: formData.productQualityComment || ''
        },
        {
          item_name: 'Meet EMS / OHSMS Requirements',
          rating: formData.emsRating || 0,
          comment: formData.emsComment || ''
        },
        {
          item_name: 'Others',
          rating: formData.othersRating || 0,
          comment: formData.othersComment || ''
        }
      ];

      // Get average rating and decision values
      const averageRatingValue = formData.averageRating || 0;
      const decisionValue = formData.decision || 'maintain';

      const attachmentsPaths = (this.attachmentsArray?.value || [])
        .map((a: { file_path?: string }) => a?.file_path)
        .filter((p: string | undefined): p is string => !!p)
        .map((p: string) => p.startsWith('/') ? p : `/${p}`);
      // Build API payload
      // Note: formData.evaluatedBy, formData.approvedBy, formData.acknowledgedBy contain the code (string)
      // because in HTML template we use [value]="user.id" where user.id is the code
      const apiPayload = {
        supplier_name: formData.supplierName,
        project_id: formData.projectId,
        project_name: formData.projectName || '',
        project_no: formData.projectNo || '',
        department_value_duration: formData.departmentValueDuration || '',
        anti_corruption_flag: (formData.antiCorruptionCompliance === true || formData.antiCorruptionCompliance === 'true') ? 1 : 0,
        items: items,
        average_rating: averageRatingValue,
        decision: decisionValue,
        evaluated_by: (formData.evaluatedBy && formData.evaluatedBy.trim() !== '') ? formData.evaluatedBy : null,
        evaluated_by_date: formData.evaluatedDate ? this.formatDate(formData.evaluatedDate) : null,
        evaluated_by_status: 'pending',
        approved_by: (formData.approvedBy && formData.approvedBy.trim() !== '') ? formData.approvedBy : null,
        approved_by_date: formData.approvedDate ? this.formatDate(formData.approvedDate) : null,
        approved_by_status: null,
        acknowledged_by: (formData.acknowledgedBy && formData.acknowledgedBy.trim() !== '') ? formData.acknowledgedBy : null,
        acknowledged_by_date: formData.acknowledgedDate ? this.formatDate(formData.acknowledgedDate) : null,
        acknowledged_by_status: null,
        attachments: attachmentsPaths
      };



      if (this.isEditMode && this.currentId) {
        // Update existing evaluation
        this.supplierEvaluationService.update(this.currentId, apiPayload).subscribe({
          next: (response) => {
            this.isSubmitting = false;
            this.toastr.success('Evaluation updated successfully!');

            // Navigate back to list after a short delay
            setTimeout(() => {
              this.router.navigate(['/supplier-evaluation']);
            }, 2000);
          },
          error: (error) => {
            console.error('Error updating supplier evaluation:', error);
            this.isSubmitting = false;
            this.toastr.error(error?.error?.message || 'Failed to update evaluation. Please try again.');
          }
        });
      } else {
        // Create new evaluation
        this.supplierEvaluationService.create(apiPayload).subscribe({
          next: (response) => {
            this.isSubmitting = false;
            this.toastr.success('Evaluation created successfully!');
            this.sendInitialEmailNotification(apiPayload, response);

            // Navigate back to list after a short delay
            setTimeout(() => {
              this.router.navigate(['/supplier-evaluation']);
            }, 2000);
          },
          error: (error) => {
            console.error('Error creating supplier evaluation:', error);
            this.isSubmitting = false;
            this.toastr.error(error?.error?.message || 'Failed to create evaluation. Please try again.');
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
      .notifyInitialAction(SUPPLIER_EVALUATION_EMAIL_CONFIG, notificationSource, evaluationId)
      .subscribe({
        error: (error) => {
          console.error('Failed to send supplier evaluation email notification:', error);
          this.toastr.warning('Evaluation was saved, but email notification could not be sent.');
        }
      });
  }

  /**
   * Format date to YYYY-MM-DD for API
   */
  formatDate(date: Date | string): string {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const seconds = d.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  onCancel(): void {
    this.router.navigate(['/supplier-evaluation']);
  }

  private markFormGroupTouched(): void {
    Object.keys(this.form.controls).forEach(key => {
      const control = this.form.get(key);
      control?.markAsTouched();
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getErrorMessage(fieldName: string): string {
    const field = this.form.get(fieldName);
    if (field?.hasError('required')) return `${this.getFieldLabel(fieldName)} is required`;
    if (field?.hasError('min')) return `${this.getFieldLabel(fieldName)} must be at least ${field.errors?.['min'].min}`;
    if (field?.hasError('max')) return `${this.getFieldLabel(fieldName)} must be at most ${field.errors?.['max'].max}`;
    return '';
  }

  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      supplierName: 'Supplier Name',
      projectName: 'Project Name',
      projectNo: 'Project No.',
      evaluatedBy: 'Evaluated By',
      approvedBy: 'Approved By',
      acknowledgedBy: 'Acknowledged By'
    };
    return labels[fieldName] || fieldName;
  }

  private getMissingRequiredFieldLabels(): string[] {
    const fieldLabels: Record<string, string> = {
      supplierName: 'Supplier Name',
      evaluatedBy: 'Evaluated By',
      approvedBy: 'Approved By',
      acknowledgedBy: 'Acknowledged By'
    };
    return Object.entries(fieldLabels)
      .filter(([controlName]) => this.form.get(controlName)?.hasError('required'))
      .map(([_, label]) => label);
  }

  private scrollToFirstInvalidControl(): void {
    const firstInvalidName = Object.keys(this.form.controls).find(name => this.form.get(name)?.invalid);
    if (!firstInvalidName) return;

    const selector = `[formControlName="${firstInvalidName}"], #control-${firstInvalidName}`;
    const element = document.querySelector(selector);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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

  /**
   * Load users from API
   */
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
        this.filteredEvaluatedUsers = this.users;
        this.filteredApprovedUsers = this.users;
        this.filteredAcknowledgedUsers = this.users;

        this.patchDefaultEvaluator();
        this.patchDefaultAcknowledgedByMjr();

        // Setup search filters
        this.setupSearchFilters();
      },
      error: (error) => {
        console.error('Error loading employees:', error);
        this.toastr.error('Failed to load employees. Please try again.');
      }
    });
  }

  /**
   * Setup search filters for each select - ใช้ API search แบบ real-time
   */
  private setupSearchFilters(): void {
    // Evaluated By search - ใช้ API search
    this.evaluatedSearchCtrl.valueChanges
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
          this.form.get('evaluatedBy')?.value,
          (val) => this.filteredEvaluatedUsers = val
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
          this.form.get('approvedBy')?.value,
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
          this.form.get('acknowledgedBy')?.value,
          (val) => this.filteredAcknowledgedUsers = val
        );
      });
  }

  /**
   * Load suppliers from API
   */
  private loadSuppliers(): void {
    this.suppliersService.getSuppliers().subscribe({
      next: (suppliers) => {

        this.suppliers = suppliers;
        // Update BehaviorSubject to trigger filtering
        this.suppliers$.next(suppliers);
      },
      error: (error) => {
        console.error('Error loading suppliers:', error);
        this.toastr.error('Failed to load suppliers. Please try again.');
        // Initialize with empty array on error
        this.suppliers = [];
        this.suppliers$.next([]);
      }
    });
  }

  /**
   * Filter suppliers based on search term
   */
  private _filterSuppliers(value: string, suppliers: SupplierOption[]): SupplierOption[] {
    if (!value) {
      return suppliers;
    }
    const filterValue = value.toLowerCase();
    return suppliers.filter(supplier =>
      supplier.name.toLowerCase().includes(filterValue) ||
      (supplier.type && supplier.type.toLowerCase().includes(filterValue))
    );
  }

  private patchDefaultEvaluator(): void {
    if (this.isEditMode || (this.form.get('evaluatedBy')?.value && this.form.get('evaluatedBy')?.value !== '')) {
      return;
    }

    const userCode = getCurrentUserCode() ?? this.findEmployeeCodeByCurrentUser();
    if (!userCode) {
      return;
    }

    // Check if the user is in our current list
    const matchedUser = this.users.find((user) => user.code === userCode || String(user.id) === userCode);
    
    if (matchedUser) {
      this.form.patchValue({ evaluatedBy: matchedUser.code }, { emitEvent: false });
    } else {
      // If not in current list, try to fetch this specific user to ensure label shows correctly
      this.employeeService.getEmployeeOptions(userCode, 1).subscribe((res) => {
        if (res.length > 0) {
          const user = res[0];
          // Add to cache and filtered list
          this.allLoadedEmployees.set(user.code, user);
          if (user.id) this.allLoadedEmployees.set(String(user.id), user);
          
          this.updateFilteredUsers(
            [user],
            userCode,
            (val) => this.filteredEvaluatedUsers = val
          );
          
          this.form.patchValue({ evaluatedBy: user.code }, { emitEvent: false });
        }
      });
    }
  }

  private patchDefaultAcknowledgedByMjr(): void {
    const currentValue = this.form.get('acknowledgedBy')?.value;
    if (this.isEditMode || (currentValue && currentValue !== '')) {
      return;
    }

    const mjrUser = this.findMjrUser(this.users);
    if (mjrUser) {
      this.form.patchValue({ acknowledgedBy: mjrUser.id || mjrUser.code }, { emitEvent: false });
      this.updateFilteredUsers(
        this.filteredAcknowledgedUsers,
        mjrUser.id || mjrUser.code,
        (val) => this.filteredAcknowledgedUsers = val
      );
      return;
    }

    this.employeeService.getEmployeeOptions('MJR', 10).subscribe((res) => {
      const user = this.findMjrUser(res);
      if (!user) return;

      if (user.id) this.allLoadedEmployees.set(String(user.id), user);
      if (user.code) this.allLoadedEmployees.set(user.code, user);

      this.updateFilteredUsers(
        res,
        user.id || user.code,
        (val) => this.filteredAcknowledgedUsers = val
      );
      this.form.patchValue({ acknowledgedBy: user.id || user.code }, { emitEvent: false });
    });
  }

  private findMjrUser(users: EmployeeOption[]): EmployeeOption | undefined {
    return users.find((user) =>
      (user.initial || '').toUpperCase() === 'MJR' ||
      (user.code || '').toUpperCase() === 'MJR' ||
      (user.displayLabel || '').toUpperCase().includes('MJR')
    );
  }

  /**
   * Find employee code by current logged-in user (email match)
   */
  private findEmployeeCodeByCurrentUser(): string | null {
    const currentUser = this.authService.currentUserValue;
    if (!currentUser?.email || !this.users.length) return null;
    const match = this.users.find(u => (u.email || '').toLowerCase() === (currentUser.email || '').toLowerCase());
    return match ? match.code : null;
  }

}
