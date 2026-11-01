import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import {
  ProposalContractReviewProject,
  ProposalContractReviewService,
} from 'app/core/services/proposal-contract-review.service';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-proposal-contract-review-projects',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    FuseAlertComponent,
  ],
  templateUrl: './proposal-contract-review-projects.component.html',
  styleUrls: ['./proposal-contract-review-projects.component.scss'],
})
export class ProposalContractReviewProjectsComponent implements OnInit {
  reviewId = '';
  review: any = null;
  projects: ProposalContractReviewProject[] = [];
  isLoading = false;
  isSaving = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  readonly disciplines = [
    { value: 'general', label: 'General', prefix: 'MT' },
    { value: 'facade', label: 'Facade', prefix: 'MFT' },
    { value: 'lighting', label: 'Lighting', prefix: 'LMT' },
    { value: 'transportation', label: 'Transportation', prefix: 'TMT' },
  ];

  readonly currencies = ['THB', 'USD'];

  readonly projectTypes = [
    { code: 'A', name: 'Commercial-Office' },
    { code: 'B', name: 'Commercial-General' },
    { code: 'C', name: 'Industrial' },
    { code: 'D', name: 'Institutional' },
    { code: 'E', name: 'Leisure/Recreation/Tourism' },
    { code: 'H', name: 'Infrastructure/Utilities' },
    { code: 'I', name: 'Residential' },
    { code: 'K', name: 'Miscellaneous' },
    { code: 'L', name: 'Geotechnical' },
    { code: 'M', name: 'Environmental' },
    { code: 'Q', name: 'Aviation' },
    { code: 'R', name: 'Accredited Checking & Value Engineering' },
    { code: 'S', name: 'Healthcare' },
    { code: 'T', name: 'Fitout' },
    { code: 'U', name: 'Building Audit' },
    { code: 'V', name: 'PM/CM' },
  ];

  form = this.fb.group({
    project_name: ['', Validators.required],
    primary_discipline: ['general', Validators.required],
    project_type: [''],
    currency: ['THB', Validators.required],
    estimated_total_fees: [null as number | null],
    sequence_no: [null as number | null],
    mt_project_no: [''],
  });

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private proposalContractReviewService: ProposalContractReviewService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.reviewId = params.get('id') || '';
      if (this.reviewId) {
        this.loadData();
      }
    });
  }

  loadData(): void {
    this.isLoading = true;
    this.alert = null;

    forkJoin({
      review: this.proposalContractReviewService.getById(this.reviewId),
      projects: this.proposalContractReviewService.getProjects(this.reviewId),
    })
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: ({ review, projects }) => {
          this.review = review?.data ?? review;
          this.projects = projects;
          this.patchDefaults();
        },
        error: (err) => {
          this.alert = { type: 'error', message: err?.error?.message || 'Failed to load MT projects' };
        },
      });
  }

  createProject(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.canCreateProject()) {
      this.alert = { type: 'error', message: 'Contract Review must be proceeded before creating MT project numbers.' };
      return;
    }

    this.isSaving = true;
    this.alert = null;

    const value = this.form.getRawValue();
    const payload = Object.entries(value).reduce((result, [key, currentValue]) => {
      if (currentValue !== null && currentValue !== undefined && String(currentValue).trim() !== '') {
        result[key] = currentValue;
      }
      return result;
    }, {} as Record<string, any>);

    this.proposalContractReviewService
      .createProject(this.reviewId, payload)
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: (res: any) => {
          const review = res?.data?.review;
          this.review = review ?? this.review;
          this.projects = (review?.projects ?? review?.mt_projects ?? this.projects)
            .map((project: any) => this.proposalContractReviewService.toProject(project));

          if (!review) {
            this.loadData();
          }

          this.alert = { type: 'success', message: 'MT project number created successfully.' };
          this.resetFormForNextProject();
        },
        error: (err) => {
          this.alert = { type: 'error', message: err?.error?.message || 'Failed to create MT project number' };
        },
      });
  }

  canCreateProject(): boolean {
    const decision = String(this.review?.contract_decision ?? this.review?.contractDecision ?? '').toLowerCase();
    const proceedValue = this.review?.contract_agreed_to_proceed ?? this.review?.contractAgreedToProceed;
    const status = String(this.review?.status ?? '').toLowerCase();

    return decision === 'proceed'
      || this.toBool(proceedValue)
      || ['contract_approved', 'approved', 'contract_reviewed'].includes(status);
  }

  onBack(): void {
    this.router.navigate(['/proposal-contract-review/view', this.reviewId]);
  }

  formatCurrency(value: number | null | undefined, currency = 'THB'): string {
    const amount = Number(value ?? 0);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'THB',
      minimumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  formatDateTime(value: string | null | undefined): string {
    return value ? formatDateTimeDisplay(value) : '-';
  }

  get nextSequenceNo(): number {
    const max = this.projects.reduce((current, project) => Math.max(current, Number(project.sequenceNo || 0)), 0);
    return max + 1;
  }

  get disciplinePrefix(): string {
    const discipline = this.form.get('primary_discipline')?.value;
    return this.disciplines.find((item) => item.value === discipline)?.prefix ?? 'MT';
  }

  private patchDefaults(): void {
    const primaryDiscipline = this.normalizeDiscipline(
      this.review?.primary_discipline ?? this.review?.primaryDiscipline ?? 'general'
    );

    this.form.patchValue({
      project_name: this.review?.project_name ?? this.review?.projectName ?? '',
      primary_discipline: primaryDiscipline,
      project_type: this.normalizeProjectType(this.review?.project_type ?? this.review?.projectType),
      currency: this.review?.currency ?? 'THB',
      estimated_total_fees: this.toNumberOrNull(this.review?.estimated_total_fees ?? this.review?.estimatedTotalFees),
      sequence_no: this.nextSequenceNo,
      mt_project_no: '',
    });
  }

  private resetFormForNextProject(): void {
    const current = this.form.getRawValue();
    this.form.reset({
      project_name: current.project_name || this.review?.project_name || '',
      primary_discipline: current.primary_discipline || 'general',
      project_type: current.project_type || this.normalizeProjectType(this.review?.project_type),
      currency: current.currency || this.review?.currency || 'THB',
      estimated_total_fees: current.estimated_total_fees,
      sequence_no: this.nextSequenceNo,
      mt_project_no: '',
    });
  }

  private normalizeDiscipline(value: any): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['facade', 'lighting', 'transportation'].includes(normalized)) {
      return normalized;
    }
    if (['transport', 'traffic'].includes(normalized)) {
      return 'transportation';
    }
    return 'general';
  }

  private normalizeProjectType(value: any): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) return '';

    const match = this.projectTypes.find((type) =>
      type.code === normalized || type.name === normalized || `${type.code} - ${type.name}` === normalized
    );

    return match?.code ?? normalized;
  }

  private toNumberOrNull(value: any): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private toBool(value: any): boolean {
    const normalized = String(value ?? '').trim().toLowerCase();
    return value === true || value === 1 || ['1', 'yes', 'true', 'proceed'].includes(normalized);
  }
}
