import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { Router, ActivatedRoute } from '@angular/router';
import { catchError, of, take } from 'rxjs';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';

import { FeeSheetService, FeeSheetType } from 'app/core/services/fee-sheet.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { ProjectTypeService } from 'app/core/services/project-type.service';
import { ExternalProject, ExternalProjectService } from 'app/core/services/external-project.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-project-lighting-fee-sheet-form',
  standalone: true,
  host: {
    'data-component': 'project-lighting-fee-sheet-form',
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    NgxMatSelectSearchModule,
  ],
  templateUrl: './project-lighting-fee-sheet-form.component.html',
  styleUrls: ['./project-lighting-fee-sheet-form.component.scss'],
})
export class ProjectLightingFeeSheetFormComponent implements OnInit {
  private readonly DEFAULT_PROJECT_ID = 4;
  readonly feeSheetType: FeeSheetType = 'lighting';

  form!: FormGroup;
  isEditMode = false;
  isSubmitting = false;
  currentId: string | null = null;

  private readonly _destroy$ = new Subject<void>();

  projectSearchCtrl = new FormControl('');
  filteredProjectOptions: ExternalProject[] = [];

  // (ถ้าคุณมี master จริงค่อยเปลี่ยนเป็นเรียก API)
  employees: Array<{ id: string; employeeCode?: string; name: string; position: string }> = [
    { id: '1', name: 'John Smith', position: 'TL' },
    { id: '2', name: 'Jane Doe', position: 'MD' },
    { id: '3', name: 'Mike Johnson', position: 'DI' },
  ];

  projectTypes: Array<{ id: string; code: string; name: string }> = [
    { id: '1', code: 'A', name: 'Commercial-Office' },
    { id: '2', code: 'B', name: 'Commercial-General' },
    { id: '3', code: 'C', name: 'Industrial' },
    { id: '4', code: 'D', name: 'Institutional' },
    { id: '5', code: 'E', name: 'Leisure/Recreation/Tourism' },
    { id: '6', code: 'H', name: 'Infrastructure/Utilities' },
    { id: '7', code: 'I', name: 'Residential' },
    { id: '8', code: 'K', name: 'Miscellaneous' },
    { id: '9', code: 'L', name: 'Geotechnical' },
    { id: '10', code: 'M', name: 'Environmental' },
    { id: '11', code: 'Q', name: 'Aviation' },
    { id: '12', code: 'R', name: 'Accredited Checking & Value Engineering' },
    { id: '13', code: 'S', name: 'Healthcare' },
    { id: '14', code: 'T', name: 'Fitout' },
    { id: '15', code: 'U', name: 'Building Audit' },
    { id: '16', code: 'V', name: 'PM/CM' },
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private feeApi: FeeSheetService,
    private employeeService: EmployeeService,
    private projectTypeService: ProjectTypeService,
    private projectService: ExternalProjectService,
    private fuseConfirmationService: FuseConfirmationService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.createForm();
    this.loadEmployees();
    this.loadProjectTypes();
    this.setupProjectSearch();

    if (id) {
      this.isEditMode = true;
      this.currentId = id;
      this.loadForEdit(id);
    }
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
  }

