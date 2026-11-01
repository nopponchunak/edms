import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatChipsModule } from '@angular/material/chips';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { ExternalProject, ExternalProjectService } from 'app/core/services/external-project.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

interface Employee {
  id: string;
  name: string;
  role: string;
}

@Component({
  selector: 'app-design-changes-notification-form',
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
    MatSelectModule,
    MatRadioModule,
    MatChipsModule,
    NgxMatSelectSearchModule,
  ],
  templateUrl: './design-changes-notification-form.component.html',
  styleUrls: ['./design-changes-notification-form.component.scss']
})
export class DesignChangesNotificationFormComponent implements OnInit {
  form: FormGroup;
  isLoading = false;

  projectSearchCtrl = new FormControl('');
  filteredProjectOptions: ExternalProject[] = [];
  private readonly destroy$ = new Subject<void>();

  // Mock employees data
  employees: Employee[] = [
    { id: '1', name: 'John Smith', role: 'Team Leader' },
    { id: '2', name: 'Jane Doe', role: 'Director' },
    { id: '3', name: 'Bob Johnson', role: 'Project Engineer' },
    { id: '4', name: 'Alice Brown', role: 'Senior Engineer' },
    { id: '5', name: 'Charlie Wilson', role: 'Engineer' },
    { id: '6', name: 'Diana Davis', role: 'Team Leader' },
    { id: '7', name: 'Eve Miller', role: 'Project Engineer' }
  ];

  // Change originated by options
  changeOriginatedByOptions = [
    'Client',
    'Sub-consultant',
    'Meinhardt',
    'Contractor',
    'Other'
  ];

