import { Component, OnInit } from '@angular/core';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { Router, ActivatedRoute } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { ApiService } from 'app/core/services/api.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { PROJECT_QUALITY_ASSURANCE_PLAN_DOCUMENTS } from '../project-quality-assurance-plan-documents';

interface ScopeOfServiceItem {
  label: string;
  checked: boolean;
  otherText?: string;
}

export interface ProjectQualityAssurancePlan {
  id: string;
  revision: string;
  date: string;
  preparedBy: string;
  approvedBy: string;
  acknowledgedBy: string;
  projectName: string;
  projectNo: string;
  scopeOfServices: ScopeOfServiceItem[];
  projectTeam: {
    di: string;
    tl: string;
    bm: string;
    pmCmRe: string;
    pm: string;
    cm: string;
    re: string;
  };
  projectCoordinators: Array<{discipline: string, coordinator: string}>;
  vveReviewers: Array<{discipline: string, reviewer: string}>;
  designReviewSchedule: Array<{item: string, review: boolean, verification: boolean, validation: boolean}>;
  qualityPlanScheduleDetailed: Array<{
    item: string;
    proposedSchedule: string;
    reviewRequired: boolean;
    verificationValidationRequired: boolean;
    reviewerCs: string;
    reviewerMep: string;
    initialCs: string;
    initialMep: string;
    reviewDate: string;
  }>;
  documentsRequired: Array<{
    document: string;
    detail: string;
    required: boolean;
    completionStage: string;
    responsiblePersonnel: string;
  }>;
  beforeDocumentsIssued: boolean;
  within14DaysAfterDocumentsIssued: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-project-quality-assurance-plan-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    FuseAlertComponent,
    ViewActionsComponent
  ],
  templateUrl: './project-quality-assurance-plan-view.component.html',
  styleUrls: ['./project-quality-assurance-plan-view.component.scss']
})
export class ProjectQualityAssurancePlanViewComponent implements OnInit {
  plan: ProjectQualityAssurancePlan | null = null;
  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;
  private employeeLookup = new Map<string, string>();

  constructor(
    private apiService: ApiService,
    private employeeService: EmployeeService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(
      switchMap(params => {
        if (!params['id']) return of(null);
        this.isLoading = true;
        
        // Load plan and employee lookup in parallel or sequence
        return forkJoin({
          lookup: this.employeeService.getEmployeeLookupMap(),
          planResponse: this.apiService.getProjectQualityAssurancePlan(params['id'])
        });
      })
    ).subscribe({
      next: (results) => {
        if (!results) {
          this.isLoading = false;
          return;
        }

        this.employeeLookup = results.lookup;
        const res = results.planResponse;

        if (!res?.status || !res?.data) {
          this.plan = null;
          this.alert = {
            type: 'warning',
            message: 'Plan data could not be loaded.'
          };
        } else {
          this.plan = this.mapApiPlanToViewModel(res.data);
        }
        this.isLoading = false;
      },
      error: () => {
        this.plan = null;
        this.alert = {
          type: 'error',
          message: 'Failed to load project quality assurance plan.'
        };
        this.isLoading = false;
      }
    });
  }

  private loadPlan(id: string): void {
    this.isLoading = true;

    this.apiService.getProjectQualityAssurancePlan(id).subscribe({
      next: (res) => {
        if (!res?.status || !res?.data) {
          this.plan = null;
          this.alert = {
            type: 'warning',
            message: 'Plan data could not be loaded.'
          };
          this.isLoading = false;
          return;
        }

        this.plan = this.mapApiPlanToViewModel(res.data);
        this.isLoading = false;
      },
      error: () => {
        this.plan = null;
        this.alert = {
          type: 'error',
          message: 'Failed to load project quality assurance plan.'
        };
        this.isLoading = false;
      }
    });
  }

  private mapApiPlanToViewModel(data: any): ProjectQualityAssurancePlan {
    return {
      id: String(data.id ?? ''),
      revision: data.revision ?? '-',
      date: data.date ?? data.plan_date ?? '',
      preparedBy: this.resolveEmployeeRef(data.prepared_by_tl),
      approvedBy: this.resolveEmployeeRef(data.approved_by_di),
      acknowledgedBy: this.resolveEmployeeRef(data.acknowledged_by_vve),
      projectName: data.project_name ?? '-',
      projectNo: data.project_no ?? '-',
      scopeOfServices: this.buildScopeOfServices(data),
      projectTeam: {
        di: this.resolveEmployeeRef(data.team_di),
        tl: this.resolveEmployeeRef(data.team_tl),
        bm: this.resolveEmployeeRef(data.team_bm ?? data.team_pm),
        pmCmRe: this.resolveEmployeeRef(data.team_pm),
        pm: this.resolveEmployeeRef(data.team_pm),
        cm: this.resolveEmployeeRef(data.team_cm),
        re: this.resolveEmployeeRef(data.team_re)
      },
      projectCoordinators: [
        { discipline: 'C&S', coordinator: this.resolveEmployeeRef(data.coord_cs) },
        { discipline: 'M&E', coordinator: this.resolveEmployeeRef(data.coord_me) },
        { discipline: 'LEED/ESD', coordinator: this.resolveEmployeeRef(data.coord_leed_esd) },
        { discipline: 'Facade', coordinator: this.resolveEmployeeRef(data.coord_facade) },
        { discipline: 'Lighting', coordinator: this.resolveEmployeeRef(data.coord_lighting) },
        { discipline: 'Transport', coordinator: this.resolveEmployeeRef(data.coord_transport) },
        { discipline: 'BCO', coordinator: this.resolveEmployeeRef(data.coord_bco) },
        { discipline: 'Others', coordinator: this.resolveEmployeeRef(data.coord_others) }
      ].filter(item => item.coordinator !== '-'),
      vveReviewers: this.buildReviewers(data),
      designReviewSchedule: this.buildDesignReviewSchedule(data),
      qualityPlanScheduleDetailed: this.buildQualityPlanScheduleDetailed(data),
      documentsRequired: this.buildDocumentsRequired(),
      beforeDocumentsIssued: !!data.validation_before_docs_issued,
      within14DaysAfterDocumentsIssued: !!data.validation_within_14days_after_docs,
      status: data.status ?? 'draft',
      createdAt: data.created_at ?? '',
      updatedAt: data.updated_at ?? ''
    };
  }

