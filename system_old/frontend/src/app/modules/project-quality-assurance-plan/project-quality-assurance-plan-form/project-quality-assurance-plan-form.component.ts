import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService } from 'app/core/services/api.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';
import { ExternalProject, ExternalProjectService } from 'app/core/services/external-project.service';
import { PROJECT_QUALITY_ASSURANCE_PLAN_DOCUMENTS } from '../project-quality-assurance-plan-documents';
import {
  buildPqpRequiredFieldMessage,
  resolvePqpSubmitErrorMessage,
} from './project-quality-assurance-plan-submit.util';

import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormArray,
  FormControl,
} from '@angular/forms';
import { catchError, finalize, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { remoteSearchTerms } from 'app/shared/remote-search/remote-search.util';

// Deprecated local mock types (kept temporarily for backward compatibility with helpers)
export interface Employee {
  id: string;
  name: string;
  position: string;
  department: string;
}



@Component({
  selector: 'app-project-quality-assurance-plan-form',
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
    MatChipsModule,
    NgxMatSelectSearchModule,
    ViewActionsComponent,
  ],
  templateUrl: './project-quality-assurance-plan-form.component.html',
  styleUrls: ['./project-quality-assurance-plan-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectQualityAssurancePlanFormComponent implements OnInit, OnDestroy {
  form: FormGroup;
  isSubmitting = false;
  isEditMode = false;
  isLoading = false;
  isView = false;
  currentId: string | null = null;
  private loadedPlanData: any | null = null;

  // Employees from API (ใช้กับ dropdown TL/DI/BM/TL/SC/IMS)
  users: EmployeeOption[] = [];
  filteredPreparedUsers: EmployeeOption[] = [];
  filteredApprovedUsers: EmployeeOption[] = [];
  filteredAcknowledgedUsers: EmployeeOption[] = [];
  filteredInitialUsers: EmployeeOption[] = [];
  filteredCoordinatorUsers: EmployeeOption[] = [];
  filteredDiUsers: EmployeeOption[] = [];
  filteredTlUsers: EmployeeOption[] = [];
  filteredBmUsers: EmployeeOption[] = [];
  filteredPmUsers: EmployeeOption[] = [];

  // Search controls for header dropdowns
  preparedSearchCtrl = new FormControl('');
  approvedSearchCtrl = new FormControl('');
  acknowledgedSearchCtrl = new FormControl('');
  initialSearchCtrl = new FormControl('');
  coordinatorSearchCtrl = new FormControl('');
  diSearchCtrl = new FormControl('');
  tlSearchCtrl = new FormControl('');
  bmSearchCtrl = new FormControl('');
  pmSearchCtrl = new FormControl('');
  headerEmployeeSearchLoading = {
    prepared: false,
    approved: false,
    acknowledged: false,
  };

  // Cache for all loaded employees to support autocomplete persistence
  allLoadedEmployees: Map<string, EmployeeOption> = new Map();

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  projectSearchCtrl = new FormControl('');
  filteredProjectOptions: ExternalProject[] = [];

  // Scope of Services options
  scopeOfServicesOptions = [
    'C&S',
    'M&E',
    'LEED/ESD',
    'Facade',
    'Lighting',
    'Transportation',
    'Geotechnical',
    'Engineering Audit',
    'PM',
    'CM',
    'QS',
    'Others',
  ];

  // Project Team positions
  projectTeamPositions = ['DI', 'TL', 'PM', 'CM', 'RE'];

  // Project Coordinator disciplines
  coordinatorDisciplines = [
    'C&S',
    'Facade',
    'Others',
    'M&E',
    'Lighting',
    'LEED/ESD',
    'Transport',
  ];

  // VVE/Reviewer disciplines
  reviewerDisciplines = [
    'C&S',
    'MVAC',
    'Facade',
    'Others',
    'Geotechnical',
    'Electrical',
    'Lighting',
    'LEED/ESD',
    'SN & FP',
    'Transport',
  ];

  // Design Review items
  designReviewItems = [
    'DCR/Design Brief/Conceptual Stage',
    'Peer Review',
    'Submission Stage',
    'Tender Stage',
    'Construction Stage',
    'Final Design (for Transportation)',
    'Engineering Audit/Report',
  ];

  qualityPlanScheduleItems = [
    { key: 'concept_preliminary', item: 'Concept / Preliminary Stage', reviewerCs: 'TL/VVE', reviewerMep: 'DL', isReview: false, isVerification: false },
    { key: 'peer_review', item: 'Peer Review', reviewerCs: 'VVE', reviewerMep: 'DL', isReview: false, isVerification: false },
    { key: 'dcr_schematic_design', item: 'DCR / Schematic Design Stage', reviewerCs: 'TL', reviewerMep: 'DL', isReview: false, isVerification: false },
    { key: 'submission', item: 'Submission Stage', reviewerCs: 'Endorsed Eng or Wutthi or TL or PE', reviewerMep: 'Endorsed Eng or Wutthi or SE', isReview: false, isVerification: false },
    { key: 'tender', item: 'Tender Stage (Review / Verification)', reviewerCs: 'EE/VVE', reviewerMep: 'SE/DL', isReview: false, isVerification: true },
    { key: 'construction', item: 'Construction Stage (Review / Validation)', reviewerCs: 'EE/TL', reviewerMep: 'SE/TL', isReview: false, isVerification: true },
    { key: 'final_design_transportation', item: 'Final Design (Transportation)', reviewerCs: '-', reviewerMep: 'TL', isReview: false, isVerification: false },
    { key: 'engineering_audit_report', item: 'Engineering Audit / Report', reviewerCs: 'TL', reviewerMep: 'TL', isReview: false, isVerification: false },
  ];

  readonly documentsRequiredItems = PROJECT_QUALITY_ASSURANCE_PLAN_DOCUMENTS;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private apiService: ApiService,
    private employeeService: EmployeeService,
    private projectService: ExternalProjectService,
    private fuseConfirmationService: FuseConfirmationService,
    private toastr: ToastrService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    this.initializeForm();
    this.loadUsers();
    this.setupProjectSearch();
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  // ---------- Form setup ----------

  /**
   * Helper to update filtered users while preserving current selection
   */
  private updateFilteredUsers(
    newResults: EmployeeOption[],
    selectedId: string | number | Array<string | number> | null | undefined,
    filteredArraySetter: (val: EmployeeOption[]) => void
  ): void {
    this.rememberEmployeeOptions(newResults);

    const selectedIds = (Array.isArray(selectedId) ? selectedId : [selectedId])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);
    const selectedOptions = selectedIds
      .map((value) => this.employeeService.getCachedEmployeeOptionByReference(value)
        ?? this.allLoadedEmployees.get(value))
      .filter((employee): employee is EmployeeOption => !!employee);
    const selectedKeys = new Set(selectedOptions.flatMap((employee) => [
      String(employee.id ?? ''),
      String(employee.employeeId ?? ''),
      String(employee.code ?? ''),
    ]).filter(Boolean));

    filteredArraySetter([
      ...selectedOptions,
      ...newResults.filter((employee) => ![
        String(employee.id ?? ''),
        String(employee.employeeId ?? ''),
        String(employee.code ?? ''),
      ].some((key) => key && selectedKeys.has(key))),
    ]);
  }

  private rememberEmployeeOptions(employees: EmployeeOption[]): void {
    this.employeeService.rememberEmployeeOptions(employees);
    employees.forEach((employee) => {
      if (employee.id) this.allLoadedEmployees.set(String(employee.id), employee);
      if (employee.employeeId) this.allLoadedEmployees.set(String(employee.employeeId), employee);
      if (employee.code) this.allLoadedEmployees.set(employee.code, employee);
    });
  }

  private getHeaderEmployeeSelections(controlName: 'preparedBy' | 'approvedBy' | 'acknowledgedBy'): Array<string | number> {
    return this.headerRows.controls
      .map((row) => row.get(controlName)?.value)
      .filter((value) => value !== null && value !== undefined && value !== '');
  }

  private createForm(): FormGroup {
    return this.fb.group({
      // Header หลายแถว (ใช้ในตาราง + ปุ่ม Add)
      headerRows: this.fb.array([this.createHeaderRow()]),

      // Legacy mirrors kept for payload/edit compatibility. The visible headerRows
      // controls own validation; requiring these hidden mirrors blocks submission.
      revision: [''],
      date: [new Date()],
      preparedBy: [''],
      approvedBy: [''],
      acknowledgedBy: [''],

      // Section A - Project Details
      projectId: ['', [Validators.required]],
      projectName: ['', [Validators.required]],
      projectNo: ['', [Validators.required]],

      // Section B - Project Team & Coordinators (single-line format under A.)
      di: [''],
      TL: [[]],
      bm: [[]],
      pmCmRe: [[]],
      cm: [''],
      re: [''],

      csCoordinator: [[]],
      mepCoordinator: [[]],
      leedCoordinator: [[]],
      facadeCoordinator: [[]],
      lightingCoordinator: [[]],
      transportCoordinator: [[]],
      bcoCoordinator: [[]],
      othersCoordinator: [[]],

      // Scope of Services flags (map 1:1 to API fields)
      scope_cs: [false],
      scope_me: [false],
      scope_leed_esd: [false],
      scope_facade: [false],
      scope_lighting: [false],
      scope_pm: [false],
      scope_cm: [false],
      scope_transport: [false],
      scope_geotechnical: [false],
      scope_qs: [false],
      scope_engineering_audit: [false],
      scope_others_flag: [false],
      scope_others_text: [''],

      // Project Coordinators (dynamic table - not yet bound as array to API)
      projectCoordinators: this.fb.array([]),

      // Construction Stage Documents Validation
      beforeDocumentsIssued: [false],
      within14DaysAfterDocumentsIssued: [false],

      qualityPlanSchedules: this.fb.array(
        this.qualityPlanScheduleItems.map((item) => this.createQualityPlanScheduleRow(item))
      ),

      status: ['draft'],
    });
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
        this.cdr.markForCheck();
      });

    this.projectService
      .getProjects('', 20)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe((projects) => {
        this.filteredProjectOptions = projects;
        this.cdr.markForCheck();
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

  /** แถว header 1 แถว */
  private createHeaderRow(): FormGroup {
    return this.fb.group({
      revision: ['Rev. 01', Validators.required],
      date: [new Date(), Validators.required],
      preparedBy: ['', Validators.required],
      approvedBy: ['', Validators.required],
      acknowledgedBy: ['', Validators.required],
    });
  }

  private createQualityPlanScheduleRow(item?: any): FormGroup {
    return this.fb.group({
      proposedSchedule: [null],
      isReview: [item?.isReview ?? false],
      isVerification: [item?.isVerification ?? false],
      initialCs: [''],
      initialMep: [''],
      reviewDate: [null],
    });
  }

  private initializeForm(): void {
    this.isLoading = true;

    this.route.params.subscribe((params) => {
      const id = params['id'];

      if (id) {
        this.isEditMode = true;
        this.currentId = id;
        this.isView = this.route.snapshot.url.some(segment => segment.path === 'view');
        this.loadPlan(id);
      } else {
        // new mode
        this.isEditMode = false;
        this.currentId = null;

        this.form.patchValue({
          status: 'draft',
          date: new Date(),
        });

        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * โหลดรายชื่อพนักงานจาก API สำหรับใช้ใน dropdown TL/DI/BM/TL/SC/IMS
   */
  private loadUsers(): void {
    this.employeeService.getEmployeeOptions().subscribe({
      next: (employees) => {
        this.users = employees;

        this.rememberEmployeeOptions(employees);

        this.filteredPreparedUsers = employees;
        this.filteredApprovedUsers = employees;
        this.filteredAcknowledgedUsers = employees;
        this.filteredInitialUsers = employees;
        this.filteredCoordinatorUsers = employees;
        this.filteredDiUsers = employees;
        this.filteredTlUsers = employees;
        this.filteredBmUsers = employees;
        this.filteredPmUsers = employees;

        this.setupEmployeeSearchFilters();

        if (this.loadedPlanData) {
          this.patchPlanData(this.loadedPlanData);
          this.cdr.markForCheck();
        }
      },
      error: () => {
        this.users = [];
        this.filteredPreparedUsers = [];
        this.filteredApprovedUsers = [];
        this.filteredAcknowledgedUsers = [];
        this.filteredInitialUsers = [];
        this.filteredCoordinatorUsers = [];
        this.filteredDiUsers = [];
        this.filteredTlUsers = [];
        this.filteredBmUsers = [];
        this.filteredPmUsers = [];
      },
    });
  }

  /**
   * ตั้งค่า search แบบ real-time ให้ dropdown TL/DI/BM/TL/SC/IMS
   */
  private setupEmployeeSearchFilters(): void {
    // Prepared by (TL)
    this.observeHeaderEmployeeSearch(this.preparedSearchCtrl, 'prepared', (employees) => {
        this.updateFilteredUsers(
          employees,
          this.getHeaderEmployeeSelections('preparedBy'),
          (val) => this.filteredPreparedUsers = val
        );
      });

    // Approved by (DI)
    this.observeHeaderEmployeeSearch(this.approvedSearchCtrl, 'approved', (employees) => {
        this.updateFilteredUsers(
          employees,
          this.getHeaderEmployeeSelections('approvedBy'),
          (val) => this.filteredApprovedUsers = val
        );
      });

    // Acknowledged by (BM/TL/SC/IMS)
    this.observeHeaderEmployeeSearch(this.acknowledgedSearchCtrl, 'acknowledged', (employees) => {
        this.updateFilteredUsers(
          employees,
          this.getHeaderEmployeeSelections('acknowledgedBy'),
          (val) => this.filteredAcknowledgedUsers = val
        );
      });

    // Initial (C&S / MEP) search
    this.initialSearchCtrl.valueChanges
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
        employees.forEach(u => {
          if (u.id) this.allLoadedEmployees.set(String(u.id), u);
          if (u.code) this.allLoadedEmployees.set(u.code, u);
        });
        this.filteredInitialUsers = employees;
        this.cdr.markForCheck();
      });

    // Project Coordinator search
    this.coordinatorSearchCtrl.valueChanges
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
        employees.forEach(u => {
          if (u.id) this.allLoadedEmployees.set(String(u.id), u);
          if (u.code) this.allLoadedEmployees.set(u.code, u);
        });

        this.filteredCoordinatorUsers = this.mergeSelectedCoordinatorUsers(employees);
        this.cdr.markForCheck();
      });

    // DI search
    this.diSearchCtrl.valueChanges
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
        this.updateFilteredUsers(
          employees,
          this.form.get('di')?.value,
          (val) => this.filteredDiUsers = val
        );
        this.cdr.markForCheck();
      });

    // TL search
    this.tlSearchCtrl.valueChanges
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
        this.updateFilteredUsers(
          employees,
          this.form.get('TL')?.value,
          (val) => this.filteredTlUsers = val
        );
        this.cdr.markForCheck();
      });

    // BM search
    this.bmSearchCtrl.valueChanges
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
        this.updateFilteredUsers(
          employees,
          this.form.get('bm')?.value,
          (val) => this.filteredBmUsers = val
        );
        this.cdr.markForCheck();
      });

    // PM/CM/RE search
    this.pmSearchCtrl.valueChanges
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
        this.updateFilteredUsers(
          employees,
          this.form.get('pmCmRe')?.value,
          (val) => this.filteredPmUsers = val
        );
        this.cdr.markForCheck();
      });

  }

  // ---------- Load existing plan (Edit mode) ----------

  private loadPlan(id: string): void {
    this.apiService.getProjectQualityAssurancePlan(id).subscribe({
      next: (res) => {
        if (!res?.status || !res.data) {
          this.isLoading = false;
          this.cdr.markForCheck();
          return;
        }

        this.loadedPlanData = res.data;
        this.patchPlanData(this.loadedPlanData);

        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private patchPlanData(d: any): void {
    const preparedById = this.resolveEmployeeSelectId(d.prepared_by_tl);
    const approvedById = this.resolveEmployeeSelectId(d.approved_by_di);
    const acknowledgedById = this.resolveEmployeeSelectId(d.acknowledged_by_vve);
    const apiDate = this.parseApiDate(d.date ?? d.plan_date);

    this.form.patchValue({
      revision: d.revision ?? '',
      date: apiDate,
      preparedBy: preparedById,
      approvedBy: approvedById,
      acknowledgedBy: acknowledgedById,

      projectName: d.project_name ?? '',
      projectId: d.project_id ?? '',
      projectNo: d.project_no ?? '',

      di: this.resolveEmployeeDisplayLabel(d.team_di),
      TL: this.resolveEmployeeDisplayLabelArray(d.team_tl),
      bm: this.resolveEmployeeDisplayLabelArray(d.team_bm ?? d.team_pm),
      pmCmRe: this.resolveEmployeeDisplayLabelArray(d.team_pm),
      cm: this.resolveEmployeeDisplayLabel(d.team_cm),
      re: this.resolveEmployeeDisplayLabel(d.team_re),

      csCoordinator: this.resolveEmployeeDisplayLabels(d.coord_cs),
      mepCoordinator: this.resolveEmployeeDisplayLabels(d.coord_me),
      leedCoordinator: this.resolveEmployeeDisplayLabels(d.coord_leed_esd),
      facadeCoordinator: this.resolveEmployeeDisplayLabels(d.coord_facade),
      lightingCoordinator: this.resolveEmployeeDisplayLabels(d.coord_lighting),
      transportCoordinator: this.resolveEmployeeDisplayLabels(d.coord_transport),
      bcoCoordinator: this.resolveEmployeeDisplayLabels(d.coord_bco),
      othersCoordinator: this.resolveEmployeeDisplayLabels(d.coord_others),

      scope_cs: !!d.scope_cs,
      scope_me: !!d.scope_me,
      scope_leed_esd: !!d.scope_leed_esd,
      scope_facade: !!d.scope_facade,
      scope_lighting: !!d.scope_lighting,
      scope_pm: !!d.scope_pm,
      scope_cm: !!d.scope_cm,
      scope_transport: !!d.scope_transport,
      scope_geotechnical: !!d.scope_geotechnical,
      scope_qs: !!d.scope_qs,
      scope_engineering_audit: !!d.scope_engineering_audit,
      scope_others_flag: !!d.scope_others_flag,
      scope_others_text: d.scope_others_text ?? '',
      status: d.status ?? 'draft',

      beforeDocumentsIssued: !!d.validation_before_docs_issued,
      within14DaysAfterDocumentsIssued: !!d.validation_within_14days_after_docs,
    });

    // Patch Header Rows
    const headerArray = this.headerRows;
    headerArray.clear();
    const row = this.createHeaderRow();
    row.patchValue({
      revision: d.revision ?? '',
      date: apiDate,
      preparedBy: preparedById,
      approvedBy: approvedById,
      acknowledgedBy: acknowledgedById,
    });
    headerArray.push(row);

    // Patch Quality Plan Schedules
    if (d.quality_plan_schedule && Array.isArray(d.quality_plan_schedule)) {
      const schedules = this.qualityPlanSchedules;
      schedules.clear();

      this.qualityPlanScheduleItems.forEach((templateItem) => {
        const apiRow = d.quality_plan_schedule.find((s: any) => s.item_key === templateItem.key);
        const formRow = this.createQualityPlanScheduleRow(templateItem);

        if (apiRow) {
          formRow.patchValue({
            proposedSchedule: this.parseApiDate(apiRow.proposed_schedule),
            isReview: !!apiRow.review_required_cs,
            isVerification: !!apiRow.review_required_mep,
            initialCs: apiRow.initial_cs || '',
            initialMep: apiRow.initial_mep || '',
            reviewDate: this.parseApiDate(apiRow.review_date),
          });
        }
        schedules.push(formRow);
      });
    }

  }

  private observeHeaderEmployeeSearch(
    control: FormControl,
    loadingKey: keyof typeof this.headerEmployeeSearchLoading,
    applyResults: (employees: EmployeeOption[]) => void
  ): void {
    remoteSearchTerms(control, this._unsubscribeAll)
      .pipe(
        switchMap((search) => {
          this.headerEmployeeSearchLoading[loadingKey] = true;
          this.cdr.markForCheck();
          return this.employeeService.getEmployeeOptionsFromApi(search, 20).pipe(
            catchError(() => of([] as EmployeeOption[])),
            finalize(() => {
              this.headerEmployeeSearchLoading[loadingKey] = false;
              this.cdr.markForCheck();
            })
          );
        })
      )
      .subscribe((employees) => {
        applyResults(employees);
        this.cdr.markForCheck();
      });
  }

  // ---------- Submit / Cancel ----------

  /** รองรับทั้ง yyyy-MM-dd และ dd-MM-yyyy จาก API เดิม/ใหม่ */
  private parseApiDate(date: Date | string | null | undefined): Date | null {
    if (!date) return null;

    if (date instanceof Date) {
      return isNaN(date.getTime()) ? null : date;
    }

    const normalized = String(date).trim();
    const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const legacyMatch = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (legacyMatch) {
      const [, day, month, year] = legacyMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const parsed = new Date(normalized);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  /** แปลง Date ให้ตรง format ที่ backend ต้องการ (yyyy-MM-dd) */
  private formatDateForApi(date: Date | string | null): string | null {
    if (!date) return null;
    const d = this.parseApiDate(date);
    if (!d || isNaN(d.getTime())) {
      return null;
    }
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const seconds = d.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /** หา employee id จาก display name ของ API (เช่น "John Smith (TL)") */
  private findEmployeeIdByDisplayName(
    displayName: string | null | undefined
  ): string | null {
    if (!displayName) return null;

    const normalized = this.normalizeEmployeeValue(displayName);
    const emp = this.users.find((e) =>
      [
        e.displayLabel,
        e.name,
        e.code,
        e.id,
        e.email,
        [e.firstName, e.lastName].filter(Boolean).join(' '),
      ].some((candidate) => this.normalizeEmployeeValue(candidate) === normalized)
    );

    return emp ? emp.id : null;
  }

  private resolveEmployeeSelectId(value: string | null | undefined): string {
    return this.findEmployeeIdByDisplayName(value) ?? String(value ?? '');
  }

  private resolveEmployeeDisplayLabel(value: string | null | undefined): string {
    if (!value) return '';

    const normalized = this.normalizeEmployeeValue(value);
    const employee = this.users.find((e) =>
      [
        e.displayLabel,
        e.name,
        e.code,
        e.id,
        e.email,
        [e.firstName, e.lastName].filter(Boolean).join(' '),
      ].some((candidate) => this.normalizeEmployeeValue(candidate) === normalized)
    );

    return employee?.displayLabel ?? String(value);
  }

  private resolveEmployeeDisplayLabels(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.resolveEmployeeCode(String(item ?? '')))
        .filter(Boolean);
    }

    if (!value) return [];

    return String(value)
      .split(/[;,]/)
      .map((item) => this.resolveEmployeeCode(item.trim()))
      .filter(Boolean);
  }

  private resolveEmployeeCode(value: string | null | undefined): string {
    if (!value) return '';

    const normalized = this.normalizeEmployeeValue(value);
    const employee = this.users.find((e) =>
      [
        e.displayLabel,
        e.name,
        e.code,
        e.id,
        e.email,
        [e.firstName, e.lastName].filter(Boolean).join(' '),
      ].some((candidate) => this.normalizeEmployeeValue(candidate) === normalized)
    );

    return employee?.code ?? String(value);
  }

  private resolveEmployeeDisplayLabelArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(v => String(v));
    if (!value) return [];
    return String(value).split(',').map(v => v.trim()).filter(Boolean);
  }

  private joinCoordinatorValues(value: unknown): string | null {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    const normalized = values
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);

    return normalized.length ? normalized.join(',') : null;
  }

  private buildQualityPlanSchedulePayload(): any[] {
    return this.qualityPlanSchedules.controls.map((control, index) => {
      const row = control.value;
      const item = this.qualityPlanScheduleItems[index];

      return {
        item_key: item.key,
        item: item.item,
        proposed_schedule: this.formatDateForApi(row.proposedSchedule),
        review_required_cs: !!row.isReview,
        review_required_mep: !!row.isVerification,
        reviewer_cs: item.reviewerCs,
        reviewer_mep: item.reviewerMep,
        initial_cs: row.initialCs || null,
        initial_mep: row.initialMep || null,
        review_date: this.formatDateForApi(row.reviewDate),
      };
    });
  }

  private mergeSelectedCoordinatorUsers(options: EmployeeOption[]): EmployeeOption[] {
    const selectedValues = [
      'csCoordinator',
      'mepCoordinator',
      'leedCoordinator',
      'facadeCoordinator',
      'lightingCoordinator',
      'transportCoordinator',
      'bcoCoordinator',
      'othersCoordinator',
    ].flatMap((controlName) => this.form.get(controlName)?.value ?? []);

    const merged = [...options];
    const seen = new Set(merged.map((option) => option.code));

    selectedValues.forEach((value) => {
      const code = String(value ?? '');
      if (!code || seen.has(code)) return;

      const cached = Array.from(this.allLoadedEmployees.values())
        .find((employee) => employee.code === code);

      if (cached) {
        merged.unshift(cached);
        seen.add(code);
      }
    });

    return merged;
  }

  private normalizeEmployeeValue(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
  }

  /** สร้าง payload ให้ตรงกับ body ของ API */
  private buildApiPayload(): any {
    const v = this.form.value;
    const header0 = this.headerRows.at(0)?.value;

    const headerRevision = header0?.revision ?? v.revision;
    const headerDate = header0?.date ?? v.date;
    const headerPreparedBy = header0?.preparedBy ?? v.preparedBy;
    const headerApprovedBy = header0?.approvedBy ?? v.approvedBy;
    const headerAcknowledgedBy = header0?.acknowledgedBy ?? v.acknowledgedBy;

    return {
      revision: headerRevision,
      date: this.formatDateForApi(headerDate),

      prepared_by_tl: this.getEmployeeName(headerPreparedBy),
      approved_by_di: this.getEmployeeName(headerApprovedBy),
      acknowledged_by_vve: this.getEmployeeName(headerAcknowledgedBy),

      project_name: v.projectName,
      project_id: v.projectId || null,
      project_no: v.projectNo,

      scope_cs: !!v.scope_cs,
      scope_me: !!v.scope_me,
      scope_leed_esd: !!v.scope_leed_esd,
      scope_facade: !!v.scope_facade,
      scope_lighting: !!v.scope_lighting,
      scope_pm: !!v.scope_pm,
      scope_cm: !!v.scope_cm,
      scope_transport: !!v.scope_transport,
      scope_geotechnical: !!v.scope_geotechnical,
      scope_qs: !!v.scope_qs,
      scope_engineering_audit: !!v.scope_engineering_audit,
      scope_others_flag: !!v.scope_others_flag,
      scope_others_text: v.scope_others_text || null,

      team_di: v.di || null,
      team_tl: this.joinCoordinatorValues(v.TL),
      team_pm: this.joinCoordinatorValues(v.pmCmRe),
      team_bm: this.joinCoordinatorValues(v.bm),
      team_cm: v.cm || null,
      team_re: v.re || null,

      coord_cs: this.joinCoordinatorValues(v.csCoordinator),
      coord_facade: this.joinCoordinatorValues(v.facadeCoordinator),
      coord_others: this.joinCoordinatorValues(v.othersCoordinator),
      coord_me: this.joinCoordinatorValues(v.mepCoordinator),
      coord_lighting: this.joinCoordinatorValues(v.lightingCoordinator),
      coord_leed_esd: this.joinCoordinatorValues(v.leedCoordinator),
      coord_transport: this.joinCoordinatorValues(v.transportCoordinator),
      coord_bco: this.joinCoordinatorValues(v.bcoCoordinator),
      quality_plan_schedule: this.buildQualityPlanSchedulePayload(),

      // reviewer_* และ design review flags ยังไม่มีใน UI ตอนนี้
      reviewer_cs: null,
      reviewer_mvac: null,
      reviewer_facade: null,
      reviewer_others: null,
      reviewer_geotechnical: null,
      reviewer_electrical: null,
      reviewer_lighting: null,
      reviewer_leed_esd: null,
      reviewer_sn_fp: null,
      reviewer_transport: null,

      dcr_review: false,
      dcr_verification: false,
      dcr_validation: false,
      peer_review_review: false,
      peer_review_verification: false,
      peer_review_validation: false,
      submission_review: false,
      submission_verification: false,
      submission_validation: false,
      tender_review: false,
      tender_verification: true,
      tender_validation: true,
      construction_review: false,
      construction_verification: true,
      construction_validation: false,
      final_design_transport_review: false,
      final_design_transport_verification: false,
      final_design_transport_validation: false,
      engineering_audit_review: false,
      engineering_audit_verification: false,
      engineering_audit_validation: false,

      validation_before_docs_issued: !!v.beforeDocumentsIssued,
      validation_within_14days_after_docs: !!v.within14DaysAfterDocumentsIssued,
    };
  }

  onSubmit(): void {
    if (this.isSubmitting) return;

    if (!this.validateBeforeSubmit()) return;

    const confirmation = this.fuseConfirmationService.open({
      title: this.isEditMode ? 'Confirm update' : 'Confirm submit',
      message: this.isEditMode
        ? 'Are you sure you want to update this plan?'
        : 'Are you sure you want to submit this plan?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: this.isEditMode ? 'Update' : 'Submit', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      this.persistForm();
    });
  }

  private persistForm(): void {
    if (!this.validateBeforeSubmit()) return;

    this.isSubmitting = true;
    const payload = this.buildApiPayload();

    const request = this.isEditMode && this.currentId
      ? this.apiService.updateProjectQualityAssurancePlan(this.currentId, payload)
      : this.apiService.createProjectQualityAssurancePlan(payload);

    request.subscribe({
      next: (res) => {
        this.isSubmitting = false;
        if (res.status) {
          this.toastr.success(res.message || 'Saved successfully');
          this.router.navigate(['/project-quality-assurance-plan']);
        } else {
          this.toastr.error(res.message || 'Failed to save');
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isSubmitting = false;
        console.error('[Project Quality Assurance Plan] Save error:', err);
        this.toastr.error(resolvePqpSubmitErrorMessage(err));
        this.cdr.markForCheck();
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/project-quality-assurance-plan']);
  }

  // ---------- Helpers ----------

  private markFormGroupTouched(group: FormGroup | FormArray): void {
    Object.values(group.controls).forEach((control: any) => {
      if (control.controls) {
        this.markFormGroupTouched(control);
      } else {
        control.markAsTouched();
      }
    });
  }

  private validateBeforeSubmit(): boolean {
    if (this.form.valid) return true;

    this.markFormGroupTouched(this.form);
    this.toastr.error(buildPqpRequiredFieldMessage(this.getMissingRequiredFieldLabels()));
    this.cdr.markForCheck();
    setTimeout(() => this.scrollToFirstInvalidControl());
    return false;
  }

  private getMissingRequiredFieldLabels(): string[] {
    const labels: string[] = [];
    const headerFields: Array<[string, string]> = [
      ['revision', 'Revision'],
      ['date', 'Date'],
      ['preparedBy', 'Prepared by (TL)'],
      ['approvedBy', 'Approved by (DI)'],
      ['acknowledgedBy', 'Acknowledged by'],
    ];

    this.headerRows.controls.forEach((row, index) => {
      const rowSuffix = this.headerRows.length > 1 ? ` (row ${index + 1})` : '';
      headerFields.forEach(([controlName, label]) => {
        if (row.get(controlName)?.hasError('required')) {
          labels.push(`${label}${rowSuffix}`);
        }
      });
    });

    if (
      this.form.get('projectId')?.hasError('required')
      || this.form.get('projectName')?.hasError('required')
      || this.form.get('projectNo')?.hasError('required')
    ) {
      labels.push('Project');
    }

    return [...new Set(labels)];
  }

  private scrollToFirstInvalidControl(): void {
    const target = document.querySelector('form [formcontrolname].ng-invalid') as HTMLElement | null;
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus?.();
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getErrorMessage(fieldName: string): string {
    const field = this.form.get(fieldName);
    if (field?.hasError('required')) {
      return `${fieldName} is required`;
    }
    return '';
  }

  // ---------- Getters ----------

  get projectCoordinatorsArray(): FormArray {
    return this.form.get('projectCoordinators') as FormArray;
  }

  get qualityPlanSchedules(): FormArray {
    return this.form.get('qualityPlanSchedules') as FormArray;
  }

  // headerRows สำหรับตาราง Revision/Date/... ที่เพิ่มได้หลายแถว
  get headerRows(): FormArray {
    return this.form.get('headerRows') as FormArray;
  }

  addHeaderRow(): void {
    this.headerRows.push(this.createHeaderRow());
    this.cdr.markForCheck();
  }

  // ใช้กับ *ngFor trackBy ให้กด Add แล้วไม่หน่วง
  trackByHeaderRow(index: number, _row: any): number {
    return index;
  }

  getEmployeeName(id: string | null | undefined): string {
    if (!id) return '';
    const employee = this.users.find((emp) => emp.id === id);
    return employee ? employee.displayLabel : '';
  }

  onEdit(): void {
    if (this.currentId) {
      this.router.navigate(['/project-quality-assurance-plan/edit', this.currentId]);
    }
  }
}
