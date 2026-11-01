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

export interface TaskItem {
  item: string;
  comment: string;
  responseAction: string;
}

@Component({
  selector: 'app-conceptual-peer-review-form',
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
  templateUrl: './conceptual-peer-review-form.component.html',
  styleUrls: ['./conceptual-peer-review-form.component.scss']
})
export class ConceptualPeerReviewFormComponent implements OnInit, OnDestroy {
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
  formType = 'mtdd';

  // Discipline options
  disciplines = [
    'Foundation/Substructure',
    'Superstructure',
    'Geotechnical/Site Formation',
    'Lighting',
    'MVAC',
    'Sanitary',
    'Electrical',
    'Lifts',
    'Fire Protection',
    'Transport',
    'Façade',
    'LEED',
    'Other'
  ];

  // Documentation types
  documentationTypes = [
    'Drawings/Sketches',
    'Calculations',
    'Reports',
    'Simulation Model',
    'Other'
  ];

  // Checklist options
  checklistOptions = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'na', label: 'N/A' }
  ];

  // MTDD-01 Checklist (8 items)
  mtddChecklist: ReviewChecklistItem[] = [
    { id: '1', question: 'Is design concept sound?', type: 'mtdd', required: true },
    { id: '2', question: 'Do they satisfy all client\'s requirements?', type: 'mtdd', required: true },
    { id: '3', question: 'Are proposed design assumptions and parameters valid?', type: 'mtdd', required: true },
    { id: '4', question: 'Are proposed loadings/capacities of equipment appropriate?', type: 'mtdd', required: true },
    { id: '5', question: 'Are proposed analysis and design methods appropriate?', type: 'mtdd', required: true },
    { id: '6', question: 'Are utility supplies available?', type: 'mtdd', required: true },
    { id: '7', question: 'Do they satisfy related legal and statutory requirements?', type: 'mtdd', required: true },
    { id: '8', question: 'Do they satisfy health, safety and environmental requirements?', type: 'mtdd', required: true }
  ];

  // Mock data
  mockProjects = [
    { id: '1', name: 'High-Rise Office Building', number: 'MTL-2024-CPR-001' },
    { id: '2', name: 'Residential Complex', number: 'MTL-2024-CPR-002' },
    { id: '3', name: 'Shopping Mall', number: 'MTL-2024-CPR-003' }
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
    this.initializeDocumentations();
    this.initializeChecklistResponses();
    this.initializeTaskItems();
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
      preparedBy: ['', Validators.required],
      present: ['', Validators.required],

      // Discipline
      disciplines: this.fb.array([]),
      disciplineOther: [''],

      // Documentation
      documentations: this.fb.array([]),
      documentationOther: [''],

      // Checklist Responses
      checklistResponses: this.fb.array([]),

      // Comments
      comments: [''],

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
      acknowledgedBy: ['', Validators.required],
      acknowledgedByDate: [new Date(), Validators.required],

      // Task Items
      taskItems: this.fb.array([]),

      // File attachments
      attachments: this.fb.array([])
    });
  }

  get disciplinesFormArray(): FormArray {
    return this.form.get('disciplines') as FormArray;
  }

  get documentations(): FormArray {
    return this.form.get('documentations') as FormArray;
  }

  get checklistResponses(): FormArray {
    return this.form.get('checklistResponses') as FormArray;
  }

  get taskItems(): FormArray {
    return this.form.get('taskItems') as FormArray;
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

  onDocumentationChange(): void {
    const documentationArray = this.form.get('documentations') as FormArray;
    const selectedDocumentations = [];

    documentationArray.controls.forEach((control, index) => {
      if (control.value) {
        selectedDocumentations.push(this.documentationTypes[index]);
      }
    });

    if (selectedDocumentations.includes('Other')) {
      this.form.get('documentationOther')?.setValidators([Validators.required]);
    } else {
      this.form.get('documentationOther')?.clearValidators();
    }
    this.form.get('documentationOther')?.updateValueAndValidity();
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

  addTaskItem(): void {
    const taskItemsArray = this.form.get('taskItems') as FormArray;
    taskItemsArray.push(this.fb.group({
      item: [''],
      comment: [''],
      responseAction: ['']
    }));
  }

  removeTaskItem(index: number): void {
    const taskItemsArray = this.form.get('taskItems') as FormArray;
    taskItemsArray.removeAt(index);
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

  initializeDocumentations(): void {
    const documentationArray = this.form.get('documentations') as FormArray;
    documentationArray.clear();

    this.documentationTypes.forEach(docType => {
      documentationArray.push(this.fb.control(false));
    });
  }

  initializeChecklistResponses(): void {
    const checklistArray = this.form.get('checklistResponses') as FormArray;
    checklistArray.clear();

    this.mtddChecklist.forEach(item => {
      checklistArray.push(this.fb.control(''));
    });
  }

  initializeTaskItems(): void {
    const taskItemsArray = this.form.get('taskItems') as FormArray;
    taskItemsArray.clear();

    // Add one empty row by default
    this.addTaskItem();
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
        projectNumber: 'MTL-2024-CPR-001',
        preparedBy: 'John Smith',
        present: 'Sarah Johnson',
        comments: 'Initial conceptual peer review completed',
        recommendedActionsSatisfactorilyTaken: true,
        reviewedBy: '1',
        reviewedByDate: new Date(),
        respondedBy: '2',
        respondedByDate: new Date(),
        signedByVVE: '1',
        signedByVVEDate: new Date(),
        signedByTL: '2',
        signedByTLDate: new Date(),
        acknowledgedBy: '3',
        acknowledgedByDate: new Date()
      });

      // Set discipline checkboxes
      const disciplineArray = this.form.get('disciplines') as FormArray;
      const superstructureIndex = this.disciplines.indexOf('Superstructure');
      if (superstructureIndex >= 0) {
        disciplineArray.at(superstructureIndex).setValue(true);
      }

      // Set documentation checkboxes
      const documentationArray = this.form.get('documentations') as FormArray;
      const drawingsIndex = this.documentationTypes.indexOf('Drawings/Sketches');
      if (drawingsIndex >= 0) {
        documentationArray.at(drawingsIndex).setValue(true);
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
        message: 'Are you sure you want to submit this conceptual peer review?',
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
          this.router.navigate(['/conceptual-peer-review']);
        }, 1000);
      });
    } else {
      this._snackBar.open('Please fill in all required fields', 'Close', { duration: 3000 });
    }
  }
  goBack(): void {
    if (this.hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        this.router.navigate(['/conceptual-peer-review']);
      }
    } else {
      this.router.navigate(['/conceptual-peer-review']);
    }
  }

  onEdit(): void {
    if (this.formId) {
      this.router.navigate(['/conceptual-peer-review/edit', this.formId]);
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

  getSelectedDocumentations(): string[] {
    const documentationArray = this.form.get('documentations') as FormArray;
    const selectedDocumentations = [];

    documentationArray.controls.forEach((control, index) => {
      if (control.value) {
        selectedDocumentations.push(this.documentationTypes[index]);
      }
    });

    return selectedDocumentations;
  }
}