  // Design output options
  designOutputOptions = [
    'Calculations',
    'Drawings',
    'Specification',
    'Schedules',
    'Bills of Quantities',
    'Reports',
    'Other'
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private projectService: ExternalProjectService,
    private fuseConfirmationService: FuseConfirmationService,
    private toastr: ToastrService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    this.initializeForm();
    this.setupProjectSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createForm(): FormGroup {
    return this.fb.group({
      // Header
      copiesTo: ['Meinhardt (Thailand) Ltd.', [Validators.required]],
      circ: ['/File MT', [Validators.required]],

      // Project Information
      projectId: [''],
      projectName: ['', [Validators.required]],
      projectNo: ['', [Validators.required]],
      changeNo: ['', [Validators.required]],
      date: [new Date(), [Validators.required]],

      // Recipients
      to: ['', [Validators.required]],
      from: ['', [Validators.required]],
      copies: this.fb.array([]),

      // PART 1: Request for change originated by
      changeOriginatedBy: this.fb.array([]),
      changeOriginatedByOther: [''],
      description: ['', [Validators.required]],
      hasSupportingDocumentation: [false],
      supportingDocumentationYes: [false],
      supportingDocumentationNo: [false],

      // PART 2: Design output required to amend
      designOutputRequired: this.fb.array([]),
      designOutputOther: [''],
      comments: [''],
      signedBy: ['', [Validators.required]],
      signedDate: [new Date(), [Validators.required]],

      // PART 3: Proceed with design change
      proceedWithChange: ['', [Validators.required]],
      proceedWithChangeYes: [false],
      proceedWithChangeNo: [false],
      adviseClientOfChange: [false],
      proceedBeforeClientApproval: [false],
      adviseAccountantOfFeeChange: [false],
      proceedComments: [''],
      proceedDescription: [''],
      proceedReferences: [''],
      proceedSignedBy: ['', [Validators.required]],
      proceedSignedDate: [new Date(), [Validators.required]],

      // PART 4: Acknowledgement by client
      clientAcknowledgement: ['', [Validators.required]],
      clientAcknowledgementYes: [false],
      clientAcknowledgementNo: [false],
      clientComments: [''],
      clientSignedBy: ['', [Validators.required]],
      clientSignedDate: [new Date(), [Validators.required]],

      // Status
      status: ['draft']
    });
  }

  private initializeForm(): void {
    // Load mock data for demonstration
    this.loadMockData();
  }

  private loadMockData(): void {
    const mockData = {
      projectName: 'New Hospital Complex - Phase 2',
      projectNo: 'MT2024001',
      changeNo: 'CHG-2024-001',
      to: '1', // John Smith (Team Leader)
      from: '3', // Bob Johnson (Project Engineer)
      description: 'Additional structural requirements for seismic zone 4 compliance',
      comments: 'Changes required due to updated building codes',
      proceedComments: 'Proceeding with design changes as requested',
      proceedDescription: 'Structural modifications for seismic compliance',
      proceedReferences: 'Building Code 2024, Seismic Design Guidelines',
      clientComments: 'Client approved the changes with additional fee consideration'
    };

    this.form.patchValue(mockData);

    // Set up change originated by
    this.addChangeOriginatedBy('Client');
    this.addChangeOriginatedBy('Meinhardt');

    // Set up design output required
    this.addDesignOutputRequired('Calculations');
    this.addDesignOutputRequired('Drawings');
    this.addDesignOutputRequired('Specification');

    // Set up copies
    this.addCopy('4'); // Alice Brown
    this.addCopy('5'); // Charlie Wilson
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

  // Change originated by methods
  get changeOriginatedBy(): FormArray {
    return this.form.get('changeOriginatedBy') as FormArray;
  }

  addChangeOriginatedBy(option: string): void {
    if (!this.changeOriginatedBy.value.includes(option)) {
      this.changeOriginatedBy.push(this.fb.control(option));
    }
  }

  removeChangeOriginatedBy(index: number): void {
    this.changeOriginatedBy.removeAt(index);
  }

  // Design output required methods
  get designOutputRequired(): FormArray {
    return this.form.get('designOutputRequired') as FormArray;
  }

  addDesignOutputRequired(option: string): void {
    if (!this.designOutputRequired.value.includes(option)) {
      this.designOutputRequired.push(this.fb.control(option));
    }
  }

  removeDesignOutputRequired(index: number): void {
    this.designOutputRequired.removeAt(index);
  }

  // Copies methods
  get copies(): FormArray {
    return this.form.get('copies') as FormArray;
  }

  addCopy(employeeId: string): void {
    if (!this.copies.value.includes(employeeId)) {
      this.copies.push(this.fb.control(employeeId));
    }
  }

  removeCopy(index: number): void {
    this.copies.removeAt(index);
  }

  // Supporting documentation change
  onSupportingDocumentationChange(): void {
    const yes = this.form.get('supportingDocumentationYes')?.value;
    const no = this.form.get('supportingDocumentationNo')?.value;

    if (yes && no) {
      this.form.get('supportingDocumentationNo')?.setValue(false);
    }
  }

  // Proceed with change change
  onProceedWithChangeChange(): void {
    const yes = this.form.get('proceedWithChangeYes')?.value;
    const no = this.form.get('proceedWithChangeNo')?.value;

    if (yes && no) {
      this.form.get('proceedWithChangeNo')?.setValue(false);
    }

    if (yes) {
      this.form.get('proceedWithChange')?.setValue('yes');
    } else if (no) {
      this.form.get('proceedWithChange')?.setValue('no');
    }
  }

  // Client acknowledgement change
  onClientAcknowledgementChange(): void {
    const yes = this.form.get('clientAcknowledgementYes')?.value;
    const no = this.form.get('clientAcknowledgementNo')?.value;

    if (yes && no) {
      this.form.get('clientAcknowledgementNo')?.setValue(false);
    }

    if (yes) {
      this.form.get('clientAcknowledgement')?.setValue('yes');
    } else if (no) {
      this.form.get('clientAcknowledgement')?.setValue('no');
    }
  }

  // Generate change number
  generateChangeNo(): void {
    const projectNo = this.form.get('projectNo')?.value;
    if (projectNo) {
      const changeNo = `CHG-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
      this.form.get('changeNo')?.setValue(changeNo);
    }
  }

  onSubmit(): void {
    if (this.isLoading) return;

    if (!this.form.valid) {
      this.form.markAllAsTouched();
      this.toastr.error('Please fill in all required fields.');
      return;
    }

    const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm submit',
      message: 'Are you sure you want to submit this form?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Submit', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      this.submitForm();
    });
  }

  private submitForm(): void {
    this.isLoading = true;

    // Simulate API call
    setTimeout(() => {
      this.isLoading = false;
      this.toastr.success('Form submitted successfully!');
    }, 1000);
  }

  onSaveDraft(): void {
    this.form.get('status')?.setValue('draft');
    this.onSubmit();
  }

  onReset(): void {
    this.form.reset();
    this.initializeForm();
  }

  goBack(): void {
    // Check if form has unsaved changes
    if (this.form.dirty) {
      const confirmLeave = confirm('You have unsaved changes. Are you sure you want to leave?');
      if (!confirmLeave) {
        return;
      }
    }

    // Navigate back to the list page
    this.router.navigate(['/design-changes-notification']);
  }

  // Helper methods
  getEmployeeName(id: string): string {
    const employee = this.employees.find(emp => emp.id === id);
    return employee ? employee.name : '';
  }

  getEmployeeRole(id: string): string {
    const employee = this.employees.find(emp => emp.id === id);
    return employee ? employee.role : '';
  }
}