  private setupProjectSearch(): void {
    this.projectSearchCtrl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) =>
          this.projectService.getProjects(term ? term.toString().trim() : '', 20)
        ),
        takeUntil(this._destroy$)
      )
      .subscribe((projects) => {
        this.filteredProjectOptions = projects;
      });

    this.projectService
      .getProjects('', 20)
      .pipe(takeUntil(this._destroy$))
      .subscribe((projects) => {
        this.filteredProjectOptions = projects;
      });
  }

  onProjectSelectedById(projectId: number | string): void {
    if (!projectId) return;

    this.projectService.getProjectById(Number(projectId)).subscribe((project) => {
      if (project) {
        this.form.patchValue({
          projectReferenceId: project.id,
          projectId: null,
          projectNo: project.code || project.mt_project_no || project.project_no,
          projectName: project.name || project.project_name,
        });
      }
    });
  }

  // =========================
  // helpers
  // =========================
  private toNumber(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private toNumberOrNull(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private toYmd(v: any): string | null {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private getEmployeeCodeOrFallback(raw: any): string | null {
    if (raw === null || raw === undefined) return null;
    const selected = String(raw).trim();
    if (!selected) return null;

    const byId = this.employees.find((e) => String(e.id) === selected);
    if (byId?.employeeCode) return byId.employeeCode;

    const byCode = this.employees.find((e) => String(e.employeeCode) === selected);
    if (byCode?.employeeCode) return byCode.employeeCode;

    return selected;
  }

  private normalizeSignatureEmployeeControls(): void {
    const filled = this.form.get('filledInBy');
    const approved = this.form.get('approvedBy');
    if (!filled || !approved) return;

    const filledCode = this.getEmployeeCodeOrFallback(filled.value);
    const approvedCode = this.getEmployeeCodeOrFallback(approved.value);

    if (filledCode && filled.value !== filledCode) filled.setValue(filledCode);
    if (approvedCode && approved.value !== approvedCode) approved.setValue(approvedCode);
  }

  private pickFeeAgreement(rows: any[], revNo: number): any | null {
    if (!Array.isArray(rows) || !rows.length) return null;
    const byRevNo = rows.find((x: any) => Number(x?.revision_no ?? x?.rev_no) === revNo);
    if (byRevNo) return byRevNo;
    return rows[revNo] ?? null;
  }

  private loadEmployees(): void {
    this.employeeService
      .getEmployees('', 200)
      .pipe(
        take(1),
        catchError((err) => {
          console.error('lighting employees error', err);
          return of([] as any[]);
        })
      )
      .subscribe((rows: any[]) => {
        if (!Array.isArray(rows) || rows.length === 0) return; // keep mock fallback

        this.employees = rows.map((e: any) => ({
          id: String(e?.id ?? ''),
          employeeCode: String(e?.employee_code ?? e?.code ?? e?.id ?? ''),
          name: `${e?.firstname ?? ''} ${e?.lastname ?? ''}`.trim() || e?.name || '-',
          position: e?.title_name || e?.level_name || e?.position || '-',
        }));
        this.normalizeSignatureEmployeeControls();
      });
  }

  private loadProjectTypes(): void {
    this.projectTypeService
      .page({ page: 1, perPage: 200 })
      .pipe(
        take(1),
        catchError((err) => {
          console.error('lighting project types error', err);
          return of({ items: [] } as any);
        })
      )
      .subscribe((res: any) => {
        const rows = Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res?.data)
            ? res.data
            : [];
        if (!rows.length) return; // keep mock fallback

        this.projectTypes = rows.map((t: any) => ({
          id: String(t?.id ?? ''),
          code: t?.code || String(t?.id ?? ''),
          name: t?.name || '-',
        }));
      });
  }

  // =========================
  // form
  // =========================
  private createForm(): void {
    this.form = this.fb.group({
      projectReferenceId: [null],
      projectId: [null],

      copiesTo: ['-'],
      circ: ['-'],
      chFile: ['-'],
      fee: ['-'],

      projectPNo: ['LP', [Validators.required]],
      projectNo: ['LMT', [Validators.required]],
      team: ['', [Validators.required]],
      date: [new Date(), [Validators.required]],

      directorInCharge: [null, [Validators.required]],
      discipline: ['Lighting', [Validators.required]],
      projectName: ['', [Validators.required]],
      location: [''],
      client: ['', [Validators.required]],
      contactName: [''],
      mtlScope: [''],
      comments: [''],

      feeAgreementOriginal: [false],
      feeAgreementRev1: [false],
      feeAgreementRev2: [false],
      feeAgreementRev3: [false],

      grossFeeOriginal: [0, [Validators.min(0)]],
      grossFeeRev1: [0, [Validators.min(0)]],
      grossFeeRev2: [0, [Validators.min(0)]],
      grossFeeRev3: [0, [Validators.min(0)]],

      subconsultantsNameOriginal: [''],
      subconsultantsAmountOriginal: [0, [Validators.min(0)]],
      subconsultantsNameRev1: [''],
      subconsultantsAmountRev1: [0, [Validators.min(0)]],
      subconsultantsNameRev2: [''],
      subconsultantsAmountRev2: [0, [Validators.min(0)]],
      subconsultantsNameRev3: [''],
      subconsultantsAmountRev3: [0, [Validators.min(0)]],

      otherExpensesOriginal: [0, [Validators.min(0)]],
      otherExpensesRev1: [0, [Validators.min(0)]],
      otherExpensesRev2: [0, [Validators.min(0)]],
      otherExpensesRev3: [0, [Validators.min(0)]],

      nettFeeOriginal: [0],
      nettFeeRev1: [0],
      nettFeeRev2: [0],
      nettFeeRev3: [0],

      // Lighting job costing: P / D / T / C
      preliminaryPercentage: [40, [Validators.min(0), Validators.max(100)]],
      preliminaryStartDate: [new Date(), [Validators.required]],
      preliminaryEndDate: [new Date(), [Validators.required]],

      detailedDesignPercentage: [15, [Validators.min(0), Validators.max(100)]],
      detailedDesignStartDate: [new Date(), [Validators.required]],
      detailedDesignEndDate: [new Date(), [Validators.required]],

      tenderPercentage: [30, [Validators.min(0), Validators.max(100)]],
      tenderStartDate: [new Date(), [Validators.required]],
      tenderEndDate: [new Date(), [Validators.required]],

      constructionPercentage: [15, [Validators.min(0), Validators.max(100)]],
      constructionStartDate: [new Date(), [Validators.required]],
      constructionEndDate: [new Date(), [Validators.required]],

      projectType: [null, [Validators.required]],

      filledInBy: [null, [Validators.required]],
      filledInDate: [new Date(), [Validators.required]],
      approvedBy: [null, [Validators.required]],
      approvedDate: [new Date(), [Validators.required]],

      billingForecast: this.fb.array([this.newBillingRow()]),
    });

    this.calculateNettFee();
  }

  private newBillingRow(): FormGroup {
    return this.fb.group({
      month: [new Date()],
      amount: [0, [Validators.min(0)]],
    });
  }

  get billingForecastArray(): FormArray {
    return this.form.get('billingForecast') as FormArray;
  }

  addBillingRow(): void {
    this.billingForecastArray.push(this.newBillingRow());
  }

  removeBillingRow(i: number): void {
    if (this.billingForecastArray.length > 1) this.billingForecastArray.removeAt(i);
  }

  // =========================
  // load for edit (GET by id)
  // =========================
  private loadForEdit(id: string): void {
    this.isSubmitting = true;

    this.feeApi.getById(id).pipe(
      catchError((err) => {
        console.error(err);
        this.isSubmitting = false;
        this.toastr.error(err?.error?.message ?? 'Load failed');
        return of(null);
      })
    ).subscribe((res: any) => {
      if (!res) return;

      const rev = res?.revision;
      const proj = res?.project;

      // patch main
      this.form.patchValue({
        projectId: Number(res?.projectId ?? this.DEFAULT_PROJECT_ID),

        copiesTo: proj?.copies_to ?? '-',
        circ: proj?.circ_adm ?? '-',
        chFile: proj?.ch_file ?? '-',

        projectPNo: proj?.project_no ?? '',
        projectNo: res?.mtProjectNo ?? '',
        date: rev?.form_filled_by_date ? new Date(rev.form_filled_by_date) : new Date(),

        team: (Array.isArray(rev?.team_members) ? rev.team_members : [])
          .map((x: any) => x.employee_code)
          .filter(Boolean)
          .join(', '),

        directorInCharge: this.toNumberOrNull(rev?.director_in_charge_id),
        discipline: 'Lighting',
        projectName: rev?.project_name ?? proj?.project_name ?? '',
        location: rev?.location ?? proj?.city ?? '',
        client: rev?.client_name ?? proj?.client_name ?? '',
        contactName: rev?.contact_name ?? proj?.client_contact_name ?? '',
        mtlScope: rev?.mtl_scope_detail ?? '',
        comments: rev?.comment ?? '',

        projectType: this.toNumberOrNull(rev?.project_type_id),
        filledInBy: rev?.form_filled_by_id ? String(rev.form_filled_by_id) : null,
        filledInDate: rev?.form_filled_by_date ? new Date(rev.form_filled_by_date) : new Date(),
        approvedBy: rev?.approved_by_ch_id ? String(rev.approved_by_ch_id) : null,
        approvedDate: rev?.approved_by_ch_date ? new Date(rev.approved_by_ch_date) : new Date(),
      });
      this.normalizeSignatureEmployeeControls();

      // fee agreements: Original + Rev.1..Rev.3
      const feeAgreements = Array.isArray(rev?.fee_agreements) ? rev.fee_agreements : [];
      const ag0 = this.pickFeeAgreement(feeAgreements, 0);
      const ag1 = this.pickFeeAgreement(feeAgreements, 1);
      const ag2 = this.pickFeeAgreement(feeAgreements, 2);
      const ag3 = this.pickFeeAgreement(feeAgreements, 3);
      this.form.patchValue({
        feeAgreementOriginal: !!ag0,
        feeAgreementRev1: !!ag1,
        feeAgreementRev2: !!ag2,
        feeAgreementRev3: !!ag3,

        grossFeeOriginal: Number(ag0?.gross_fee_excl_vat ?? 0),
        subconsultantsNameOriginal: String(ag0?.less_subconsultants_name ?? ''),
        subconsultantsAmountOriginal: Number(ag0?.less_subconsultants_number ?? 0),
        otherExpensesOriginal: Number(ag0?.less_other_expenses ?? 0),
        nettFeeOriginal: Number(ag0?.net_fee_excl_vat ?? 0),

        grossFeeRev1: Number(ag1?.gross_fee_excl_vat ?? 0),
        subconsultantsNameRev1: String(ag1?.less_subconsultants_name ?? ''),
        subconsultantsAmountRev1: Number(ag1?.less_subconsultants_number ?? 0),
        otherExpensesRev1: Number(ag1?.less_other_expenses ?? 0),
        nettFeeRev1: Number(ag1?.net_fee_excl_vat ?? 0),

        grossFeeRev2: Number(ag2?.gross_fee_excl_vat ?? 0),
        subconsultantsNameRev2: String(ag2?.less_subconsultants_name ?? ''),
        subconsultantsAmountRev2: Number(ag2?.less_subconsultants_number ?? 0),
        otherExpensesRev2: Number(ag2?.less_other_expenses ?? 0),
        nettFeeRev2: Number(ag2?.net_fee_excl_vat ?? 0),

        grossFeeRev3: Number(ag3?.gross_fee_excl_vat ?? 0),
        subconsultantsNameRev3: String(ag3?.less_subconsultants_name ?? ''),
        subconsultantsAmountRev3: Number(ag3?.less_subconsultants_number ?? 0),
        otherExpensesRev3: Number(ag3?.less_other_expenses ?? 0),
        nettFeeRev3: Number(ag3?.net_fee_excl_vat ?? 0),
      });

      // job costings map phase -> field
      const jc = Array.isArray(rev?.job_costings)
        ? rev.job_costings
        : Array.isArray(rev?.job_costing)
          ? rev.job_costing
          : [];
      const findPhase = (p: string) => jc.find((x: any) => String(x?.phase) === p) ?? null;

      const P = findPhase('P');
      const D = findPhase('D');
      const T = findPhase('T');
      const C = findPhase('C');

      this.form.patchValue({
        preliminaryPercentage: Number(P?.percent ?? P?.percentage ?? 40),
        preliminaryStartDate: P?.start_date ? new Date(P.start_date) : new Date(),
        preliminaryEndDate: P?.end_date ? new Date(P.end_date) : new Date(),

        detailedDesignPercentage: Number(D?.percent ?? D?.percentage ?? 15),
        detailedDesignStartDate: D?.start_date ? new Date(D.start_date) : new Date(),
        detailedDesignEndDate: D?.end_date ? new Date(D.end_date) : new Date(),

        tenderPercentage: Number(T?.percent ?? T?.percentage ?? 30),
        tenderStartDate: T?.start_date ? new Date(T.start_date) : new Date(),
        tenderEndDate: T?.end_date ? new Date(T.end_date) : new Date(),

        constructionPercentage: Number(C?.percent ?? C?.percentage ?? 15),
        constructionStartDate: C?.start_date ? new Date(C.start_date) : new Date(),
        constructionEndDate: C?.end_date ? new Date(C.end_date) : new Date(),
      });

      // billing forecasts
      const bf = Array.isArray(rev?.billing_forecasts)
        ? rev.billing_forecasts
        : Array.isArray(rev?.billing_forecast)
          ? rev.billing_forecast
          : [];
      this.billingForecastArray.clear();
      if (!bf.length) {
        this.billingForecastArray.push(this.newBillingRow());
      } else {
        bf.forEach((b: any) => {
          this.billingForecastArray.push(
            this.fb.group({
              month: [b?.month ? new Date(b.month) : new Date()],
              amount: [Number(b?.amount ?? 0), [Validators.min(0)]],
            })
          );
        });
      }

      this.calculateNettFee();
      this.isSubmitting = false;
    });
  }

  // =========================
  // calc
  // =========================
  calculateNettFee(): void {
    const oGross = this.toNumber(this.form.get('grossFeeOriginal')?.value);
    const oSub = this.toNumber(this.form.get('subconsultantsAmountOriginal')?.value);
    const oOther = this.toNumber(this.form.get('otherExpensesOriginal')?.value);
    this.form.patchValue({ nettFeeOriginal: oGross - oSub - oOther }, { emitEvent: false });

    const r1Gross = this.toNumber(this.form.get('grossFeeRev1')?.value);
    const r1Sub = this.toNumber(this.form.get('subconsultantsAmountRev1')?.value);
    const r1Other = this.toNumber(this.form.get('otherExpensesRev1')?.value);
    this.form.patchValue({ nettFeeRev1: r1Gross - r1Sub - r1Other }, { emitEvent: false });

    const r2Gross = this.toNumber(this.form.get('grossFeeRev2')?.value);
    const r2Sub = this.toNumber(this.form.get('subconsultantsAmountRev2')?.value);
    const r2Other = this.toNumber(this.form.get('otherExpensesRev2')?.value);
    this.form.patchValue({ nettFeeRev2: r2Gross - r2Sub - r2Other }, { emitEvent: false });

    const r3Gross = this.toNumber(this.form.get('grossFeeRev3')?.value);
    const r3Sub = this.toNumber(this.form.get('subconsultantsAmountRev3')?.value);
    const r3Other = this.toNumber(this.form.get('otherExpensesRev3')?.value);
    this.form.patchValue({ nettFeeRev3: r3Gross - r3Sub - r3Other }, { emitEvent: false });
  }

  updateJobCostingAllocation(): void {
    const total =
      this.toNumber(this.form.get('preliminaryPercentage')?.value) +
      this.toNumber(this.form.get('detailedDesignPercentage')?.value) +
      this.toNumber(this.form.get('tenderPercentage')?.value) +
      this.toNumber(this.form.get('constructionPercentage')?.value);

    if (total !== 100) {
      this.toastr.warning(`Job costing allocation total ${total}%. Please ensure = 100%.`);
    }
  }

  // =========================
  // submit (create / edit)
  // =========================
  onSubmit(): void {
    if (this.isSubmitting) return;

    if (!this.form.valid) {
      this.form.markAllAsTouched();
      this.toastr.error('Please fill in all required fields.');
      return;
    }

    const confirmation = this.fuseConfirmationService.open({
      title: this.isEditMode ? 'Confirm update' : 'Confirm submit',
      message: this.isEditMode
        ? 'Are you sure you want to update this lighting fee sheet?'
        : 'Are you sure you want to submit this lighting fee sheet?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
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

    const payload = this.mapFormToPayload();

    // guard numeric ids
    const bad: string[] = [];
    if (!payload.project_type_id) bad.push('project_type_id');
    if (!payload.director_in_charge_id) bad.push('director_in_charge_id');
    if (bad.length) {
      this.isSubmitting = false;
      this.toastr.error(`These fields must be numeric IDs: ${bad.join(', ')}`);
      return;
    }

    if (!payload.form_filled_by_id || !String(payload.form_filled_by_id).trim()) {
      this.isSubmitting = false;
      this.toastr.error('form_filled_by_id is required.');
      return;
    }

    if (!payload.approved_by_ch_id || !String(payload.approved_by_ch_id).trim()) {
      this.isSubmitting = false;
      this.toastr.error('approved_by_ch_id is required.');
      return;
    }

    const normalizedTeam = Array.isArray(payload.team)
      ? payload.team
      : String(payload.team ?? '')
          .split(',')
          .map((t: string) => t.trim())
          .filter((t: string) => !!t);

    const req$ = this.isEditMode && this.currentId
      ? this.feeApi.editCurrentRevision(this.currentId, { ...payload, team: normalizedTeam })
      : this.feeApi.create(payload);

    req$.subscribe({
      next: () => {
        this.isSubmitting = false;
        this.toastr.success(this.isEditMode ? 'Lighting fee sheet updated!' : 'Lighting fee sheet created!');
        this.router.navigate(['/project-lighting-fee-sheet/list']);
      },
      error: (err: any) => {
        console.error(err);
        this.isSubmitting = false;
        if (err?.error?.code === 'DUPLICATE_PROPOSAL_PROJECT_REFERENCE') {
          this.showDuplicateProjectReferenceDialog(err?.error?.message ?? 'MT Project No. already exists.');
          return;
        }
        this.toastr.error(err?.error?.message ?? 'Save failed');
      },
    });
  }

  private showDuplicateProjectReferenceDialog(message: string): void {
    this.fuseConfirmationService.open({
      title: 'Duplicate MT Project No.',
      message,
      icon: { show: true, name: 'heroicons_outline:exclamation-triangle', color: 'warn' },
      actions: {
        confirm: { show: true, label: 'OK', color: 'warn' },
        cancel: { show: false },
      },
      dismissible: true,
    });
  }

  private mapFormToPayload(): any {
    const v = this.form.getRawValue();

    const billing_forecast = (v.billingForecast ?? [])
      .map((x: any) => ({
        month: this.toYmd(x.month),
        amount: this.toNumber(x.amount),
      }))
      .filter((x: any) => !!x.month);

    return {
      fee_sheet_type: this.feeSheetType,

      project_id: this.toNumber(v.projectId) || null,
      proposal_project_reference_id: this.toNumber(v.projectReferenceId) || undefined,
      mt_project_no: v.projectNo,
      project_name: v.projectName,

      discipline_id: 4, // Lighting
      director_in_charge_id: this.toNumber(v.directorInCharge),
      project_type_id: this.toNumber(v.projectType),

      client_name: v.client,
      location: v.location,
      mtl_scope_detail: v.mtlScope,
      contact_name: v.contactName,
      comment: v.comments,
      team: v.team,

      fee_agreements: [
        {
          gross_fee_excl_vat: this.toNumber(v.grossFeeOriginal),
          less_subconsultants_name: String(v.subconsultantsNameOriginal ?? ''),
          less_subconsultants_number: this.toNumber(v.subconsultantsAmountOriginal),
          less_other_expenses: this.toNumber(v.otherExpensesOriginal),
          net_fee_excl_vat: this.toNumber(v.nettFeeOriginal),
        },
        {
          gross_fee_excl_vat: this.toNumber(v.grossFeeRev1),
          less_subconsultants_name: String(v.subconsultantsNameRev1 ?? ''),
          less_subconsultants_number: this.toNumber(v.subconsultantsAmountRev1),
          less_other_expenses: this.toNumber(v.otherExpensesRev1),
          net_fee_excl_vat: this.toNumber(v.nettFeeRev1),
        },
        {
          gross_fee_excl_vat: this.toNumber(v.grossFeeRev2),
          less_subconsultants_name: String(v.subconsultantsNameRev2 ?? ''),
          less_subconsultants_number: this.toNumber(v.subconsultantsAmountRev2),
          less_other_expenses: this.toNumber(v.otherExpensesRev2),
          net_fee_excl_vat: this.toNumber(v.nettFeeRev2),
        },
        {
          gross_fee_excl_vat: this.toNumber(v.grossFeeRev3),
          less_subconsultants_name: String(v.subconsultantsNameRev3 ?? ''),
          less_subconsultants_number: this.toNumber(v.subconsultantsAmountRev3),
          less_other_expenses: this.toNumber(v.otherExpensesRev3),
          net_fee_excl_vat: this.toNumber(v.nettFeeRev3),
        },
      ],

      job_costing: [
        { phase: 'P', percent: this.toNumber(v.preliminaryPercentage), percentage: this.toNumber(v.preliminaryPercentage), start_date: this.toYmd(v.preliminaryStartDate), end_date: this.toYmd(v.preliminaryEndDate) },
        { phase: 'D', percent: this.toNumber(v.detailedDesignPercentage), percentage: this.toNumber(v.detailedDesignPercentage), start_date: this.toYmd(v.detailedDesignStartDate), end_date: this.toYmd(v.detailedDesignEndDate) },
        { phase: 'T', percent: this.toNumber(v.tenderPercentage), percentage: this.toNumber(v.tenderPercentage), start_date: this.toYmd(v.tenderStartDate), end_date: this.toYmd(v.tenderEndDate) },
        { phase: 'C', percent: this.toNumber(v.constructionPercentage), percentage: this.toNumber(v.constructionPercentage), start_date: this.toYmd(v.constructionStartDate), end_date: this.toYmd(v.constructionEndDate) },
      ],

      job_costings: [
        { phase: 'P', percent: this.toNumber(v.preliminaryPercentage), percentage: this.toNumber(v.preliminaryPercentage), start_date: this.toYmd(v.preliminaryStartDate), end_date: this.toYmd(v.preliminaryEndDate) },
        { phase: 'D', percent: this.toNumber(v.detailedDesignPercentage), percentage: this.toNumber(v.detailedDesignPercentage), start_date: this.toYmd(v.detailedDesignStartDate), end_date: this.toYmd(v.detailedDesignEndDate) },
        { phase: 'T', percent: this.toNumber(v.tenderPercentage), percentage: this.toNumber(v.tenderPercentage), start_date: this.toYmd(v.tenderStartDate), end_date: this.toYmd(v.tenderEndDate) },
        { phase: 'C', percent: this.toNumber(v.constructionPercentage), percentage: this.toNumber(v.constructionPercentage), start_date: this.toYmd(v.constructionStartDate), end_date: this.toYmd(v.constructionEndDate) },
      ],

      billing_forecast,
      billing_forecasts: billing_forecast,

      form_filled_by_id: this.getEmployeeCodeOrFallback(v.filledInBy),
      form_filled_by_date: this.toYmd(v.filledInDate),
      approved_by_ch_id: this.getEmployeeCodeOrFallback(v.approvedBy),
      approved_by_ch_date: this.toYmd(v.approvedDate),
    };
  }

  onCancel(): void {
    this.router.navigate(['/project-lighting-fee-sheet/list']);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  }
}
