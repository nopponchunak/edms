import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, FormsModule, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Router, ActivatedRoute } from '@angular/router';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { ApiService } from 'app/core/services/api.service';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil, startWith } from 'rxjs/operators';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';
import { SUB_CONSULTANT_ASSESSMENT_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';

@Component({
  selector: 'app-sub-consultant-assessment-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatCheckboxModule,
    MatRadioModule,
    MatSelectModule,
    MatChipsModule,
    NgxMatSelectSearchModule,
    MatDialogModule
  ],
  templateUrl: './sub-consultant-assessment-form.component.html',
  styleUrls: ['./sub-consultant-assessment-form.component.scss']
})
export class SubConsultantAssessmentFormComponent implements OnInit, OnDestroy {
  form: FormGroup;
  isSubmitting = false;
  isLoading = false;
  isEditMode = false;
  currentId: string | null = null;

  // Employees from API
  users: EmployeeOption[] = [];
  filteredAssessedUsers: EmployeeOption[] = [];
  filteredApprovedUsers: EmployeeOption[] = [];
  filteredAcknowledgedUsers: EmployeeOption[] = [];

  // Search controls
  assessedSearchCtrl = new FormControl('');
  approvedSearchCtrl = new FormControl('');
  acknowledgedSearchCtrl = new FormControl('');

  // Cache for all loaded employees to support autocomplete persistence
  allLoadedEmployees: Map<string, EmployeeOption> = new Map();

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  // Information used for Assessment options
  assessmentInformationOptions = [
    'Company Profile / Biodata',
    'Project Reference / Certificates',
    'Site Visit',
    'Previous Assessment Record',
    'Previous Evaluation Record',
    'ISO Certificates'
  ];

  // Assessment areas with criteria (match form image)
  assessmentAreas = [
    {
      name: 'Experience since establishment',
      criteria: ['1-2', '3-5', '6-10', '10 + years']
    },
    {
      name: 'Fully qualified staff',
      criteria: ['1-4', '5-10', '11-50', '50 + Persons']
    },
    {
      name: 'Satisfactory completed projects similar to that MTL would use them for',
      criteria: ['0-1', '2-4', '5-10', '10+Projects']
    }
  ];

  private informationUsedKeyMap: Record<string, string> = {
    'Company Profile / Biodata': 'companyProfileBiodata',
    'Project Reference / Certificates': 'projectReferenceCertificates',
    'Site Visit': 'siteVisit',
    'Previous Assessment Record': 'previousAssessmentRecord',
    'Previous Evaluation Record': 'previousEvaluationRecord',
    'ISO Certificates': 'isoCertificates'
  };

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private apiService: ApiService,
    private employeeService: EmployeeService,
    private dialog: MatDialog,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private fuseConfirmationService: FuseConfirmationService,
    private toastr: ToastrService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    this.initializeForm();
    this.loadUsers();
    this.setupAutoAccept();
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

        // Initialize filtered arrays - แสดงทั้งหมดไม่ต้อง filter
        this.filteredAssessedUsers = this.users;
        this.filteredApprovedUsers = this.users;
        this.filteredAcknowledgedUsers = this.users;

        // Default Assessed By to logged-in user when creating new (not edit)
        if (!this.isEditMode) {
          const userCode = getCurrentUserCode();
          if (userCode && !this.form.get('assessedBy')?.value) {
            this.form.patchValue({ assessedBy: userCode });
          }
        }

