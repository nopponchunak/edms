import { CommonModule } from '@angular/common';
import { Component, ElementRef, Inject, OnDestroy, OnInit } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';

// ✅ search select
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

import { ProposalContractReviewService } from 'app/core/services/proposal-contract-review.service';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { EmployeeService } from 'app/core/services/employee.service';

import { forkJoin, Observable, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, startWith, switchMap, takeUntil } from 'rxjs/operators';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';

export interface ProjectType {
  id: string;
  code?: string;
  name: string;
}

export interface PersonOption {
  code: string;
  initial: string;
  name: string;
  position?: string;
  display: string; // ✅ ใช้แสดงใน dropdown
}

@Component({
  selector: 'app-stage2-project-number-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
  ],
  template: `
    <div class="p-6 min-w-[360px] max-w-[520px]">
      <div class="flex items-start gap-4">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
          <mat-icon [svgIcon]="'heroicons_solid:check-circle'"></mat-icon>
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Stage 2 Saved</h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Project number has been generated.
          </p>
        </div>
      </div>

      <div class="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <div class="text-xs font-medium uppercase tracking-wide text-gray-500">Project Number</div>
        <div class="mt-1 break-all text-2xl font-semibold text-gray-900 dark:text-white">
          {{ data.projectNumber || '-' }}
        </div>
        <div *ngIf="data.mtProjectNumber && data.mtProjectNumber !== data.projectNumber" class="mt-3">
          <div class="text-xs font-medium uppercase tracking-wide text-gray-500">MT Project Number</div>
          <div class="mt-1 break-all text-lg font-semibold text-gray-900 dark:text-white">
            {{ data.mtProjectNumber }}
          </div>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <button type="button" mat-stroked-button (click)="copyProjectNumber()">
          <mat-icon class="mr-2" [svgIcon]="'heroicons_outline:clipboard-document'"></mat-icon>
          Copy
        </button>
        <button type="button" mat-flat-button color="primary" (click)="close()">
          Close
        </button>
      </div>
    </div>
  `,
})
export class Stage2ProjectNumberDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { projectNumber: string; mtProjectNumber: string },
    private dialogRef: MatDialogRef<Stage2ProjectNumberDialogComponent>,
    private clipboard: Clipboard,
    private toastr: ToastrService
  ) {}

  copyProjectNumber(): void {
    const value = this.data.projectNumber || this.data.mtProjectNumber || '';
    if (!value) return;

    if (this.clipboard.copy(value)) {
      this.toastr.success('Project Number copied.');
    } else {
      this.toastr.error('Copy failed.');
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}

@Component({
  selector: 'app-proposal-contract-review-form',
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
    MatAutocompleteModule,
    MatDialogModule,
    NgxMatSelectSearchModule,
  ],
  templateUrl: './proposal-contract-review-form.component.html',
  styleUrls: ['./proposal-contract-review-form.component.scss'],
})
export class ProposalContractReviewFormComponent implements OnInit, OnDestroy {
  form: FormGroup;

  isSubmitting = false;
  isLoading = false;

  isEditMode = false;
  isViewMode = false;
  isStage2Mode = false;
  currentId: string | null = null;
  loadedReviewRaw: any = null;
  private proposalNumberRequestSeq = 0;

  private destroy$ = new Subject<void>();

  // Master data
  private readonly fallbackProjectTypes: ProjectType[] = [
    { id: 'A', code: 'A', name: 'Commercial-Office' },
    { id: 'B', code: 'B', name: 'Commercial-General' },
    { id: 'C', code: 'C', name: 'Industrial' },
    { id: 'D', code: 'D', name: 'Institutional' },
    { id: 'E', code: 'E', name: 'Leisure/Recreation/Tourism' },
    { id: 'H', code: 'H', name: 'Infrastructure/Utilities' },
    { id: 'I', code: 'I', name: 'Residential' },
    { id: 'K', code: 'K', name: 'Miscellaneous' },
    { id: 'L', code: 'L', name: 'Geotechnical' },
    { id: 'M', code: 'M', name: 'Environmental' },
    { id: 'Q', code: 'Q', name: 'Aviation' },
    { id: 'R', code: 'R', name: 'Accredited Checking & Value Engineering' },
    { id: 'S', code: 'S', name: 'Healthcare' },
    { id: 'T', code: 'T', name: 'Fitout' },
    { id: 'U', code: 'U', name: 'Building Audit' },
    { id: 'V', code: 'V', name: 'PM/CM' },
  ];
  projectTypes: ProjectType[] = [...this.fallbackProjectTypes];

  // ✅ People dropdown (จาก API)
  private readonly peopleSearchLimit = 50;
  allLoadedEmployees = new Map<string, PersonOption>(); // ✅ Cache
  
  proposalSearchCtrls: FormControl[] = [
    new FormControl<string>(''),
    new FormControl<string>(''),
    new FormControl<string>(''),
  ];
  contractSearchCtrls: FormControl[] = [
    new FormControl<string>(''),
    new FormControl<string>(''),
    new FormControl<string>(''),
  ];
  filledInBySearchCtrl = new FormControl<string>('');
  leadTLSearchCtrl = new FormControl<string>('');

  filteredPeopleContract: PersonOption[][] = [[], [], []];
  filteredPeopleProposal: PersonOption[][] = [[], [], []];
  filteredPeopleFilledInBy: PersonOption[] = [];
  filteredPeopleLeadTL: PersonOption[] = [];

  // Project details options (ผูกกับ pd_* ของ API)
  projectDetailsOptions = [
    'Concept & Detail Design',     // pd_concept_detail_design
    'Construction Supervision',    // pd_construction_supervision
    'Value Engineering',           // pd_value_engineering
    'Tender Evaluation',           // pd_tender_evaluation
    'Engineering Audit',           // pd_engineering_audit
    'Others',                      // pd_others_flag + pd_others_text
  ];

  // Discipline options (ผูกกับ disc_* ของ API)
  disciplineOptions = [
    'C&S',            // disc_cs
    'M&E',            // disc_me
    'Façade',         // disc_facade
    'Lighting',       // disc_lighting
    'Transportation', // disc_transportation
    'Others',         // disc_others_flag + disc_others_text
  ];

