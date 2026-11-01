import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap, takeUntil } from 'rxjs';
import { ExternalProject, ExternalProjectService } from 'app/core/services/external-project.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ActivatedRoute, Router } from '@angular/router';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatRadioModule } from '@angular/material/radio';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatStepperModule } from '@angular/material/stepper';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialogModule } from '@angular/material/dialog';
import { FuseConfirmationService } from '@fuse/services/confirmation';

export interface ReviewChecklistItem {
  id: string;
  question: string;
  type: string;
  required: boolean;
}

export interface ItemTracking {
  item: string;
  reference: string;
  comment: string;
  responseAction: string;
}

@Component({
  selector: 'app-design-verification-validation-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatRadioModule,
    MatTabsModule,
    MatCardModule,
    MatDividerModule,
    MatChipsModule,
    MatExpansionModule,
    MatStepperModule,
    MatBadgeModule,
    MatTooltipModule,
    MatMenuModule,
    MatDialogModule,
    ViewActionsComponent,
    NgxMatSelectSearchModule
  ],
  templateUrl: './design-verification-validation-form.component.html',
  styleUrls: ['./design-verification-validation-form.component.scss']
})
export class DesignVerificationValidationFormComponent implements OnInit, OnDestroy {
  form: FormGroup;
  loading = false;
  isEdit = false;
  isView = false;
  formId: string | null = null;
  hasUnsavedChanges = false;
  projectSearchCtrl = new FormControl('');
  filteredProjectOptions: ExternalProject[] = [];
  private readonly destroy$ = new Subject<void>();

  // Form type
  formType = 'mtdd03';

  // Type of Review
  typeOfReview = ['Verification', 'Validation'];

  // Discipline options
  disciplines = [
    'Geotechnical/Foundation/Substructure',
    'Superstructure',
    'MVAC',
    'Electrical',
    'Fire Protection',
    'Lifts',
    'Façade',
    'Civil work/Site Formation',
    'Sanitary',
    'Lighting',
    'Other'
  ];

  // Document types
  documentTypes = [
    'Drawings',
    'Specifications',
    'Reports',
    'Calculations',
    'Other'
  ];

  // Design stages
  designStages = [
    'Tender',
    'Construction',
    'Other'
  ];

