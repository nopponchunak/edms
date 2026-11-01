import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Router, ActivatedRoute } from '@angular/router';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { SupplierAssessmentService } from 'app/core/services/supplier-assessment.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { CreateSupplierRequest, SuppliersService } from 'app/core/services/suppliers.service';
import { SupplierType, SupplierTypeService } from 'app/core/services/supplier-type.service';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { SUPPLIER_ASSESSMENT_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-supplier-assessment-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatRadioModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatDialogModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './supplier-assessment-form.component.html',
  styleUrls: ['./supplier-assessment-form.component.scss']
})
export class SupplierAssessmentFormComponent implements OnInit, OnDestroy {
  form: FormGroup;
  isSubmitting = false;
  isEditMode = false;
  currentId: string | null = null;

  // Cache for all loaded employees to support autocomplete persistence
  allLoadedEmployees: Map<string, EmployeeOption> = new Map();

  // Users for select search
  users: EmployeeOption[] = [];
  filteredAssessedUsers: EmployeeOption[] = [];
  filteredApprovedUsers: EmployeeOption[] = [];
  filteredAcknowledgedUsers: EmployeeOption[] = [];

  // Search controls
  assessedSearchCtrl = new FormControl('');
  approvedSearchCtrl = new FormControl('');
  acknowledgedSearchCtrl = new FormControl('');
  supplierTypeSearchCtrl = new FormControl('');

  supplierTypes: SupplierType[] = [];
  filteredSupplierTypes: SupplierType[] = [];

