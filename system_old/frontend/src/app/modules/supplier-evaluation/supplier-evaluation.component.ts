import { Component, OnInit, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
import { SupplierEvaluationService, CreateSupplierEvaluationRequest } from '../../core/services/supplier-evaluation.service';
import { people, Person, getEvaluators, getApprovers, getAcknowledgers } from '../../mock-api/common/data/people.data';
import { FuseConfirmationService } from '@fuse/services/confirmation';

@Component({
  selector: 'app-supplier-evaluation',
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
  templateUrl: './supplier-evaluation.component.html'
})
export class SupplierEvaluationComponent implements OnInit {
  evaluationForm: FormGroup;
  averageRating = 0;
  calculatedDecision: 'maintain' | 'remove' | null = null;

  // People data
  evaluators: Person[] = getEvaluators();
  approvers: Person[] = getApprovers();
  acknowledgers: Person[] = getAcknowledgers();

  evaluationCriteria = [
    { key: 'qualityAccuracy', label: 'Quality and Accuracy of Document', score: 0, comment: '' },
    { key: 'timelinessDocumentation', label: 'Timeliness of Documentation', score: 0, comment: '' },
    { key: 'understandingNeeds', label: 'Understanding of MTL\'s Needs', score: 0, comment: '' },
    { key: 'cooperationResponsiveness', label: 'Cooperation and Responsiveness of Frontline Staff', score: 0, comment: '' },
    { key: 'timelinessDelivery', label: 'Timeliness of Delivery', score: 0, comment: '' },
    { key: 'qualityProducts', label: 'Quality of Products', score: 0, comment: '' },
    { key: 'meetEmsOhsms', label: 'Meet EMS / OHSMS Requirements', score: 0, comment: '' },
    { key: 'others', label: 'Others', score: 0, comment: '' }
  ];

  constructor(
    private fb: FormBuilder,
    @Inject(SupplierEvaluationService) private supplierEvaluationService: SupplierEvaluationService,
    private snackBar: MatSnackBar,
    private fuseConfirmationService: FuseConfirmationService,
    public router: Router
  ) {
    this.evaluationForm = this.createForm();
  }

  ngOnInit(): void {
    this.setupFormListeners();
  }

  createForm(): FormGroup {
    return this.fb.group({
      supplierName: ['', Validators.required],
      projectName: ['', Validators.required],
      projectNo: ['', Validators.required],
      departmentPurchasedValueDuration: ['', Validators.required],
      hasAntiCorruptionViolation: [false],

      // Evaluation scores
      qualityAccuracyScore: [0, [Validators.required, Validators.min(0), Validators.max(10)]],
      timelinessDocumentationScore: [0, [Validators.required, Validators.min(0), Validators.max(10)]],
      understandingNeedsScore: [0, [Validators.required, Validators.min(0), Validators.max(10)]],
      cooperationResponsivenessScore: [0, [Validators.required, Validators.min(0), Validators.max(10)]],
      timelinessDeliveryScore: [0, [Validators.required, Validators.min(0), Validators.max(10)]],
      qualityProductsScore: [0, [Validators.required, Validators.min(0), Validators.max(10)]],
      meetEmsOhsmsScore: [0, [Validators.required, Validators.min(0), Validators.max(10)]],
      othersScore: [0, [Validators.required, Validators.min(0), Validators.max(10)]],

      // Comments
      qualityAccuracyComment: [''],
      timelinessDocumentationComment: [''],
      understandingNeedsComment: [''],
      cooperationResponsivenessComment: [''],
      timelinessDeliveryComment: [''],
      qualityProductsComment: [''],
      meetEmsOhsmsComment: [''],
      othersComment: [''],

      // Decision
      decision: [''],
      decisionReason: [''],

      // Evaluated by
      evaluatedBy: ['', Validators.required],
      evaluatedDate: [new Date(), Validators.required],

      // Approved by
      approvedBy: [''],
      approvedDate: [new Date()],
      approvalReason: [''],

      // Acknowledged by
      acknowledgedBy: [''],
      acknowledgedDate: [new Date()]
    });
  }

  setupFormListeners(): void {
    // Listen to score changes
    this.evaluationCriteria.forEach(criteria => {
      this.evaluationForm.get(criteria.key + 'Score')?.valueChanges.subscribe(() => {
        this.calculateAverageRating();
      });
    });

    // Listen to anti-corruption violation
    this.evaluationForm.get('hasAntiCorruptionViolation')?.valueChanges.subscribe(() => {
      this.calculateDecision();
    });
  }

  calculateAverageRating(): void {
    const scores = this.evaluationCriteria.map(criteria =>
      this.evaluationForm.get(criteria.key + 'Score')?.value || 0
    );

    this.averageRating = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    this.calculateDecision();
  }

  calculateDecision(): void {
    const hasViolation = this.evaluationForm.get('hasAntiCorruptionViolation')?.value;

    if (hasViolation) {
      this.calculatedDecision = 'remove';
    } else {
      this.calculatedDecision = this.averageRating >= 5 ? 'maintain' : 'remove';
    }
  }

  getRatingDescription(score: number): string {
    if (score >= 8) return 'Good (8-10)';
    if (score >= 5) return 'Satisfactory (5-7)';
    return 'Poor (0-4)';
  }

  onSubmit(): void {
    if (this.evaluationForm.valid) {
      const formData: CreateSupplierEvaluationRequest = this.evaluationForm.value;

      // Convert dates to ISO string
      if (formData.evaluatedDate) {
        formData.evaluatedDate = new Date(formData.evaluatedDate).toISOString();
      }
      if (formData.approvedDate) {
        formData.approvedDate = new Date(formData.approvedDate).toISOString();
      }
      if (formData.acknowledgedDate) {
        formData.acknowledgedDate = new Date(formData.acknowledgedDate).toISOString();
      }

      const confirmation = this.fuseConfirmationService.open({
        title: 'Confirm submit',
        message: 'Are you sure you want to submit this supplier evaluation?',
        icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
        actions: {
          cancel: { show: true, label: 'Cancel' },
          confirm: { show: true, label: 'Submit', color: 'primary' },
        },
        dismissible: false,
      });

      confirmation.afterClosed().subscribe((result) => {
        if (result !== 'confirmed') return;
        this.supplierEvaluationService.create(formData)
          .subscribe({
            next: (response) => {
              this.snackBar.open('Supplier Evaluation submitted successfully!', 'Close', {
                duration: 3000,
                panelClass: ['success-snackbar']
              });
              this.evaluationForm.reset();
              this.averageRating = 0;
              this.calculatedDecision = null;
            },
            error: (error) => {
              console.error('Error submitting evaluation:', error);
              this.snackBar.open('Error submitting evaluation. Please try again.', 'Close', {
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
}