  proposalNumberTypeOptions = [
    { value: 'general', label: 'CSA&MEP' },
    { value: 'facade', label: 'Façade' },
    { value: 'transportation', label: 'Transportation' },
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private proposalContractReviewService: ProposalContractReviewService,
    private employeeService: EmployeeService,
    private fuseConfirmationService: FuseConfirmationService,
    private toastr: ToastrService,
    private dialog: MatDialog,
    private elementRef: ElementRef<HTMLElement>
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    // ✅ init FormArray ก่อน
    this.initializeProjectDetails();
    this.initializeDisciplines();
    this.initializeProposalReviewers();
    this.initializeContractReviewers();

    // ✅ โหลด user สำหรับ dropdown + search
    this.loadPeopleForSelect();
    this.loadProjectTypes();

    // ✅ เช็ค edit mode
    this.currentId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.currentId;
    this.isStage2Mode = this.route.snapshot.routeConfig?.path === 'stage-2/:id';

    // ✅ ค่า default เฉพาะตอน New
    if (!this.isEditMode) {
      const currentUser = getCurrentUserCode();
      this.form.patchValue({
        status: 'draft',
        filledInDate: new Date(),
        locationCountry: 'Thailand',
        currency: 'THB',
        enquiryFrom: true,
        feeCalculationAttached: true,
        filledInBy: currentUser || '',
      });
      this.ensureSelectedPeopleOptions();
      this.setupProposalNumberPreview();
      this.loadNextProposalNumber();
    }

    // ✅ โหลดข้อมูลตอน Edit
    if (this.isEditMode && this.currentId) {
      this.loadReview(this.currentId);
    }

    // ✅ Ensure mutual exclusivity for Proposal Review
    this.form.get('proposalToBeSubmitted')?.valueChanges.subscribe(val => {
      if (val) this.form.get('proposalDecline')?.setValue(false, { emitEvent: false });
    });
    this.form.get('proposalDecline')?.valueChanges.subscribe(val => {
      if (val) this.form.get('proposalToBeSubmitted')?.setValue(false, { emitEvent: false });
    });

    // ✅ Ensure mutual exclusivity for Contract Review
    this.form.get('contractAgreedToProceed')?.valueChanges.subscribe(val => {
      if (val) this.form.get('contractDecline')?.setValue(false, { emitEvent: false });
    });
    this.form.get('contractDecline')?.valueChanges.subscribe(val => {
      if (val) this.form.get('contractAgreedToProceed')?.setValue(false, { emitEvent: false });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createForm(): FormGroup {
    return this.fb.group({
      // Header - Hidden, will send "-" to API
      copiesTo: ['-'],
      circAdm: ['-'],
      chFile: ['-'],

      // Project Identification
      projectId: [''],
      projectName: ['', [Validators.required]],
      projectNo: [''],
      proposalNumberType: ['general', [Validators.required]],
      proposalNumber: [''],
      proposalAttached: [false],

      // Location
      locationCity: ['', [Validators.required]],
      locationCountry: ['', [Validators.required]],

      // Client
      client: ['', [Validators.required]],
      clientContactName: ['', [Validators.required]],
      clientAddress: ['', [Validators.required]],
      clientTel: [''],
      clientFax: [''],

      // Architect (Optional)
      architect: [''],
      architectContactName: [''],
      architectAddress: [''],
      architectTel: [''],
      architectFax: [''],

      // Enquiry
      enquiryFrom: [true],

      // Project Details
      projectDetails: this.fb.array([]),
      projectDetailsOthers: [''],

      // Discipline
      disciplines: this.fb.array([]),
      disciplinesOthers: [''],

      // Project Type
      projectType: ['', [Validators.required]],

      // Fee Calculation
      feeCalculationAttached: [true],
      estimatedValue: [0, [Validators.required, Validators.min(1000)]],
      currency: ['THB', [Validators.required]],

      // Attachments
      proposalAttachments: this.fb.array([]),
      enquiryAttachments: this.fb.array([]),
      feeAttachments: this.fb.array([]),

      // Scope and Resources
      scopeClearlyDefined: [false],
      scopeDetails: [''],
      adequateResources: [false],
      resourcesDetails: [''],
      helpFromOtherOffices: [false],
      helpDetails: [''],
      subConsultantsRequired: [false],
      subConsultantsDetails: [''],

      // Quality and Considerations
      specialQARequirements: [''],
      specialConsiderations: [''],
      comments: [''],

      // Project Classification
      governmentProject: [false],
      mmclProject: [false],
      mtl: [false],

      // Filled in by
      filledInBy: ['', [Validators.required]],
      filledInDate: [new Date(), [Validators.required]],

      // Proposal Review
      proposalToBeSubmitted: [false],
      proposalDecline: [false],
      winProbability: [null, [Validators.min(0), Validators.max(100)]],

      proposalReviewers: this.fb.array([]),

      // Contract Review
      contractAgreedToProceed: [false],
      contractDecline: [false],
      leadTL: [''],
      tl: [''],
      needPQP: [false],
      contractReviewers: this.fb.array([]),

      attachments: this.fb.array([]),

      status: ['draft'],
    });
  }

  // ---------------------------
  // Attachment handlers
  // ---------------------------
  get proposalAttachments(): FormArray {
    return this.form.get('proposalAttachments') as FormArray;
  }

  get enquiryAttachments(): FormArray {
    return this.form.get('enquiryAttachments') as FormArray;
  }

  get feeAttachments(): FormArray {
    return this.form.get('feeAttachments') as FormArray;
  }

  get generalAttachments(): FormArray {
    return this.form.get('attachments') as FormArray;
  }

  openUploadDialog(type: 'proposal' | 'enquiry' | 'fee' | 'general'): void {
    const ref = this.dialog.open(FuseUploadDialogComponent, {
      width: '560px',
      data: {}
    });

    ref.afterClosed().subscribe((result) => {
      if (!result) return;

      let array: FormArray;
      if (type === 'proposal') array = this.proposalAttachments;
      else if (type === 'enquiry') array = this.enquiryAttachments;
      else if (type === 'fee') array = this.feeAttachments;
      else array = this.generalAttachments;

      const results = Array.isArray(result) ? result : [result];
      results.forEach((item: any) => {
        array.push(this.createAttachmentGroup({
          id: item.id || null,
          file_name: item.file_name || item.name || '',
          file_path: item.file_path || '',
          file_url: item.file_url || item.url || '',
          file_size: item.file_size || (item.file ? item.file.size : 0),
          mime_type: item.mime_type || (item.file ? item.file.type : ''),
          description: item.description || '',
          uploaded_at: item.uploaded_at || new Date(),
          type: item.type || 'file',
          file: item.file || null
        }));
      });
    });
  }


  removeAttachment(array: FormArray, index: number): void {
    array.removeAt(index);
  }

  private createAttachmentGroup(data: any): FormGroup {
    return this.fb.group({
      id: [data.id || null],
      file_name: [data.file_name || ''],
      file_path: [data.file_path || ''],
      file_url: [data.file_url || ''],
      file_size: [data.file_size || 0],
      mime_type: [data.mime_type || ''],
      description: [data.description || ''],
      uploaded_at: [data.uploaded_at || null],
      type: [data.type || 'file'],
      file: [data.file || null]
    });
  }

  private setAttachments(array: FormArray, paths: string[]): void {
    array.clear();
    paths.forEach((path) => {
      array.push(this.createAttachmentGroup({
        file_name: this.getFileNameFromPath(path),
        file_path: path,
        file_url: '',
        file_size: 0,
        mime_type: '',
        description: '',
        uploaded_at: null,
        type: 'file',
        file: null
      }));
    });
  }

  private setAttachmentsFromApi(value: any): void {
    this.proposalAttachments.clear();
    this.enquiryAttachments.clear();
    this.feeAttachments.clear();
    this.generalAttachments.clear();

    const rows = this.normalizeAttachmentRows(value);
    rows.forEach((row) => {
      const type = String(row.type ?? '').toLowerCase();
      const target =
        type.includes('proposal') ? this.proposalAttachments :
        type.includes('enquiry') ? this.enquiryAttachments :
        type.includes('fee') ? this.feeAttachments :
        this.generalAttachments;

      target.push(this.createAttachmentGroup(row));
    });
  }

  private normalizeAttachmentRows(value: any): any[] {
    if (!value) {
      return [];
    }

    let rows = Array.isArray(value) ? value : [value];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        rows = [value];
      }
    }

    return rows
      .map((item: any) => {
        if (typeof item === 'string') {
          return {
            file_name: this.getFileNameFromPath(item),
            file_path: item,
            type: 'general',
          };
        }

        const filePath = item?.file_path ?? item?.path ?? item?.url ?? item?.file_url ?? '';
        const fileName = item?.file_name ?? item?.name ?? item?.original_name ?? this.getFileNameFromPath(filePath);

        return {
          id: item?.id ?? null,
          file_name: fileName,
          file_path: filePath,
          file_url: item?.file_url ?? item?.url ?? '',
          file_size: item?.file_size ?? item?.size ?? 0,
          mime_type: item?.mime_type ?? item?.mime ?? '',
          description: item?.description ?? '',
          uploaded_at: item?.uploaded_at ?? null,
          type: item?.type ?? 'general',
          file: item?.file ?? null,
        };
      })
      .filter((item) => !!item.file_path || !!item.file_name);
  }

  private getFileNameFromPath(path: string): string {
    return String(path || '').split('/').pop() || path;
  }

  // ---------------------------
  // init arrays
  // ---------------------------
  private initializeProjectDetails(): void {
    const arr = this.form.get('projectDetails') as FormArray;
    if (arr.length) return;
    this.projectDetailsOptions.forEach(() => arr.push(this.fb.control(false)));
  }

  private initializeDisciplines(): void {
    const arr = this.form.get('disciplines') as FormArray;
    if (arr.length) return;
    this.disciplineOptions.forEach(() => arr.push(this.fb.control(false)));
  }

  private initializeProposalReviewers(): void {
    const arr = this.form.get('proposalReviewers') as FormArray;
    if (arr.length) return;
    for (let i = 0; i < 3; i++) {
      arr.push(
        this.fb.group({
            reviewer: [null],
            status: [null],
        })
      );
    }
  }

  private initializeContractReviewers(): void {
    const arr = this.form.get('contractReviewers') as FormArray;
    if (arr.length) return;
    for (let i = 0; i < 3; i++) {
      arr.push(
        this.fb.group({
          reviewer: [null],
          status: [null],
        })
      );
    }
  }

  // ---------------------------
  // ✅ LOAD PEOPLE + SEARCH
  // ---------------------------
  updateFilteredUsers(filtered: PersonOption[], selectedValue: string | null): PersonOption[] {
    if (!selectedValue) return filtered;
    const selected = this.allLoadedEmployees.get(selectedValue);
    if (selected && !filtered.some(f => f.name === selectedValue || f.code === selectedValue)) {
      return [selected, ...filtered];
    }
    return filtered;
  }

  private loadPeopleForSelect(): void {
    this.bindPeopleApiSearch(
      this.filledInBySearchCtrl,
      (people) => (this.filteredPeopleFilledInBy = people),
      () => this.form.get('filledInBy')?.value
    );

    this.bindPeopleApiSearch(
      this.leadTLSearchCtrl,
      (people) => (this.filteredPeopleLeadTL = people),
      () => this.form.get('leadTL')?.value
    );

    for (let i = 0; i < 3; i++) {
      this.bindPeopleApiSearch(
        this.proposalSearchCtrls[i],
        (people) => (this.filteredPeopleProposal[i] = people),
        () => this.proposalReviewersArray.at(i)?.get('reviewer')?.value
      );

      this.bindPeopleApiSearch(
        this.contractSearchCtrls[i],
        (people) => (this.filteredPeopleContract[i] = people),
        () => this.contractReviewersArray.at(i)?.get('reviewer')?.value
      );
    }
  }

  private bindPeopleApiSearch(
    searchControl: FormControl,
    assignOptions: (people: PersonOption[]) => void,
    getSelectedValue: () => string | null | undefined
  ): void {
    searchControl.valueChanges
      .pipe(
        startWith(searchControl.value ?? ''),
        debounceTime(250),
        map((keyword) => String(keyword ?? '').trim()),
        distinctUntilChanged(),
        switchMap((keyword) => this.searchPeopleFromApi(keyword)),
        takeUntil(this.destroy$)
      )
      .subscribe((people) => {
        assignOptions(this.updateFilteredUsers(people, getSelectedValue() ?? null));
      });
  }

  private searchPeopleFromApi(keyword: string): Observable<PersonOption[]> {
    return this.employeeService.getEmployeeOptionsFromApi(keyword, this.peopleSearchLimit).pipe(
      map((options) => {
        const people = (options ?? [])
          .map((option) => this.toPersonOption(option))
          .filter((person) => !!person.code || !!person.initial || !!person.name);

        people.forEach((person) => this.cachePersonOption(person));

        return people;
      }),
      catchError(() => of([]))
    );
  }
  private loadProjectTypes(): void {
    this.projectTypes = [...this.fallbackProjectTypes];
  }

  // ---------------------------
  // ✅ LOAD (Edit)
  // ---------------------------
  private loadReview(id: string): void {
    this.isLoading = true;

    this.proposalContractReviewService
      .getById(id)
      .pipe(
        catchError((err) => {
          this.toastr.error(err?.error?.message || 'Failed to load review');
          return of(null);
        }),
        finalize(() => (this.isLoading = false))
      )
      .subscribe((res: any) => {
        const d = res?.data;
        if (!d) return;
        this.patchFormFromApi(d);
      });
  }

  private patchFormFromApi(d: any): void {
    this.loadedReviewRaw = d;

    const projectTypeId =
      this.projectTypes.find((x) => x.name === d.project_type || x.code === d.project_type || x.id === String(d.project_type))?.code ??
      d.project_type ??
      '';
    const proposalApprovers = this.approversFromApi(d, 'proposal');
    const contractApprovers = this.approversFromApi(d, 'contract');
    const disciplineValues = [
      this.toBool(d.disc_cs),
      this.toBool(d.disc_me),
      this.toBool(d.disc_facade),
      this.toBool(d.disc_lighting),
      this.toBool(d.disc_transportation),
      this.toBool(d.disc_others_flag),
    ];
    const rawProposalNumberType =
      d.primary_discipline ??
      d.primaryDiscipline ??
      d.proposal_number_type ??
      d.proposalNumberType ??
      '';

    this.form.patchValue({
      copiesTo: d.copies_to ?? '',
      circAdm: d.circ_adm ?? '',
      chFile: d.ch_file ?? '',

      projectName: d.project_name ?? '',
      projectId: d.project_id ?? '',
      projectNo: d.project_no ?? '',
      proposalNumberType: rawProposalNumberType
        ? this.resolveProposalNumberType(rawProposalNumberType)
        : this.inferProposalNumberTypeFromDisciplines(disciplineValues),
      proposalNumber: d.proposal_number ?? d.proposalNumber ?? '',
      proposalAttached: this.toBool(d.proposal_attached),

      locationCity: d.city ?? '',
      locationCountry: d.country ?? '',

      client: d.client_name ?? '',
      clientContactName: d.client_contact_name ?? '',
      clientAddress: d.client_address ?? '',
      clientTel: d.client_tel_no ?? '',
      clientFax: d.client_fax_no ?? '',

      architect: d.architect_name ?? '',
      architectContactName: d.architect_contact_name ?? '',
      architectAddress: d.architect_address ?? '',
      architectTel: d.architect_tel_no ?? '',
      architectFax: d.architect_fax_no ?? '',

      enquiryFrom: this.toBool(d.enquiry_from),

      projectType: projectTypeId,

      feeCalculationAttached: this.toBool(d.fee_calculation_attached),
      estimatedValue: this.toNumber(d.estimated_total_fees),
      currency: d.currency ?? 'THB',

      scopeClearlyDefined: this.toBool(d.scope_clearly_defined),
      adequateResources: this.toBool(d.staff_resources_available),
      helpFromOtherOffices: this.toBool(d.help_from_other_offices),
      subConsultantsRequired: this.toBool(d.sub_consultants_required),

      specialQARequirements: d.qa_requirements ?? '',
      specialConsiderations: d.special_considerations ?? '',
      comments: d.quality_comments ?? '',

      governmentProject: this.toBool(d.is_government_project),
      mmclProject: this.toBool(d.is_mmcl_project),
      mtl: this.toBool(d.is_mtl_project),

      filledInBy: this.normalizeEmployeeRef(d.filled_in_by),
      filledInDate: this.toDate(d.filled_in_date),

      proposalToBeSubmitted: this.toBool(d.proposal_to_be_submitted),
      proposalDecline: this.toBool(d.proposal_decline),
      winProbability: this.toNumber(d.win_probability),

      contractAgreedToProceed: this.toBool(d.contract_agreed_to_proceed),
      contractDecline: this.toBool(d.contract_decline),
      leadTL: this.normalizeEmployeeRef(d.lead_tl),
      tl: d.tl_name ?? '',
      needPQP: this.toBool(d.need_quality_plan_pqp),
    });

    const pr = this.proposalReviewersArray;
    pr.clear();
    pr.push(this.fb.group({ reviewer: [proposalApprovers[0]?.code || this.normalizeEmployeeRef(d.proposal_reviewer1)], status: [proposalApprovers[0]?.decision ?? d.proposal_reviewer1_status] }));
    pr.push(this.fb.group({ reviewer: [proposalApprovers[1]?.code || this.normalizeEmployeeRef(d.proposal_reviewer2)], status: [proposalApprovers[1]?.decision ?? d.proposal_reviewer2_status] }));
    pr.push(this.fb.group({ reviewer: [proposalApprovers[2]?.code || this.normalizeEmployeeRef(d.proposal_reviewer3)], status: [proposalApprovers[2]?.decision ?? d.proposal_reviewer3_status] }));

    const cr = this.contractReviewersArray;
    cr.clear();
    cr.push(this.fb.group({ reviewer: [contractApprovers[0]?.code || this.normalizeEmployeeRef(d.contract_reviewer1)], status: [contractApprovers[0]?.decision ?? d.contract_reviewer1_status] }));
    cr.push(this.fb.group({ reviewer: [contractApprovers[1]?.code || this.normalizeEmployeeRef(d.contract_reviewer2)], status: [contractApprovers[1]?.decision ?? d.contract_reviewer2_status] }));
    cr.push(this.fb.group({ reviewer: [contractApprovers[2]?.code || this.normalizeEmployeeRef(d.contract_reviewer3)], status: [contractApprovers[2]?.decision ?? d.contract_reviewer3_status] }));

    this.ensureSelectedPeopleOptions();

    this.setAttachmentsFromApi(d.attachments);

    this.projectDetailsArray.setValue([
      this.toBool(d.pd_concept_detail_design),
      this.toBool(d.pd_construction_supervision),
      this.toBool(d.pd_value_engineering),
      this.toBool(d.pd_tender_evaluation),
      this.toBool(d.pd_engineering_audit),
      this.toBool(d.pd_others_flag),
    ]);
    this.form.patchValue({ projectDetailsOthers: d.pd_others_text ?? '' });

    this.disciplinesArray.setValue(disciplineValues);
    this.form.patchValue({ disciplinesOthers: d.disc_others_text ?? '' });

  }

  // ---------------------------
  // ✅ SUBMIT (Create / Update)
  // ---------------------------
  onSubmit(): void {
    if (this.isSubmitting) return;

    if (!this.isStage2Mode) {
      // ✅ Mandatory Attachment Validation (Proposal, Enquiry, Fee)
      const proposalYes = this.form.get('proposalAttached')?.value === true;
      const enquiryYes = this.form.get('enquiryFrom')?.value === true;
      const feeYes = this.form.get('feeCalculationAttached')?.value === true;

      if (proposalYes && this.proposalAttachments.length === 0) {
        this.toastr.error('Please upload at least one document for Proposal Attachment.');
        return;
      }
      if (enquiryYes && this.enquiryAttachments.length === 0) {
        this.toastr.error('Please upload at least one document for Enquiry From.');
        return;
      }

      if (feeYes && !this.hasFeeCalculationAttachment()) {
        this.toastr.error('Please upload at least one document for Fee Calculation.');
        return;
      }

      if (this.form.invalid) {
        this.markFormGroupTouched();
        this.toastr.error('Please fill in all required fields.');
        this.scrollToFirstInvalidControl();
        return;
      }

      const proposalValidation = this.validateReviewerSet(this.proposalReviewersArray.value, 'Proposal Review');
      if (proposalValidation) {
        this.toastr.error(proposalValidation);
        return;
      }

      if (this.isEditMode && this.form.get('proposalToBeSubmitted')?.value === true) {
        const winProbability = this.form.get('winProbability')?.value;
        if (winProbability === null || winProbability === undefined || winProbability === '') {
          this.toastr.error('Please enter % Win probability.');
          this.scrollToControl('winProbability');
          return;
        }
      }
    }

    if (this.isStage2Mode && !this.isContractStageEdit()) {
      this.toastr.error('Stage 2 is available only while waiting for Contract Review setup.');
      return;
    }

    if (this.isContractStageEdit()) {
      if (this.form.get('contractAgreedToProceed')?.value !== true) {
        this.toastr.error('Please select Contract Agreed to Proceed.');
        return;
      }

      if (!String(this.form.get('leadTL')?.value ?? '').trim()) {
        this.toastr.error('Please select Lead TL.');
        this.scrollToControl('leadTL');
        return;
      }

      if (this.form.get('tl')?.invalid) {
        this.form.get('tl')?.markAsTouched();
        this.toastr.error('Please fill in TL.');
        this.scrollToControl('tl');
        return;
      }

      const contractValidation = this.validateReviewerSet(this.contractReviewersArray.value, 'Contract Review');
      if (contractValidation) {
        this.toastr.error(contractValidation);
        return;
      }
    }

    const confirmation = this.fuseConfirmationService.open({
      title: this.isStage2Mode ? 'Confirm Stage 2' : (this.isEditMode ? 'Confirm update' : 'Confirm submit'),
      message: this.isStage2Mode
        ? 'Are you sure you want to start Contract Review and generate a Project Number?'
        : this.isEditMode
        ? 'Are you sure you want to update this review?'
        : 'Are you sure you want to submit this review?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: this.isStage2Mode ? 'Start Stage 2' : (this.isEditMode ? 'Update' : 'Submit'), color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      this.submitForm();
    });
  }

  private submitForm(): void {
    const payload = this.buildApiPayload();
    console.log('[DEBUG] Proposal Contract Review Payload:', payload);
    this.isSubmitting = true;

    const req$ =
      this.isEditMode && this.currentId
        ? this.proposalContractReviewService.update(this.currentId, payload)
        : this.proposalContractReviewService.create(payload);

    req$
      .pipe(
        catchError((err) => {
          this.toastr.error(err?.error?.message || 'Save failed!');
          return of(null);
        }),
        finalize(() => (this.isSubmitting = false))
      )
      .subscribe((res: any) => {
        if (!res) return;

        const warning = res?.data?.proposal_number_warning ?? res?.data?.proposalNumberWarning ?? null;
        if (warning) {
          this.toastr.warning(warning);
        }

        const data = res?.data ?? {};
        const generatedNumbers = this.extractGeneratedProjectNumbers(data);
        const generatedProjectNo = generatedNumbers.projectNumber || generatedNumbers.mtProjectNumber;

        if (this.isContractStageEdit() && generatedProjectNo) {
          this.openStage2ProjectNumberDialog(generatedNumbers, String(res?.data?.id ?? this.currentId ?? ''));
          return;
        } else {
          this.toastr.success(
            this.isEditMode
              ? 'Review updated successfully!'
              : 'Review created successfully!'
          );
        }

        const newId = String(res?.data?.id ?? this.currentId ?? '');
        setTimeout(() => {
          if (newId) this.router.navigate(['/proposal-contract-review/view', newId]);
          else this.router.navigate(['/proposal-contract-review']);
        }, this.isContractStageEdit() && generatedProjectNo ? 1800 : 600);
      });
  }

  private openStage2ProjectNumberDialog(numbers: { projectNumber: string; mtProjectNumber: string }, id: string): void {
    const ref = this.dialog.open(Stage2ProjectNumberDialogComponent, {
      width: '520px',
      disableClose: true,
      data: numbers,
    });

    ref.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (id) this.router.navigate(['/proposal-contract-review/view', id]);
        else this.router.navigate(['/proposal-contract-review']);
      });
  }

  private extractGeneratedProjectNumbers(data: any): { projectNumber: string; mtProjectNumber: string } {
    let projectNumber = String(
      data?.project_no ??
      data?.projectNo ??
      data?.project_number ??
      data?.projectNumber ??
      ''
    );
    let mtProjectNumber = String(
      data?.mt_project_no ??
      data?.mtProjectNo ??
      ''
    );

    const firstProject = Array.isArray(data?.projects)
      ? data.projects[0]
      : Array.isArray(data?.mt_projects)
        ? data.mt_projects[0]
        : null;

    if (!projectNumber) {
      projectNumber = String(firstProject?.project_no ?? firstProject?.projectNo ?? firstProject?.mt_project_no ?? firstProject?.mtProjectNo ?? '');
    }

    if (!mtProjectNumber) {
      mtProjectNumber = String(firstProject?.mt_project_no ?? firstProject?.mtProjectNo ?? projectNumber ?? '');
    }

    return { projectNumber, mtProjectNumber };
  }

  private buildApiPayload(): any {
    const v = this.form.getRawValue();

    const projectTypeValue = this.resolveProjectTypeValue(v.projectType);

    const pd = v.projectDetails as boolean[];
    const disc = v.disciplines as boolean[];

    const pr = v.proposalReviewers as any[];
    const cr = v.contractReviewers as any[];
    const approvers = this.buildApproverPayload(pr);
    const primaryDiscipline = this.resolveProposalNumberType(v.proposalNumberType);

    return {
      copies_to: '-',
      circ_adm: '-',
      ch_file: '-',

      project_name: v.projectName ?? '',
      project_id: v.projectId ?? '',
      project_no: v.projectNo ?? '',
      proposal_number: v.proposalNumber ?? '',
      proposal_attached: this.to01(v.proposalAttached),

      city: v.locationCity ?? '',
      country: v.locationCountry ?? '',

      client_name: v.client ?? '',
      client_contact_name: v.clientContactName ?? '',
      client_address: v.clientAddress ?? '',
      client_tel_no: v.clientTel ?? '',
      client_fax_no: v.clientFax ?? '',

      architect_name: v.architect ?? '',
      architect_contact_name: v.architectContactName ?? '',
      architect_address: v.architectAddress ?? '',
      architect_tel_no: v.architectTel ?? '',
      architect_fax_no: v.architectFax ?? '',

      enquiry_from: this.to01(v.enquiryFrom),

      pd_concept_detail_design: this.to01(pd?.[0]),
      pd_construction_supervision: this.to01(pd?.[1]),
      pd_value_engineering: this.to01(pd?.[2]),
      pd_tender_evaluation: this.to01(pd?.[3]),
      pd_engineering_audit: this.to01(pd?.[4]),
      pd_others_flag: this.to01(pd?.[5]),
      pd_others_text: v.projectDetailsOthers ?? '',

      disc_cs: this.to01(disc?.[0]),
      disc_me: this.to01(disc?.[1]),
      disc_facade: this.to01(disc?.[2]),
      disc_lighting: this.to01(disc?.[3]),
      disc_transportation: this.to01(disc?.[4]),
      disc_others_flag: this.to01(disc?.[5]),
      disc_others_text: v.disciplinesOthers ?? '',
      primary_discipline: primaryDiscipline,

      project_type: projectTypeValue,

      fee_calculation_attached: this.to01(v.feeCalculationAttached),
      estimated_total_fees: this.toNumber(v.estimatedValue),
      currency: v.currency ?? 'THB',

      scope_clearly_defined: this.to01(v.scopeClearlyDefined),
      scope_details: v.scopeDetails ?? '',
      staff_resources_available: this.to01(v.adequateResources),
      resources_details: v.resourcesDetails ?? '',
      help_from_other_offices: this.to01(v.helpFromOtherOffices),
      help_details: v.helpDetails ?? '',
      sub_consultants_required: this.to01(v.subConsultantsRequired),
      sub_consultants_details: v.subConsultantsDetails ?? '',

      qa_requirements: v.specialQARequirements ?? '',
      special_considerations: v.specialConsiderations ?? '',
      quality_comments: v.comments ?? '',

      is_government_project: this.to01(v.governmentProject),
      is_mmcl_project: this.to01(v.mmclProject),
      is_mtl_project: this.to01(v.mtl),

      filled_in_by: v.filledInBy ?? '',
      filled_in_date: this.toYmd(v.filledInDate),

      proposal_to_be_submitted: this.to01(v.proposalToBeSubmitted),
      proposal_decline: this.to01(v.proposalDecline),
      win_probability: this.toNumber(v.winProbability),

      proposal_reviewer1: pr?.[0]?.reviewer ?? null,
      proposal_reviewer1_date: null,
      proposal_reviewer1_status: pr?.[0]?.reviewer ? (pr?.[0]?.status || 'pending') : null,
      proposal_reviewer2: pr?.[1]?.reviewer ?? null,
      proposal_reviewer2_date: null,
      proposal_reviewer2_status: pr?.[1]?.reviewer ? (pr?.[1]?.status || 'pending') : null,
      proposal_reviewer3: pr?.[2]?.reviewer ?? null,
      proposal_reviewer3_date: null,
      proposal_reviewer3_status: pr?.[2]?.reviewer ? (pr?.[2]?.status || 'pending') : null,
      approvers,

      contract_agreed_to_proceed: this.to01(v.contractAgreedToProceed),
      contract_decline: this.to01(v.contractDecline),
      lead_tl: v.leadTL ?? '',
      tl_name: v.tl ?? '',
      need_quality_plan_pqp: this.to01(v.needPQP),

      contract_reviewer1: cr?.[0]?.reviewer ?? null,
      contract_reviewer1_date: null,
      contract_reviewer1_status: cr?.[0]?.reviewer ? (cr?.[0]?.status || 'pending') : null,
      contract_reviewer2: cr?.[1]?.reviewer ?? null,
      contract_reviewer2_date: null,
      contract_reviewer2_status: cr?.[1]?.reviewer ? (cr?.[1]?.status || 'pending') : null,
      contract_reviewer3: cr?.[2]?.reviewer ?? null,
      contract_reviewer3_date: null,
      contract_reviewer3_status: cr?.[2]?.reviewer ? (cr?.[2]?.status || 'pending') : null,
      attachments: [
        ...this.proposalAttachments.value.map((a: any) => ({ file_path: this.attachmentPath(a), type: 'proposal' })),
        ...this.enquiryAttachments.value.map((a: any) => ({ file_path: this.attachmentPath(a), type: 'enquiry' })),
        ...this.feeAttachments.value.map((a: any) => ({ file_path: this.attachmentPath(a), type: 'fee_calculation' })),
        ...this.generalAttachments.value.map((a: any) => ({ file_path: this.attachmentPath(a), type: 'general' })),
      ].filter((a: any) => !!a.file_path),
    };
  }

  hasFeeCalculationAttachment(): boolean {
    return this.feeAttachments.controls.some((control) => this.attachmentPath(control.value) !== '');
  }

  private attachmentPath(attachment: any): string {
    return String(
      attachment?.file_path ??
      attachment?.path ??
      attachment?.file_url ??
      attachment?.url ??
      ''
    ).trim();
  }

  private resolveProjectTypeValue(value: any): string {
    const selected = this.projectTypes.find((type) =>
      [type.id, type.code, type.name].filter(Boolean).map(String).includes(String(value ?? ''))
    );

    return selected?.code || selected?.name || String(value ?? '');
  }

  private buildApproverPayload(reviewers: any[]): Array<{ code: string; role: 'MD_DI' | 'DI' }> {
    return (reviewers ?? [])
      .map((row: any, index: number) => ({
        code: String(row?.reviewer ?? ''),
        role: index === 0 ? 'MD_DI' as const : 'DI' as const,
      }))
      .filter((row) => !!row.code);
  }

  private selectedReviewerCodes(reviewers: any[]): string[] {
    return (reviewers ?? [])
      .map((row: any) => String(row?.reviewer ?? '').trim())
      .filter(Boolean);
  }

  private validateReviewerSet(reviewers: any[], label: string): string | null {
    const codes = this.selectedReviewerCodes(reviewers);
    if (codes.length < 2) {
      return `Please select at least 2 signed reviewers for ${label}.`;
    }

    if (new Set(codes).size !== codes.length) {
      return `${label} signed reviewers must not be duplicated.`;
    }

    return null;
  }

  private isContractStageEdit(): boolean {
    const status = String(this.loadedReviewRaw?.status ?? '').toLowerCase();
    return this.isEditMode && status === 'pending_contract_review';
  }

  private inferProposalNumberTypeFromDisciplines(disciplines: boolean[] = []): string {
    if (disciplines?.[2]) return 'facade';
    if (disciplines?.[4]) return 'transportation';
    return 'general';
  }

  private resolveProposalNumberType(value: any): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'façade') return 'facade';
    if (['general', 'facade', 'transportation'].includes(normalized)) {
      return normalized;
    }
    if (['transport', 'traffic'].includes(normalized)) {
      return 'transportation';
    }
    return 'general';
  }

  private setupProposalNumberPreview(): void {
    this.form.get('proposalNumberType')?.valueChanges
      .pipe(debounceTime(150), takeUntil(this.destroy$))
      .subscribe(() => this.loadNextProposalNumber());
  }

  private loadNextProposalNumber(): void {
    if (this.isEditMode) return;

    const requestSeq = ++this.proposalNumberRequestSeq;
    const proposalNumberType = this.resolveProposalNumberType(this.form.get('proposalNumberType')?.value);

    this.form.patchValue({ proposalNumber: 'Loading...' }, { emitEvent: false });

    this.proposalContractReviewService
      .getNextNumber(proposalNumberType)
      .pipe(
        catchError(() => {
          if (requestSeq === this.proposalNumberRequestSeq) {
            this.form.patchValue({ proposalNumber: '' }, { emitEvent: false });
          }
          return of(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((res: any) => {
        if (requestSeq !== this.proposalNumberRequestSeq) return;

        const nextNumber = res?.data?.proposal_number ?? res?.data?.proposalNumber ?? '';
        this.form.patchValue({ proposalNumber: nextNumber }, { emitEvent: false });
      });
  }

  private approversFromApi(d: any, stage: 'proposal' | 'contract'): Array<{ code: string; decision?: string }> {
    const approvalRows = Array.isArray(d?.approvals)
      ? d.approvals
      : Array.isArray(d?.approvers)
      ? d.approvers
      : [];

    return approvalRows
      .filter((approval: any) => approval.stage ? approval.stage === stage : stage === 'proposal')
      .sort((a: any, b: any) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
      .map((approval: any) => ({
        code: this.normalizeEmployeeRef(
          approval.approver_code ??
          approval.approver_id ??
          approval.employee_code ??
          approval.employee_id ??
          approval.code ??
          approval.id
        ),
        decision: approval.decision,
      }))
      .filter((approval: any) => !!approval.code);
  }

  private ensureSelectedPeopleOptions(): void {
    const controls = this.getEmployeeRefControls();
    controls.forEach((control) => {
      const normalized = this.normalizeEmployeeRef(control.value);
      if (control.value !== normalized) {
        control.setValue(normalized, { emitEvent: false });
      }
    });

    const refs = [...new Set(
      controls
        .map((control) => this.normalizeEmployeeRef(control.value))
        .filter(Boolean)
    )];

    refs.forEach((ref) => {
      if (!this.allLoadedEmployees.has(ref)) {
        this.cachePersonOption({ code: ref, initial: '', name: ref, display: ref });
      }
    });

    if (!refs.length) {
      this.triggerPeopleFilters();
      return;
    }

    forkJoin(refs.map((ref) => this.employeeService.getEmployeeOptionByReference(ref)))
      .pipe(takeUntil(this.destroy$))
      .subscribe((options) => {
        const optionByRef = new Map<string, any>();

        options.forEach((option, index) => {
          const ref = refs[index];
          if (!option) return;

          optionByRef.set(ref, option);
          this.cachePersonOption(this.toPersonOption(option));
        });

        controls.forEach((control) => {
          const ref = this.normalizeEmployeeRef(control.value);
          const option = optionByRef.get(ref);
          if (option?.code && this.employeeOptionMatchesReference(option, ref)) {
            control.setValue(String(option.code), { emitEvent: false });
          }
        });

        this.triggerPeopleFilters();
      });
  }

  private getEmployeeRefControls(): FormControl[] {
    const controls: FormControl[] = [];
    const filledInBy = this.form.get('filledInBy');
    if (filledInBy instanceof FormControl) {
      controls.push(filledInBy);
    }

    const leadTL = this.form.get('leadTL');
    if (leadTL instanceof FormControl) {
      controls.push(leadTL);
    }

    for (let i = 0; i < this.proposalReviewersArray.length; i++) {
      const control = this.proposalReviewersArray.at(i).get('reviewer');
      if (control instanceof FormControl) controls.push(control);
    }

    for (let i = 0; i < this.contractReviewersArray.length; i++) {
      const control = this.contractReviewersArray.at(i).get('reviewer');
      if (control instanceof FormControl) controls.push(control);
    }

    return controls;
  }

  private triggerPeopleFilters(): void {
    this.filledInBySearchCtrl.setValue(this.filledInBySearchCtrl.value ?? '', { emitEvent: true });
    this.leadTLSearchCtrl.setValue(this.leadTLSearchCtrl.value ?? '', { emitEvent: true });
    for (let i = 0; i < 3; i++) {
      this.proposalSearchCtrls[i].setValue(this.proposalSearchCtrls[i].value ?? '', { emitEvent: true });
      this.contractSearchCtrls[i].setValue(this.contractSearchCtrls[i].value ?? '', { emitEvent: true });
    }
  }

  private toPersonOption(option: any): PersonOption {
    const code = this.normalizeEmployeeRef(option?.code ?? option?.id ?? option?.employeeId);
    const initial = this.normalizeEmployeeRef(option?.initial);
    const name = this.normalizeEmployeeRef(option?.name ?? [option?.firstName, option?.lastName].filter(Boolean).join(' '));
    const position = this.normalizeEmployeeRef(option?.position ?? option?.role);
    const display = this.normalizeEmployeeRef(option?.displayLabel ?? (code && initial ? `${code} - ${initial}` : code || initial || name || '-'));

    return { code, initial, name, position, display };
  }

  private cachePersonOption(person: PersonOption): void {
    [person.code, person.initial, person.name, person.display]
      .map((value) => this.normalizeEmployeeRef(value))
      .filter(Boolean)
      .forEach((key) => this.allLoadedEmployees.set(key, person));
  }

  private employeeOptionMatchesReference(option: any, ref: string): boolean {
    const normalizedRef = this.normalizeEmployeeRef(ref).toLowerCase();
    if (!normalizedRef) return false;

    return [
      option?.code,
      option?.id,
      option?.employeeId,
      option?.email,
      option?.initial,
      option?.name,
      option?.displayLabel,
    ].some((value) => this.normalizeEmployeeRef(value).toLowerCase() === normalizedRef);
  }

  private normalizeEmployeeRef(value: any): string {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  onCancel(): void {
    if (this.isEditMode && this.currentId) {
      this.router.navigate(['/proposal-contract-review/view', this.currentId]);
    } else {
      this.router.navigate(['/proposal-contract-review']);
    }
  }

  // ---------------------------
  // validation + helper
  // ---------------------------
  private markFormGroupTouched(): void {
    this.markControlsTouched(this.form);
  }

  private markControlsTouched(group: FormGroup | FormArray): void {
    Object.values(group.controls).forEach((control) => {
      control.markAsTouched();

      if (control instanceof FormGroup || control instanceof FormArray) {
        this.markControlsTouched(control);
      }
    });
  }

  private scrollToFirstInvalidControl(): void {
    const controlName = this.findFirstInvalidControlName(this.form);
    if (controlName) {
      this.scrollToControl(controlName);
      return;
    }

    const firstInvalid = this.elementRef.nativeElement.querySelector('.ng-invalid') as HTMLElement | null;
    this.scrollToElement(firstInvalid);
  }

  private findFirstInvalidControlName(group: FormGroup | FormArray): string | null {
    for (const [name, control] of Object.entries(group.controls)) {
      if (control instanceof FormGroup || control instanceof FormArray) {
        const nested = this.findFirstInvalidControlName(control);
        if (nested) return nested;
        continue;
      }

      if (control.invalid) {
        return name;
      }
    }

    return null;
  }

  private scrollToControl(controlName: string): void {
    setTimeout(() => {
      const root = this.elementRef.nativeElement;
      const control = root.querySelector(`[formControlName="${controlName}"], [formcontrolname="${controlName}"]`) as HTMLElement | null;
      const target = control?.closest('mat-form-field, .document-field, .filled-field, .reviewer-row') as HTMLElement | null;
      this.scrollToElement(target || control);
    });
  }

  private scrollToElement(element: HTMLElement | null): void {
    if (!element) return;

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      const focusTarget = element.querySelector('input, textarea, button, .mat-mdc-select-trigger') as HTMLElement | null;
      (focusTarget || element).focus?.();
    }, 250);
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getErrorMessage(fieldName: string): string {
    const field = this.form.get(fieldName);
    const labels: Record<string, string> = {
      projectNo: 'Project Number',
      proposalNumberType: 'Proposal Number Type',
      proposalNumber: 'Proposal Number',
    };
    const label = labels[fieldName] ?? fieldName;
    if (field?.hasError('required')) return `${label} is required`;
    if (field?.hasError('min')) return `${label} must be at least ${field.errors?.['min'].min}`;
    if (field?.hasError('max')) return `${label} must be at most ${field.errors?.['max'].max}`;  //
    return '';
  }

  // Getters for form arrays
  get projectDetailsArray(): FormArray {
    return this.form.get('projectDetails') as FormArray;
  }
  get disciplinesArray(): FormArray {
    return this.form.get('disciplines') as FormArray;
  }
  get proposalReviewersArray(): FormArray {
    return this.form.get('proposalReviewers') as FormArray;
  }
  get contractReviewersArray(): FormArray {
    return this.form.get('contractReviewers') as FormArray;
  }

  // helper convert
  private to01(v: any): number {
    return v === true || v === 1 || v === '1' ? 1 : 0;
  }
  private toBool(v: any): boolean {
    const normalized = String(v ?? '').toLowerCase();
    return v === true || v === 1 || normalized === '1' || normalized === 'yes' || normalized === 'true';
  }
  private toNumber(v: any): number {
    const n = typeof v === 'string' ? Number(v) : Number(v ?? 0);
    return isNaN(n) ? 0 : n;
  }
  private toDate(v: any): Date | null {
    if (!v) return null;
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  private toYmd(v: any): string | null {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Conditional display getters
  get isScopeClearlyDefined(): boolean {
    return this.form.get('scopeClearlyDefined')?.value;
  }
  get isAdequateResources(): boolean {
    return this.form.get('adequateResources')?.value;
  }
  get isHelpFromOtherOffices(): boolean {
    return this.form.get('helpFromOtherOffices')?.value;
  }
  get isSubConsultantsRequired(): boolean {
    return this.form.get('subConsultantsRequired')?.value;
  }
}