  private buildScopeOfServices(data: any): ScopeOfServiceItem[] {
    return [
      { label: 'C&S', checked: !!data.scope_cs },
      { label: 'MEP', checked: !!data.scope_me },
      { label: 'LEED/ ESD', checked: !!data.scope_leed_esd },
      { label: 'Facade', checked: !!data.scope_facade },
      { label: 'Lighting', checked: !!data.scope_lighting },
      { label: 'Transportation', checked: !!data.scope_transport },
      { label: 'Geotechnical', checked: !!data.scope_geotechnical },
      { label: 'Engineering Audit', checked: !!data.scope_engineering_audit },
      { label: 'PM', checked: !!data.scope_pm },
      { label: 'CM', checked: !!data.scope_cm },
      { label: 'QS', checked: !!data.scope_qs },
      {
        label: 'Others',
        checked: !!data.scope_others_flag,
        otherText: String(data.scope_others_text ?? '').trim()
      }
    ];
  }

  private buildReviewers(data: any): Array<{ discipline: string; reviewer: string }> {
    if (Array.isArray(data.vve_reviewers) && data.vve_reviewers.length) {
      return data.vve_reviewers.map((item: any) => ({
        discipline: item.discipline ?? '-',
        reviewer: this.resolveEmployeeRef(item.reviewer ?? item.name ?? item.value)
      }));
    }

    return [];
  }

  private buildDesignReviewSchedule(data: any): Array<{ item: string; review: boolean; verification: boolean; validation: boolean }> {
    if (Array.isArray(data.quality_plan_schedule) && data.quality_plan_schedule.length) {
      return data.quality_plan_schedule.map((item: any) => ({
        item: item.item ?? item.item_key ?? '-',
        review: !!item.review_required_cs,
        verification: !!item.review_required_mep,
        validation: !!item.review_date || !!item.initial_cs || !!item.initial_mep
      }));
    }

    return [];
  }

  private buildQualityPlanScheduleDetailed(data: any): ProjectQualityAssurancePlan['qualityPlanScheduleDetailed'] {
    if (!Array.isArray(data.quality_plan_schedule) || !data.quality_plan_schedule.length) {
      return [];
    }

    return data.quality_plan_schedule.map((item: any) => ({
      item: item.item ?? item.item_key ?? '-',
      proposedSchedule: item.proposed_schedule ?? '',
      reviewRequired: !!item.review_required_cs,
      verificationValidationRequired: !!item.review_required_mep,
      reviewerCs: item.reviewer_cs ?? '-',
      reviewerMep: item.reviewer_mep ?? '-',
      initialCs: this.resolveEmployeeRef(item.initial_cs),
      initialMep: this.resolveEmployeeRef(item.initial_mep),
      reviewDate: item.review_date ?? ''
    }));
  }

  private buildDocumentsRequired(): ProjectQualityAssurancePlan['documentsRequired'] {
    return PROJECT_QUALITY_ASSURANCE_PLAN_DOCUMENTS.map((item) => ({ ...item }));
  }

  private joinValues(value: unknown): string {
    if (Array.isArray(value)) {
      const arr = value
        .map(item => String(item ?? '').trim())
        .filter(Boolean);
      return arr.length ? arr.join(', ') : '-';
    }

    const str = String(value ?? '').trim();
    if (!str) {
      return '-';
    }

    return str
      .split(/[;,]/)
      .map(item => item.trim())
      .filter(Boolean)
      .join(', ');
  }

  private resolveEmployeeRef(value: unknown): string {
    if (!value) return '-';

    let strings: string[] = [];
    if (Array.isArray(value)) {
      strings = value.map(v => String(v ?? '').trim()).filter(Boolean);
    } else {
      strings = String(value)
        .split(/[;,]/)
        .map(v => v.trim())
        .filter(Boolean);
    }

    if (strings.length === 0) return '-';

    return strings
      .map(code => this.employeeService.formatEmployeeReference(code, this.employeeLookup))
      .join(', ');
  }

  onBack(): void {
    this.router.navigate(['/project-quality-assurance-plan']);
  }

  onEdit(): void {
    if (this.plan) {
      this.router.navigate(['/project-quality-assurance-plan/edit', this.plan.id]);
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'reviewed':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'acknowledged':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'submitted':
        return 'Submitted';
      case 'reviewed':
        return 'Reviewed';
      case 'approved':
        return 'Approved';
      case 'acknowledged':
        return 'Acknowledged';
      default:
        return status;
    }
  }

  formatDate(dateString: string): string {
    return formatDateDisplay(dateString);
  }
}