  /** Preserved from load when editing; approval decision is made on action page. */
  private loadedApprovedToSupplierList: number | string = '-';
  private loadedRemark = '';

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    private supplierAssessmentService: SupplierAssessmentService,
    private employeeService: EmployeeService,
    private suppliersService: SuppliersService,
    private supplierTypeService: SupplierTypeService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private fuseConfirmationService: FuseConfirmationService,
    private toastr: ToastrService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    this.initializeForm();
    this.loadUsers();
    this.setupScoreCalculation();
    this.setupSupplierTypeSearch();
    this.loadSupplierTypes();
  }

  private loadSupplierTypes(): void {
    this.supplierTypeService.getAll().subscribe({
      next: (items) => {
        this.supplierTypes = items.filter((item) => Number(item.is_active ?? 1) === 1);
        this.updateFilteredSupplierTypes(this.supplierTypeSearchCtrl.value);
      },
      error: (error) => {
        console.error('Error loading supplier types:', error);
        this.supplierTypes = [];
        this.filteredSupplierTypes = [];
      }
    });
  }

  private setupSupplierTypeSearch(): void {
    this.supplierTypeSearchCtrl.valueChanges
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe((term) => {
        this.updateFilteredSupplierTypes(term);
      });
  }

  private updateFilteredSupplierTypes(searchValue: unknown): void {
    const search = String(searchValue ?? '').trim().toLowerCase();
    const selectedValue = this.form.get('itemsSupplied')?.value;
    let filtered = this.supplierTypes;

    if (search) {
      filtered = this.supplierTypes.filter((type) =>
        (type.code || '').toLowerCase().includes(search) ||
        (type.name || '').toLowerCase().includes(search) ||
        (type.detail || '').toLowerCase().includes(search)
      );
    }

    const selected = this.supplierTypes.find(
      (type) => type.name === selectedValue || type.code === selectedValue
    );

    if (selected && !filtered.some((type) => type.id === selected.id)) {
      filtered = [selected, ...filtered];
    }

    this.filteredSupplierTypes = filtered;
  }

  onSupplierTypeDropdownOpened(opened: boolean): void {
    if (opened) {
      this.supplierTypeSearchCtrl.setValue('');
    }
  }

  getSupplierTypeLabel(type: SupplierType): string {
    return type.name || '';
  }

  selectedSupplierTypeLabel(): string {
    const selectedValue = this.form.get('itemsSupplied')?.value;
    const selected = this.supplierTypes.find(
      (type) => type.name === selectedValue || type.code === selectedValue
    );

    return selected ? this.getSupplierTypeLabel(selected) : (selectedValue || '');
  }

  private createForm(): FormGroup {
    return this.fb.group({
      itemsSupplied: [''],
      companyProfile: [false],
      projectReference: [false],
      siteVisit: [false],
      previousAssessment: [false],
      previousEvaluation: [false],
      isoCertificates: [false],
      company: ['', Validators.required],
      experienceScore: [0, [Validators.min(1), Validators.max(10)]],
      staffScore: [0, [Validators.min(1), Validators.max(10)]],
      complianceScore: [0, [Validators.min(1), Validators.max(10)]],
      totalScore: [0, [Validators.required, Validators.min(0), Validators.max(30)]],
      reference1Name: [''],
      reference1Opinion: [''],
      reference2Name: [''],
      reference2Opinion: [''],
      recommendation: [''],
      reason: [''],
      documents: this.fb.group({
        attachments: this.fb.array([])
      }),
      assessedBy: ['', Validators.required],
      assessedDate: [new Date()],
      approvedBy: ['', Validators.required],
      approvedDate: [new Date()],
      acknowledgedBy: ['', Validators.required],
      acknowledgedDate: [new Date()],
      status: ['draft']
    });
  }

  private initializeForm(): void {
    this.form.patchValue({ status: 'draft' });
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.isEditMode = true;
        this.currentId = params['id'];
        this.loadAssessment(params['id']);
      } else {
        const userCode = getCurrentUserCode();
        if (userCode) {
          this.form.patchValue({ assessedBy: userCode });
        }
      }
    });
  }

  private loadAssessment(id: string): void {
    this.supplierAssessmentService.findOne(parseInt(id, 10)).subscribe({
      next: (assessment) => {
        const parseDate = (dateStr: string | Date | undefined): Date | null => {
          if (!dateStr) return null;
          if (dateStr instanceof Date) return dateStr;
          return new Date(dateStr);
        };

        this.form.patchValue({
          itemsSupplied: assessment.itemsSupplied || '',
          companyProfile: assessment.informationUsedForAssessment.includes('company_profile'),
          projectReference: assessment.informationUsedForAssessment.includes('project_reference'),
          siteVisit: assessment.informationUsedForAssessment.includes('site_visit'),
          previousAssessment: assessment.informationUsedForAssessment.includes('previous_assessment_record'),
          previousEvaluation: assessment.informationUsedForAssessment.includes('previous_evaluation_record'),
          isoCertificates: assessment.informationUsedForAssessment.includes('iso_certificates'),
          company: assessment.companyName || '',
          experienceScore: assessment.experienceScore || 0,
          staffScore: assessment.qualifiedStaffScore || 0,
          complianceScore: assessment.productComplianceScore || 0,
          reference1Name: assessment.references[0]?.name || '',
          reference1Opinion: assessment.references[0]?.opinion || '',
          reference2Name: assessment.references[1]?.name || '',
          reference2Opinion: assessment.references[1]?.opinion || '',
          recommendation: assessment.recommendation || '',
          reason: assessment.reason || '',
          assessedBy: assessment.assessedBy || '',
          assessedDate: parseDate(assessment.assessedDate),
          approvedBy: assessment.approvedBy || '',
          approvedDate: parseDate(assessment.approvedDate),
          acknowledgedBy: assessment.acknowledgedBy || '',
          acknowledgedDate: parseDate(assessment.acknowledgedDate),
          status: assessment.status || 'draft'
        }, { emitEvent: false });

        this.loadedApprovedToSupplierList = assessment.approvedForSupplierList === true ? 1 : '-';
        this.loadedRemark = assessment.approvedRemark || '';

        if (assessment.attachments && assessment.attachments.length > 0) {
          const arr = this.attachmentsArray;
          arr.clear();
          assessment.attachments.forEach((path: string) => {
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
        this.calculateTotalScore();
      },
      error: (error) => {
        console.error('Error loading supplier assessment:', error);
        this.toastr.error('Failed to load supplier assessment. Please try again.');
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
        ? 'Are you sure you want to update this assessment?'
        : 'Are you sure you want to submit this assessment?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: this.isEditMode ? 'Update' : 'Submit', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      if (this.isEditMode) {
        this.submitForm();
        return;
      }

      this.openAddToSupplierListDialog();
    });
  }

  private openAddToSupplierListDialog(): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Add to Supplier List?',
      message: 'Do you want to add this supplier to the Supplier List?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'No' },
        confirm: { show: true, label: 'Yes', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      this.submitForm(result === 'confirmed');
    });
  }

  private submitForm(addToSupplierList = false): void {
    this.isSubmitting = true;

    const formData = this.form.value;

      const attachmentsPaths = (this.attachmentsArray?.value || [])
        .map((a: { file_path?: string }) => a?.file_path)
        .filter((p: string | undefined): p is string => !!p)
        .map((p: string) => p.startsWith('/') ? p : `/${p}`);
      // Transform camelCase to snake_case for API
      const apiPayload = {
        items_supplied: formData.itemsSupplied || '',
        info_company_profile: formData.companyProfile ? 1 : 0,
        info_project_reference: formData.projectReference ? 1 : 0,
        info_site_visit: formData.siteVisit ? 1 : 0,
        info_previous_assessment_record: formData.previousAssessment ? 1 : 0,
        info_previous_evaluation_record: formData.previousEvaluation ? 1 : 0,
        info_iso_certificates: formData.isoCertificates ? 1 : 0,
        company_name: formData.company || '',
        experience_score: formData.experienceScore || 0,
        staff_score: formData.staffScore || 0,
        product_compliance_score: formData.complianceScore || 0,
        total_score: formData.totalScore || 0,
        reference_a_name: formData.reference1Name || '',
        reference_a_opinion: formData.reference1Opinion || '',
        reference_b_name: formData.reference2Name || '',
        reference_b_opinion: formData.reference2Opinion || '',
        recommendation: formData.recommendation || '',
        recommendation_reason: formData.reason || '',
        assessed_by: (formData.assessedBy && formData.assessedBy.trim() !== '') ? formData.assessedBy : null,
        assessed_by_date: null,
        assessed_by_status: (formData.assessedBy && formData.assessedBy.trim() !== '') ? 'pending' : null,
        assessed_date: formData.assessedDate ? this.formatDate(formData.assessedDate) : '',
        approved_to_supplier_list: this.isEditMode ? this.loadedApprovedToSupplierList : '-',
        remark: this.isEditMode ? this.loadedRemark : '',
        approved_by: (formData.approvedBy && formData.approvedBy.trim() !== '') ? formData.approvedBy : null,
        approved_by_date: null,
        approved_by_status: null,
        approved_date: formData.approvedDate ? this.formatDate(formData.approvedDate) : '',
        acknowledged_by: (formData.acknowledgedBy && formData.acknowledgedBy.trim() !== '') ? formData.acknowledgedBy : null,
        acknowledged_by_date: null,
        acknowledged_by_status: null,
        acknowledged_date: formData.acknowledgedDate ? this.formatDate(formData.acknowledgedDate) : '',
        attachments: attachmentsPaths
      };

      if (this.isEditMode && this.currentId) {
        this.supplierAssessmentService.update(parseInt(this.currentId, 10), apiPayload as any).subscribe({
          next: () => {
            this.isSubmitting = false;
            this.toastr.success('Assessment updated successfully!');

            // Navigate back to list after a short delay
            setTimeout(() => {
              this.router.navigate(['/supplier-assessment']);
            }, 1500);
          },
          error: (error) => {
            this.isSubmitting = false;
            this.toastr.error(error?.error?.message || 'Failed to update assessment. Please try again.');
          }
        });
      } else {
        this.supplierAssessmentService.create(apiPayload as any).subscribe({
          next: (response) => {
            this.toastr.success('Assessment created successfully!');
            this.sendInitialEmailNotification(apiPayload, response);

            if (addToSupplierList) {
              this.createSupplierFromAssessment(formData);
              return;
            }

            this.finishSubmissionWithNavigation();
          },
          error: (error) => {
            this.isSubmitting = false;
            this.toastr.error(error?.error?.message || 'Failed to create assessment. Please try again.');
          }
        });
      }
  }

  private createSupplierFromAssessment(formData: any): void {
    const payload = this.buildSupplierListPayload(formData);

    this.suppliersService.create(payload).subscribe({
      next: () => {
        this.toastr.success('Supplier added to Supplier List successfully!');
        this.finishSubmissionWithNavigation();
      },
      error: (error) => {
        console.error('Error adding supplier to Supplier List:', error);
        this.toastr.warning(
          error?.error?.message ||
          'Assessment was saved, but supplier could not be added to Supplier List.'
        );
        this.finishSubmissionWithNavigation();
      }
    });
  }

  private buildSupplierListPayload(formData: any): CreateSupplierRequest {
    return {
      type: formData.itemsSupplied || 'deposit',
      name: formData.company || '',
      status: 'Active',
      address: '-',
      phone: '-',
      email: '-',
      contact_person: formData.reference1Name || '-',
    };
  }

  private finishSubmissionWithNavigation(): void {
    this.isSubmitting = false;
    setTimeout(() => {
      this.router.navigate(['/supplier-assessment']);
    }, 1500);
  }

  private sendInitialEmailNotification(apiPayload: any, response: any): void {
    const assessmentId = this.workflowEmailNotificationService.readResponseId(response);
    const notificationSource = {
      ...this.workflowEmailNotificationService.createNotificationSource(apiPayload, response),
      id: assessmentId
    };

    this.workflowEmailNotificationService
      .notifyInitialAction(SUPPLIER_ASSESSMENT_EMAIL_CONFIG, notificationSource, assessmentId)
      .subscribe({
        error: (error) => {
          console.error('Failed to send supplier assessment email notification:', error);
          this.toastr.warning('Assessment was saved, but email notification could not be sent.');
        }
      });
  }

  private formatDate(date: Date | string): string {
    if (!date) return '';
    let dateObj: Date = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '';
    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    const hours = dateObj.getHours().toString().padStart(2, '0');
    const minutes = dateObj.getMinutes().toString().padStart(2, '0');
    const seconds = dateObj.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  onCancel(): void {
    this.router.navigate(['/supplier-assessment']);
  }

  private markFormGroupTouched(): void {
    Object.keys(this.form.controls).forEach(key => {
      this.form.get(key)?.markAsTouched();
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
      itemsSupplied: 'Item(s) supplied',
      company: 'Company',
      experienceScore: 'Experience Score',
      staffScore: 'Staff Score',
      complianceScore: 'Compliance Score',
      totalScore: 'Total Score',
      assessedBy: 'Assessed By',
      approvedBy: 'Approved By',
      acknowledgedBy: 'Acknowledged By'
    };
    return labels[fieldName] || fieldName;
  }

  private getMissingRequiredFieldLabels(): string[] {
    const fieldLabels: Record<string, string> = {
      company: 'Company',
      assessedBy: 'Assessed By',
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
    if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  get documentsFormGroup(): FormGroup { return this.form.get('documents') as FormGroup; }
  get attachmentsArray(): FormArray { return this.documentsFormGroup.get('attachments') as FormArray; }

  openUploadDialog(): void {
    const ref = this.dialog.open(FuseUploadDialogComponent, { width: '560px', data: {} });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      const results = Array.isArray(result) ? result : [result];
      results.forEach((item: any) => {
        this.attachmentsArray.push(this.fb.group({
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
        }));
      });
    });
  }

  removeAttachment(index: number): void { this.attachmentsArray.removeAt(index); }

  private loadUsers(): void {
    this.employeeService.getEmployeeOptions().subscribe({
      next: (employees) => {
        this.users = employees;
        employees.forEach(u => { if (u.code) this.allLoadedEmployees.set(u.code, u); });
        this.filteredAssessedUsers = this.users;
        this.filteredApprovedUsers = this.users;
        this.filteredAcknowledgedUsers = this.users;
        const currentAssessed = this.form.get('assessedBy')?.value;
        if (currentAssessed) this.updateFilteredUsers(employees, currentAssessed, (val) => this.filteredAssessedUsers = val);
        const currentApproved = this.form.get('approvedBy')?.value;
        if (currentApproved) this.updateFilteredUsers(employees, currentApproved, (val) => this.filteredApprovedUsers = val);

        if (!this.isEditMode) {
          const mjr = employees.find(u => u.code === 'MJR' || u.initial === 'MJR');
          if (mjr) {
            this.form.patchValue({ acknowledgedBy: mjr.code });
            this.updateFilteredUsers(employees, mjr.code, (val) => this.filteredAcknowledgedUsers = val);
          } else {
            this.employeeService.getEmployeeOptions('MJR', 1).subscribe(results => {
              if (results.length > 0) {
                const m = results[0];
                this.allLoadedEmployees.set(m.code, m);
                this.updateFilteredUsers([m, ...employees], m.code, (val) => this.filteredAcknowledgedUsers = val);
                this.form.patchValue({ acknowledgedBy: m.code });
              }
            });
          }
        } else {
          const currentAck = this.form.get('acknowledgedBy')?.value;
          if (currentAck) this.updateFilteredUsers(employees, currentAck, (val) => this.filteredAcknowledgedUsers = val);
        }
        this.setupSearchFilters();
      },
      error: (error) => {
        console.error('Error loading employees:', error);
        this.toastr.error('Failed to load employees. Please try again.');
      }
    });
  }

  private updateFilteredUsers(newResults: EmployeeOption[], selectedCode: string | null | undefined, filteredArraySetter: (val: EmployeeOption[]) => void): void {
    if (!selectedCode) { filteredArraySetter(newResults); return; }
    const exists = newResults.some(u => u.code === selectedCode);
    if (exists) { filteredArraySetter(newResults); } else {
      const cached = this.allLoadedEmployees.get(selectedCode);
      filteredArraySetter(cached ? [cached, ...newResults] : newResults);
    }
  }

  private setupSearchFilters(): void {
    this.assessedSearchCtrl.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), switchMap((term) => this.employeeService.getEmployeeOptions(term ? term.toString().trim() : '', 50)), takeUntil(this._unsubscribeAll)).subscribe((employees) => {
      employees.forEach(u => { if (u.code) this.allLoadedEmployees.set(u.code, u); });
      this.updateFilteredUsers(employees, this.form.get('assessedBy')?.value, (val) => this.filteredAssessedUsers = val);
    });
    this.approvedSearchCtrl.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), switchMap((term) => this.employeeService.getEmployeeOptions(term ? term.toString().trim() : '', 50)), takeUntil(this._unsubscribeAll)).subscribe((employees) => {
      employees.forEach(u => { if (u.code) this.allLoadedEmployees.set(u.code, u); });
      this.updateFilteredUsers(employees, this.form.get('approvedBy')?.value, (val) => this.filteredApprovedUsers = val);
    });
    this.acknowledgedSearchCtrl.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), switchMap((term) => this.employeeService.getEmployeeOptions(term ? term.toString().trim() : '', 50)), takeUntil(this._unsubscribeAll)).subscribe((employees) => {
      employees.forEach(u => { if (u.code) this.allLoadedEmployees.set(u.code, u); });
      this.updateFilteredUsers(employees, this.form.get('acknowledgedBy')?.value, (val) => this.filteredAcknowledgedUsers = val);
    });
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private setupScoreCalculation(): void {
    this.form.get('experienceScore')?.valueChanges.subscribe(() => { this.calculateTotalScore(); });
    this.form.get('staffScore')?.valueChanges.subscribe(() => { this.calculateTotalScore(); });
    this.form.get('complianceScore')?.valueChanges.subscribe(() => { this.calculateTotalScore(); });
    this.calculateTotalScore();
  }

  private calculateTotalScore(): void {
    const experienceScore = Number(this.form.get('experienceScore')?.value) || 0;
    const staffScore = Number(this.form.get('staffScore')?.value) || 0;
    const complianceScore = Number(this.form.get('complianceScore')?.value) || 0;
    const total = experienceScore + staffScore + complianceScore;
    this.form.patchValue({ totalScore: total }, { emitEvent: false });
  }
}
