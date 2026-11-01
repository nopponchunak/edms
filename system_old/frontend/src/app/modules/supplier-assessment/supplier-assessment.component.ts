import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { SupplierAssessmentService, CreateSupplierAssessmentRequest } from '../../core/services/supplier-assessment.service';
import { people, Person, getEvaluators, getApprovers, getAcknowledgers } from '../../mock-api/common/data/people.data';
import { FuseConfirmationService } from '@fuse/services/confirmation';

interface Reference {
  name: string;
  opinion: 'negative' | 'neutral' | 'positive';
}

@Component({
  selector: 'app-supplier-assessment',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatRadioModule,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatIconModule,
    MatDividerModule,
    MatSnackBarModule
  ],
  templateUrl: './supplier-assessment.component.html'
})
export class SupplierAssessmentComponent implements OnInit {
  assessmentForm: FormGroup;
  totalScore = 0;
  hasPositiveReference = false;

  // People data
  evaluators: Person[] = getEvaluators();
  approvers: Person[] = getApprovers();
  acknowledgers: Person[] = getAcknowledgers();

  informationOptions = [
    'Company Profile/Biodata',
    'Project Reference/Certificates',
    'Site Visit',
    'Previous Assessment/Evaluation',
    'ISO Certificates'
  ];

  opinionOptions = [
    { value: 'negative', label: 'Negative' },
    { value: 'neutral', label: 'Neutral' },
    { value: 'positive', label: 'Positive' }
  ];

  constructor(
    private fb: FormBuilder,
    private supplierAssessmentService: SupplierAssessmentService,
    private snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService,
    public router: Router
  ) {
    this.assessmentForm = this.createForm();
  }

  ngOnInit(): void {
    this.setupFormListeners();
  }

  createForm(): FormGroup {
    return this.fb.group({
      itemsSupplied: ['', Validators.required],
      informationUsedForAssessment: this.fb.array([], [this.minSelectedCheckboxes(1)]),
      companyName: ['', Validators.required],
      experienceScore: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
      qualifiedStaffScore: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
      productComplianceScore: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
      references: this.fb.array([this.createReferenceFormGroup()]),
      recommendation: ['', Validators.required],
      reason: [''],
      assessedBy: ['', Validators.required],
      assessedDate: [new Date(), Validators.required],
      approvedForSupplierList: [false],
      approvedRemark: [''],
      approvedBy: [''],
      approvedDate: [new Date()],
      acknowledgedBy: [''],
      acknowledgedDate: [new Date()]
    });
  }

  createReferenceFormGroup(): FormGroup {
    return this.fb.group({
      name: ['', Validators.required],
      opinion: ['', Validators.required]
    });
  }

  minSelectedCheckboxes(min: number) {
    return (formArray: FormArray) => {
      const totalSelected = formArray.controls
        .map(control => control.value)
        .reduce((prev, next) => next ? prev + next : prev, 0);
      return totalSelected >= min ? null : { required: true };
    };
  }

  setupFormListeners(): void {
    // Listen to score changes
    this.assessmentForm.get('experienceScore')?.valueChanges.subscribe(() => this.calculateTotalScore());
    this.assessmentForm.get('qualifiedStaffScore')?.valueChanges.subscribe(() => this.calculateTotalScore());
    this.assessmentForm.get('productComplianceScore')?.valueChanges.subscribe(() => this.calculateTotalScore());

    // Listen to references changes
    this.assessmentForm.get('references')?.valueChanges.subscribe(() => this.checkPositiveReferences());
  }

  calculateTotalScore(): void {
    const experienceScore = this.assessmentForm.get('experienceScore')?.value || 0;
    const qualifiedStaffScore = this.assessmentForm.get('qualifiedStaffScore')?.value || 0;
    const productComplianceScore = this.assessmentForm.get('productComplianceScore')?.value || 0;

    this.totalScore = experienceScore + qualifiedStaffScore + productComplianceScore;
  }

  checkPositiveReferences(): void {
    const references = this.assessmentForm.get('references')?.value as Reference[];
    this.hasPositiveReference = references.some(ref => ref.opinion === 'positive');
  }

  get informationFormArray(): FormArray {
    return this.assessmentForm.get('informationUsedForAssessment') as FormArray;
  }

  get referencesFormArray(): FormArray {
    return this.assessmentForm.get('references') as FormArray;
  }

  onInformationChange(option: string, isChecked: boolean): void {
    const formArray = this.informationFormArray;
    const index = this.informationOptions.indexOf(option);

    if (isChecked) {
      formArray.push(new FormControl(option));
    } else {
      const controlIndex = formArray.controls.findIndex(control => control.value === option);
      if (controlIndex !== -1) {
        formArray.removeAt(controlIndex);
      }
    }
  }

  addReference(): void {
    this.referencesFormArray.push(this.createReferenceFormGroup());
  }

  removeReference(index: number): void {
    if (this.referencesFormArray.length > 1) {
      this.referencesFormArray.removeAt(index);
    }
  }


  onSubmit(): void {
    if (this.assessmentForm.valid) {
      const formData: CreateSupplierAssessmentRequest = this.assessmentForm.value;

      // Convert FormArray to array
      formData.informationUsedForAssessment = this.informationFormArray.value;
      formData.references = this.referencesFormArray.value;

      // Convert dates to ISO string
      if (formData.assessedDate) {
        formData.assessedDate = new Date(formData.assessedDate).toISOString();
      }
      if (formData.approvedDate) {
        formData.approvedDate = new Date(formData.approvedDate).toISOString();
      }
      if (formData.acknowledgedDate) {
        formData.acknowledgedDate = new Date(formData.acknowledgedDate).toISOString();
      }

      const confirmation = this.fuseConfirmationService.open({
        title: 'Confirm submit',
        message: 'Are you sure you want to submit this supplier assessment?',
        icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
        actions: {
          cancel: { show: true, label: 'Cancel' },
          confirm: { show: true, label: 'Submit', color: 'primary' },
        },
        dismissible: false,
      });

      confirmation.afterClosed().subscribe((result) => {
        if (result !== 'confirmed') return;
        this.supplierAssessmentService.create(formData)
          .subscribe({
            next: (response) => {
              this.snackBar.open('Supplier Assessment submitted successfully!', 'Close', {
                duration: 3000,
                panelClass: ['success-snackbar']
              });
              this.assessmentForm.reset();
              this.totalScore = 0;
              this.hasPositiveReference = false;
            },
            error: (error) => {
              console.error('Error submitting assessment:', error);
              this.snackBar.open('Error submitting assessment. Please try again.', 'Close', {
                duration: 3000,
                panelClass: ['error-snackbar']
              });
            }
          });
      });
    } else {
      this.snackBar.open('Please fill in all required fields correctly.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  getScoreCriteria(score: number): string {
    if (score >= 9) return 'Excellent';
    if (score >= 6) return 'Good';
    if (score >= 3) return 'Fair';
    return 'Poor';
  }
}