  // Checklist options
  checklistOptions = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'na', label: 'N/A' }
  ];

  // MTDD-03 Checklist Part B (11 items)
  mtdd03ChecklistB: ReviewChecklistItem[] = [
    { id: '1', question: 'Is design concept sound?', type: 'mtdd03b', required: true },
    { id: '2', question: 'Does the design meet all the client\'s requirements?', type: 'mtdd03b', required: true },
    { id: '3', question: 'Are proposed design assumptions and parameters valid?', type: 'mtdd03b', required: true },
    { id: '4', question: 'Are proposed loadings appropriate?', type: 'mtdd03b', required: true },
    { id: '5', question: 'Are proposed analysis and design methods appropriate?', type: 'mtdd03b', required: true },
    { id: '6', question: 'Are utility supplies available?', type: 'mtdd03b', required: true },
    { id: '7', question: 'Does the design meet related legal and statutory requirements?', type: 'mtdd03b', required: true },
    { id: '8', question: 'Does the design meet the health, safety and environmental requirements?', type: 'mtdd03b', required: true },
    { id: '9', question: 'Do the details on the drawing conforms to calculation results', type: 'mtdd03b', required: true },
    { id: '10', question: 'Are detail design require to correct?', type: 'mtdd03b', required: true },
    { id: '11', question: 'Are the drawings/sketches required to re-issued?', type: 'mtdd03b', required: true }
  ];

  // MTDD-03 Checklist Part C (2 items)
  mtdd03ChecklistC: ReviewChecklistItem[] = [
    { id: '1', question: 'Is the resulting design appropriate for the end user?', type: 'mtdd03c', required: true },
    { id: '2', question: 'Are the documents complete and suitable for use for construction?', type: 'mtdd03c', required: true }
  ];

  // Mock data
  mockProjects = [
    { id: '1', name: 'High-Rise Office Building', number: 'MTL-2024-DVV-001' },
    { id: '2', name: 'Residential Complex', number: 'MTL-2024-DVV-002' },
    { id: '3', name: 'Shopping Mall', number: 'MTL-2024-DVV-003' }
  ];

  mockReviewers = [
    { id: '1', name: 'John Smith', role: 'VVE', discipline: 'C&S' },
    { id: '2', name: 'Sarah Johnson', role: 'TL', discipline: 'MEP' },
    { id: '3', name: 'Mike Chen', role: 'DI', discipline: 'C&S' }
  ];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ExternalProjectService,
    private _snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    this.initializeDisciplines();
    this.initializeDocumentTypes();
    this.initializeDesignStages();
    this.initializeChecklistResponsesB();
    this.initializeChecklistResponsesC();
    this.initializeItemTracking();
    this.setupProjectSearch();

    this.route.params.subscribe(params => {
      this.formId = params['id'];
      this.isEdit = this.route.snapshot.url.some(segment => segment.path === 'edit');
      this.isView = this.route.snapshot.url.some(segment => segment.path === 'view');

      if (this.formId) {
        this.loadFormData();
      }
    });

    // Track form changes
    this.form.valueChanges.subscribe(() => {
      this.hasUnsavedChanges = true;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
      projectNumber: project.code,
    });
  }

  createForm(): FormGroup {
    return this.fb.group({
      // Project Information
      projectId: ['', Validators.required],
      projectName: ['', Validators.required],
      projectNumber: ['', Validators.required],

      // Type of Review
      verification: [false],
      validation: [false],

      // Discipline
      disciplines: this.fb.array([]),
      disciplineOther: [''],

      // Document(s) Verified/Validated
      documentTypes: this.fb.array([]),
      documentTypesOther: [''],

      // Design Stage
      designStages: this.fb.array([]),
      designStageOther: [''],

      // Method of Review
      performingAlternativeCalculations: [false],
      reviewingDocumentsBeforeAfter: [false],
      reviewingConstructionIssueDocuments: [false],

      // Checklist Responses Part B
      checklistResponsesB: this.fb.array([]),

      // Checklist Responses Part C
      checklistResponsesC: this.fb.array([]),

      // Comments
      comments: [''],

      // Non-conformance
      nonConformanceToQP: [false],
      carReferenceNumber: [''],

      // Review and Response
      reviewedBy: ['', Validators.required],
      reviewedByDate: [new Date(), Validators.required],
      respondedBy: ['', Validators.required],
      respondedByDate: [new Date(), Validators.required],

      // Recommended Action
      recommendedActionsSatisfactorilyTaken: [false],
      note: [''],

      // Signatures
      signedByVVE: ['', Validators.required],
      signedByVVEDate: [new Date(), Validators.required],
      signedByTL: ['', Validators.required],
      signedByTLDate: [new Date(), Validators.required],

      // Client/Manager/Contractor Feedback
      clientFeedback: [false],
      clientFeedbackComments: [''],
      clientFeedbackSignedBy: [''],
      clientFeedbackSignedByDate: [new Date()],

      // Acknowledged by
      acknowledgedBy: ['', Validators.required],
      acknowledgedByDate: [new Date(), Validators.required],

      // Item Tracking
      itemTracking: this.fb.array([]),

      // File attachments
      attachments: this.fb.array([])
    });
  }

  get disciplinesFormArray(): FormArray {
    return this.form.get('disciplines') as FormArray;
  }

  get documentTypesFormArray(): FormArray {
    return this.form.get('documentTypes') as FormArray;
  }

  get designStagesFormArray(): FormArray {
    return this.form.get('designStages') as FormArray;
  }

  get checklistResponsesB(): FormArray {
    return this.form.get('checklistResponsesB') as FormArray;
  }

  get checklistResponsesC(): FormArray {
    return this.form.get('checklistResponsesC') as FormArray;
  }

  get itemTracking(): FormArray {
    return this.form.get('itemTracking') as FormArray;
  }

  get attachments(): FormArray {
    return this.form.get('attachments') as FormArray;
  }

  onDisciplineChange(): void {
    const disciplineArray = this.form.get('disciplines') as FormArray;
    const selectedDisciplines = [];

    disciplineArray.controls.forEach((control, index) => {
      if (control.value) {
        selectedDisciplines.push(this.disciplines[index]);
      }
    });

    if (selectedDisciplines.includes('Other')) {
      this.form.get('disciplineOther')?.setValidators([Validators.required]);
    } else {
      this.form.get('disciplineOther')?.clearValidators();
    }
    this.form.get('disciplineOther')?.updateValueAndValidity();
  }

  onDocumentTypeChange(): void {
    const documentArray = this.form.get('documentTypes') as FormArray;
    const selectedDocuments = [];

    documentArray.controls.forEach((control, index) => {
      if (control.value) {
        selectedDocuments.push(this.documentTypes[index]);
      }
    });

    if (selectedDocuments.includes('Other')) {
      this.form.get('documentTypesOther')?.setValidators([Validators.required]);
    } else {
      this.form.get('documentTypesOther')?.clearValidators();
    }
    this.form.get('documentTypesOther')?.updateValueAndValidity();
  }

  onDesignStageChange(): void {
    const designStageArray = this.form.get('designStages') as FormArray;
    const selectedStages = [];

    designStageArray.controls.forEach((control, index) => {
      if (control.value) {
        selectedStages.push(this.designStages[index]);
      }
    });

    if (selectedStages.includes('Other')) {
      this.form.get('designStageOther')?.setValidators([Validators.required]);
    } else {
      this.form.get('designStageOther')?.clearValidators();
    }
    this.form.get('designStageOther')?.updateValueAndValidity();
  }

  onNonConformanceChange(): void {
    const nonConformance = this.form.get('nonConformanceToQP')?.value;
    if (nonConformance) {
      this.form.get('carReferenceNumber')?.setValidators([Validators.required]);
    } else {
      this.form.get('carReferenceNumber')?.clearValidators();
    }
    this.form.get('carReferenceNumber')?.updateValueAndValidity();
  }

  onRecommendedActionsSatisfactorilyTakenChange(): void {
    const satisfactorilyTaken = this.form.get('recommendedActionsSatisfactorilyTaken')?.value;
    if (!satisfactorilyTaken) {
      this.form.get('note')?.setValidators([Validators.required]);
    } else {
      this.form.get('note')?.clearValidators();
    }
    this.form.get('note')?.updateValueAndValidity();
  }

  addItemTracking(): void {
    const itemTrackingArray = this.form.get('itemTracking') as FormArray;
    itemTrackingArray.push(this.fb.group({
      item: [''],
      reference: [''],
      comment: [''],
      responseAction: ['']
    }));
  }

  removeItemTracking(index: number): void {
    const itemTrackingArray = this.form.get('itemTracking') as FormArray;
    itemTrackingArray.removeAt(index);
  }

  addAttachment(): void {
    const attachmentsArray = this.form.get('attachments') as FormArray;
    attachmentsArray.push(this.fb.group({
      fileName: [''],
      fileSize: [''],
      uploadDate: [new Date()]
    }));
  }

  removeAttachment(index: number): void {
    const attachmentsArray = this.form.get('attachments') as FormArray;
    attachmentsArray.removeAt(index);
  }

  initializeDisciplines(): void {
    const disciplineArray = this.form.get('disciplines') as FormArray;
    disciplineArray.clear();

    this.disciplines.forEach(discipline => {
      disciplineArray.push(this.fb.control(false));
    });
  }

  initializeDocumentTypes(): void {
    const documentArray = this.form.get('documentTypes') as FormArray;
    documentArray.clear();

    this.documentTypes.forEach(docType => {
      documentArray.push(this.fb.control(false));
    });
  }

  initializeDesignStages(): void {
    const designStageArray = this.form.get('designStages') as FormArray;
    designStageArray.clear();

    this.designStages.forEach(stage => {
      designStageArray.push(this.fb.control(false));
    });
  }

  initializeChecklistResponsesB(): void {
    const checklistArray = this.form.get('checklistResponsesB') as FormArray;
    checklistArray.clear();

    this.mtdd03ChecklistB.forEach(item => {
      checklistArray.push(this.fb.control(''));
    });
  }

  initializeChecklistResponsesC(): void {
    const checklistArray = this.form.get('checklistResponsesC') as FormArray;
    checklistArray.clear();

    this.mtdd03ChecklistC.forEach(item => {
      checklistArray.push(this.fb.control(''));
    });
  }

  initializeItemTracking(): void {
    const itemTrackingArray = this.form.get('itemTracking') as FormArray;
    itemTrackingArray.clear();

    // Add one empty row by default
    this.addItemTracking();
  }

  loadFormData(): void {
    // Load form data based on formId
    // This would typically come from a service
    this.loading = true;

    // Mock data loading
    setTimeout(() => {
      this.form.patchValue({
        projectId: '1',
        projectName: 'High-Rise Office Building',
        projectNumber: 'MTL-2024-DVV-001',
        verification: true,
        validation: false,
        comments: 'Initial design verification completed',
        nonConformanceToQP: false,
        performingAlternativeCalculations: false,
        reviewingDocumentsBeforeAfter: true,
        reviewingConstructionIssueDocuments: true,
        recommendedActionsSatisfactorilyTaken: true,
        reviewedBy: '1',
        reviewedByDate: new Date(),
        respondedBy: '2',
        respondedByDate: new Date(),
        signedByVVE: '1',
        signedByVVEDate: new Date(),
        signedByTL: '2',
        signedByTLDate: new Date(),
        clientFeedback: false,
        acknowledgedBy: '3',
        acknowledgedByDate: new Date()
      });

      // Set discipline checkboxes
      const disciplineArray = this.form.get('disciplines') as FormArray;
      const superstructureIndex = this.disciplines.indexOf('Superstructure');
      if (superstructureIndex >= 0) {
        disciplineArray.at(superstructureIndex).setValue(true);
      }

      // Set document type checkboxes
      const documentArray = this.form.get('documentTypes') as FormArray;
      const drawingsIndex = this.documentTypes.indexOf('Drawings');
      if (drawingsIndex >= 0) {
        documentArray.at(drawingsIndex).setValue(true);
      }

      // Set design stage checkboxes
      const designStageArray = this.form.get('designStages') as FormArray;
      const tenderIndex = this.designStages.indexOf('Tender');
      if (tenderIndex >= 0) {
        designStageArray.at(tenderIndex).setValue(true);
      }

      this.loading = false;
    }, 1000);
  }

  saveForm(): void {
    if (this.form.valid) {
      this.loading = true;

      // Mock save operation
      setTimeout(() => {
        this.loading = false;
        this.hasUnsavedChanges = false;
        this._snackBar.open('Form saved successfully', 'Close', { duration: 3000 });
      }, 1000);
    } else {
      this._snackBar.open('Please fill in all required fields', 'Close', { duration: 3000 });
    }
  }

  submitForm(): void {
    if (this.form.valid) {
      const confirmation = this.fuseConfirmationService.open({
        title: 'Confirm submit',
        message: 'Are you sure you want to submit this design verification/validation form?',
        icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
        actions: {
          cancel: { show: true, label: 'Cancel' },
          confirm: { show: true, label: 'Submit', color: 'primary' },
        },
        dismissible: false,
      });

      confirmation.afterClosed().subscribe((result) => {
        if (result !== 'confirmed') return;
        this.loading = true;

        // Mock submit operation
        setTimeout(() => {
          this.loading = false;
          this.hasUnsavedChanges = false;
          this._snackBar.open('Form submitted successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/design-verification-validation']);
        }, 1000);
      });
    } else {
      this._snackBar.open('Please fill in all required fields', 'Close', { duration: 3000 });
    }
  }

  goBack(): void {
    if (this.hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['/design-verification-validation']);
      }
    } else {
      this.router.navigate(['/design-verification-validation']);
    }
  }

  onEdit(): void {
    if (this.formId) {
      this.router.navigate(['/design-verification-validation/edit', this.formId]);
    }
  }

  getSelectedDisciplines(): string[] {
    const disciplineArray = this.form.get('disciplines') as FormArray;
    const selectedDisciplines = [];

    disciplineArray.controls.forEach((control, index) => {
      if (control.value) {
        selectedDisciplines.push(this.disciplines[index]);
      }
    });

    return selectedDisciplines;
  }

  getSelectedDocumentTypes(): string[] {
    const documentArray = this.form.get('documentTypes') as FormArray;
    const selectedDocuments = [];

    documentArray.controls.forEach((control, index) => {
      if (control.value) {
        selectedDocuments.push(this.documentTypes[index]);
      }
    });

    return selectedDocuments;
  }

  getSelectedDesignStages(): string[] {
    const designStageArray = this.form.get('designStages') as FormArray;
    const selectedStages = [];

    designStageArray.controls.forEach((control, index) => {
      if (control.value) {
        selectedStages.push(this.designStages[index]);
      }
    });

    return selectedStages;
  }
}