        // Setup search filters
        this.setupSearchFilters();
      },
      error: (error) => {
        console.error('Error loading employees:', error);
        this.users = [];
        this.filteredAssessedUsers = [];
        this.filteredApprovedUsers = [];
        this.filteredAcknowledgedUsers = [];
      }
    });
  }

  private setupSearchFilters(): void {
    // Assessed By search - ใช้ API search และ filter DI/TL
    this.assessedSearchCtrl.valueChanges
      .pipe(
        startWith(''),
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
          this.form.get('assessedBy')?.value,
          (val) => this.filteredAssessedUsers = val
        );
      });

    // Approved By search - ใช้ API search และ filter MD/DI
    this.approvedSearchCtrl.valueChanges
      .pipe(
        startWith(''),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          const searchTerm = term ? term.toString().trim() : '';
          return this.employeeService.getEmployeeOptions(searchTerm, 100);
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

    // Acknowledged By search - ใช้ API search และ filter MR
    this.acknowledgedSearchCtrl.valueChanges
      .pipe(
        startWith(''),
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

  private createForm(): FormGroup {
    return this.fb.group({
      // Header
      to: ['Meinhardt (Thailand) Ltd.', [Validators.required]],
      circ: ['/AM/T&SC', [Validators.required]],
      form_code: [null], // ไม่แสดงในฟอร์ม ส่ง null ไป API

      // Scope of service required
      scopeOfService: ['', [Validators.required]],

      informationUsedForAssessment: this.fb.group({
        companyProfileBiodata: [false],
        projectReferenceCertificates: [false],
        siteVisit: [false],
        previousAssessmentRecord: [false],
        previousEvaluationRecord: [false],
        isoCertificates: [false]
      }),

      // Assessment (Item 1) - Company
      company: ['', [Validators.required]],

      // Individual score fields
      scoreExperienceSinceEstablishment: [0, [Validators.required, Validators.min(0), Validators.max(10)]],
      scoreFullyQualifiedStaff: [0, [Validators.required, Validators.min(0), Validators.max(10)]],
      scoreCompletedSimilarProjects: [0, [Validators.required, Validators.min(0), Validators.max(10)]],

      // Compliance to EMS and OHSMS (Item 2)
      complianceEmsOhsms: ['no'],
      emsIso14001: [false],
      emsOhsas18001: [false],
      emsIso45001: [false],

      // References (Item 3)
      references: this.fb.array([]),

      // Recommendation
      recommendation: ['', [Validators.required]],
      recommendationReason: [''],

      // Assessment and Approval
      assessedBy: ['', [Validators.required]],

      // Approval
      approvedBy: ['', [Validators.required]],

      // Acknowledgment
      acknowledgedBy: ['', [Validators.required]],

      // Documents
      documents: this.fb.group({
          attachments: this.fb.array([])
      }),

      status: ['draft']
    });
  }

  private initializeForm(): void {
    // Check if we're in edit mode
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.isEditMode = true;
        this.currentId = params['id'];
        this.loadAssessment(params['id']);
      }
    });

    // Set default values
    this.form.patchValue({
      status: 'draft'
    });

    // Initialize references array
    this.initializeReferences();
  }

  private initializeReferences(): void {
    const referencesArray = this.form.get('references') as FormArray;
    // Initialize with 2 references (optional - ไม่ require)
    for (let i = 0; i < 2; i++) {
      referencesArray.push(this.fb.group({
        seq: [i + 1],
        reference_name: [''],
        opinion: ['']
      }));
    }
  }

  private loadAssessment(id: string): void {
    this.isLoading = true;
    this.apiService.getSubConsultantAssessment(id).subscribe({
      next: (response) => {
        if (response.status && response.data) {
          const data = response.data;

          // Helper to parse date string to Date object
          const parseDate = (dateString: string | null | undefined): Date | null => {
            if (!dateString) return null;
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? null : date;
          };

          // Map API response to form values
          this.form.patchValue({
            to: data.to || 'Meinhardt (Thailand) Ltd.',
            circ: data.circ || '/AM/T&SC',
            form_code: null,
            scopeOfService: data.scope_of_service || '',
            company: data.company || '',
            scoreExperienceSinceEstablishment: data.score_experience_since_establishment || 0,
            scoreFullyQualifiedStaff: data.score_fully_qualified_staff || 0,
            scoreCompletedSimilarProjects: data.score_completed_similar_projects || 0,
            emsIso14001: data.ems_iso_14001 === 1,
            emsOhsas18001: data.ems_ohsas_18001 === 1,
            emsIso45001: data.ems_iso_45001 === 1,
            complianceEmsOhsms: (data.ems_iso_14001 === 1 || data.ems_ohsas_18001 === 1 || data.ems_iso_45001 === 1) ? 'yes' : 'no',
            recommendation: data.recommendation || '',
            recommendationReason: data.recommendation_reason || '',
            assessedBy: data.assessed_by || '',
            approvedBy: data.approved_by || '',
            acknowledgedBy: data.acknowledged_by || '',
            status: data.status || 'draft',
            informationUsedForAssessment: {
              companyProfileBiodata: data.info_company_profile_biodata === 1,
              projectReferenceCertificates: data.info_project_reference_certificates === 1,
              siteVisit: data.info_site_visit === 1,
              previousAssessmentRecord: data.info_previous_assessment_record === 1,
              previousEvaluationRecord: data.info_previous_evaluation_record === 1,
              isoCertificates: data.info_iso_certificates === 1
            }
          });

          // Load references
          const referencesArray = this.form.get('references') as FormArray;
          referencesArray.clear();
          if (data.references && Array.isArray(data.references)) {
            data.references.forEach((ref: any) => {
              const opinion = ref.opinion === 'good' ? 'positive' : ref.opinion === 'poor' ? 'negative' : (ref.opinion || '');
              referencesArray.push(this.fb.group({
                seq: [ref.seq || referencesArray.length + 1],
                reference_name: [ref.reference_name || ''],
                opinion: [opinion]
              }));
            });
          } else {
            // Initialize with 2 empty references if none exist
            this.initializeReferences();
          }

          // Load files
          const attachmentsArray = this.attachmentsArray;
          attachmentsArray.clear();
          if (data.files && Array.isArray(data.files)) {
              data.files.forEach((file: any) => {
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

          this.isLoading = false;
        } else {
          this.toastr.error(response.message || 'Failed to load assessment');
          this.isLoading = false;
        }
      },
      error: (error) => {
        console.error('Error loading assessment:', error);
        this.toastr.error(error?.error?.message || 'Failed to load assessment. Please try again.');
        this.isLoading = false;
      }
    });
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
        ? 'Are you sure you want to update this assessment?'
        : 'Are you sure you want to submit this assessment?',
      icon: {
        show: true,
        name: 'heroicons_outline:question-mark-circle',
        color: 'primary',
      },
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

      // Build references array: map UI opinion (positive/neutral/negative) to API (good/neutral/poor)
      const opinionToApi = (v: string) => v === 'positive' ? 'good' : v === 'negative' ? 'poor' : v || '';
      const references = this.referencesArray.value
        .filter((ref: any) => ref.reference_name && ref.opinion)
        .map((ref: any, index: number) => ({
          seq: ref.seq || index + 1,
          reference_name: ref.reference_name,
          opinion: opinionToApi(ref.opinion),
        }));

      // Date formatter
      const formatDateForAPI = (date: Date | string | null | undefined): string | null => {
        if (!date) return null;
        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return null;
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      // API payload (snake_case) – matches backend structure (no file upload on this form)
      const apiPayload: any = {
        to: formData.to || 'Meinhardt (Thailand) Ltd.',
        circ: formData.circ || '/AM/T&SC',
        scope_of_service: formData.scopeOfService || '',
        form_code: null,
        company: formData.company || '',

        // Information Used for Assessment (checkbox values)
        info_company_profile_biodata: formData.informationUsedForAssessment?.companyProfileBiodata ? 1 : 0,
        info_project_reference_certificates: formData.informationUsedForAssessment?.projectReferenceCertificates ? 1 : 0,
        info_site_visit: formData.informationUsedForAssessment?.siteVisit ? 1 : 0,
        info_previous_assessment_record: formData.informationUsedForAssessment?.previousAssessmentRecord ? 1 : 0,
        info_previous_evaluation_record: formData.informationUsedForAssessment?.previousEvaluationRecord ? 1 : 0,
        info_iso_certificates: formData.informationUsedForAssessment?.isoCertificates ? 1 : 0,

        score_experience_since_establishment: formData.scoreExperienceSinceEstablishment || 0,
        score_fully_qualified_staff: formData.scoreFullyQualifiedStaff || 0,
        score_completed_similar_projects: formData.scoreCompletedSimilarProjects || 0,
        ems_iso_14001: formData.complianceEmsOhsms === 'yes' && formData.emsIso14001 ? 1 : 0,
        ems_ohsas_18001: formData.complianceEmsOhsms === 'yes' && formData.emsOhsas18001 ? 1 : 0,
        ems_iso_45001: formData.complianceEmsOhsms === 'yes' && formData.emsIso45001 ? 1 : 0,
        recommendation: formData.recommendation || '',
        recommendation_reason: formData.recommendationReason || '',
        assessed_by: formData.assessedBy || '',
        assessed_by_status: 'pending',
        approved_by: formData.approvedBy || '',
        approved_by_status: 'pending',
        acknowledged_by: formData.acknowledgedBy || '',
        acknowledged_by_status: 'pending',
        status: formData.status || 'submitted',
        references: references,
        files: this.attachmentsArray.value
            .filter((att: any) => att.file_path || att.path)
            .map((att: any) => ({
                name: att.file_name || att.name,
                path: att.file_path || att.path
            })),
      };



      const apiCall = this.isEditMode && this.currentId
        ? this.apiService.updateSubConsultantAssessment(this.currentId, apiPayload)
        : this.apiService.createSubConsultantAssessment(apiPayload);

      apiCall.subscribe({
        next: (response) => {
          this.isSubmitting = false;
          if (response?.status) {
            this.toastr.success(
              response.message ||
              (this.isEditMode ? 'Assessment updated successfully!' : 'Assessment created successfully!')
            );
            if (!this.isEditMode) {
              this.sendInitialEmailNotification(apiPayload, response);
            }
            setTimeout(() => {
              this.router.navigate(['/sub-consultant-assessment']);
            }, 2000);
          } else {
            this.toastr.error(response?.message || 'Failed to submit assessment.');
          }
        },
        error: (error) => {
          console.error('Error submitting sub-consultant assessment:', error);
          this.isSubmitting = false;
          this.toastr.error(error?.error?.message || 'Failed to submit assessment. Please try again.');
        },
      });
  }

  private sendInitialEmailNotification(apiPayload: any, response: any): void {
    const assessmentId = this.workflowEmailNotificationService.readResponseId(response);
    const notificationSource = {
      ...this.workflowEmailNotificationService.createNotificationSource(apiPayload, response),
      id: assessmentId
    };

    this.workflowEmailNotificationService
      .notifyInitialAction(SUB_CONSULTANT_ASSESSMENT_EMAIL_CONFIG, notificationSource, assessmentId)
      .subscribe({
        error: (error) => {
          console.error('Failed to send sub-consultant assessment email notification:', error);
          this.toastr.warning('Assessment was saved, but email notification could not be sent.');
        }
      });
  }

  onCancel(): void {
    this.router.navigate(['/sub-consultant-assessment']);
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
    if (field?.hasError('required')) {
      return `This field is required`;
    }
    if (field?.hasError('min')) {
      return `Value must be at least ${field.errors?.['min'].min}`;
    }
    if (field?.hasError('max')) {
      return `Value must be at most ${field.errors?.['max'].max}`;
    }
    return '';
  }

  // Getters for form arrays
  get referencesArray(): FormArray {
    return this.form.get('references') as FormArray;
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

  get informationUsedGroup(): FormGroup {
    return this.form.get('informationUsedForAssessment') as FormGroup;
  }

  getInformationUsedControl(optionLabel: string): FormControl {
    const key = this.informationUsedKeyMap[optionLabel];
    return key ? (this.informationUsedGroup.get(key) as FormControl) : this.fb.control(false);
  }

  getScoreControl(index: number): FormControl {
    const keys = ['scoreExperienceSinceEstablishment', 'scoreFullyQualifiedStaff', 'scoreCompletedSimilarProjects'];
    return this.form.get(keys[index]) as FormControl;
  }

  get totalScore(): number {
    return this.calculateTotalScore();
  }

  onScoreChange(): void {
    this.tryAutoAccept();
  }

  private setupAutoAccept(): void {
    this.referencesArray.valueChanges.pipe(takeUntil(this._unsubscribeAll)).subscribe(() => {
      this.tryAutoAccept();
    });
  }

  private tryAutoAccept(): void {
    if (this.canBeAccepted && this.form.get('recommendation')?.value !== 'accept') {
      this.form.patchValue({ recommendation: 'accept' }, { emitEvent: false });
    }
  }

  // Calculate total score
  calculateTotalScore(): number {
    const score1 = this.form.get('scoreExperienceSinceEstablishment')?.value || 0;
    const score2 = this.form.get('scoreFullyQualifiedStaff')?.value || 0;
    const score3 = this.form.get('scoreCompletedSimilarProjects')?.value || 0;
    return score1 + score2 + score3;
  }

  // Check if meets minimum criteria
  get meetsMinimumScore(): boolean {
    return this.calculateTotalScore() >= 15;
  }

  // Check if has positive reference (opinion = positive)
  get hasPositiveReference(): boolean {
    const references = this.referencesArray;
    return references.controls.some(control =>
      control.get('opinion')?.value === 'positive'
    );
  }

  // Check if can be accepted
  get canBeAccepted(): boolean {
    return this.meetsMinimumScore;
  }

  // Helper methods for conditional validation
  get isRecommendationAccept(): boolean {
    return this.form.get('recommendation')?.value === 'accept';
  }

  get isRecommendationNotAccept(): boolean {
    return this.form.get('recommendation')?.value === 'not_accept';
  }

  getEmployeeName(id: string): string {
    const employee = this.users.find(emp => emp.code === id || emp.id === id);
    return employee ? employee.displayLabel : '';
  }

  getReferenceLabel(index: number): string {
    return String.fromCharCode(97 + index);
  }

  private getMissingRequiredFieldLabels(): string[] {
    const fieldLabels: Record<string, string> = {
      scopeOfService: 'Scope of Service',
      company: 'Company',
      scoreExperienceSinceEstablishment: 'Experience Since Establishment Score',
      scoreFullyQualifiedStaff: 'Fully Qualified Staff Score',
      scoreCompletedSimilarProjects: 'Completed Similar Projects Score',
      recommendation: 'Recommendation',
      assessedBy: 'Assessed By',
      approvedBy: 'Approved By',
      acknowledgedBy: 'Acknowledged By'
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
