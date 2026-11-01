import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
    FormArray,
    FormBuilder,
    FormGroup,
    ReactiveFormsModule,
    Validators,
    FormControl,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { Router, ActivatedRoute } from '@angular/router';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { ExternalProject, ExternalProjectService } from 'app/core/services/external-project.service';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

interface DesignFeeItem {
    description: string;
    reference: string;
    engineerLevel: string;
    hoursInput: number;
    rateThb: number;
    totalThb: number;
}

interface StandardRate {
    position: string;
    rateThb: number;
    rateUsd: number;
}

@Component({
    selector: 'app-additional-design-fees-form',
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
        NgxMatSelectSearchModule,
        ViewActionsComponent,
    ],
    templateUrl: './additional-design-fees-form.component.html',
    styleUrls: ['./additional-design-fees-form.component.scss'],
})
export class AdditionalDesignFeesFormComponent implements OnInit {
    form: FormGroup;
    isLoading = false;
    isView = false;
    isEdit = false;
    formId: string | null = null;

    projectSearchCtrl = new FormControl('');
    filteredProjectOptions: ExternalProject[] = [];
    private readonly destroy$ = new Subject<void>();

    // Standard charge-out rates
    standardRates: StandardRate[] = [
        { position: 'Director', rateThb: 7000, rateUsd: 230 },
        {
            position: 'Associate Director / BIM Manager',
            rateThb: 6000,
            rateUsd: 200,
        },
        {
            position: 'Executive Engineer / Senior Engineering Manager',
            rateThb: 5000,
            rateUsd: 170,
        },
        { position: 'Senior Engineer', rateThb: 3500, rateUsd: 120 },
        { position: 'Engineer 1', rateThb: 2500, rateUsd: 85 },
        { position: 'Engineer 2', rateThb: 2000, rateUsd: 75 },
        { position: 'Engineer 3', rateThb: 1750, rateUsd: 65 },
        { position: 'BIM/Revit - Specialist', rateThb: 1750, rateUsd: 65 },
        { position: 'BIM/Revit - Modeller', rateThb: 1200, rateUsd: 45 },
        { position: 'CAD Draftsman', rateThb: 1200, rateUsd: 45 },
    ];

    // Engineer/Draftsman levels for dropdown
    engineerLevels = [
        'Director',
        'Associate Director / BIM Manager',
        'Executive Engineer / Senior Engineering Manager',
        'Senior Engineer',
        'Engineer 1',
        'Engineer 2',
        'Engineer 3',
        'BIM/Revit - Specialist',
        'BIM/Revit - Modeller',
        'CAD Draftsman',
    ];

    constructor(
        private fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute,
        private projectService: ExternalProjectService,
        private fuseConfirmationService: FuseConfirmationService,
        private toastr: ToastrService
    ) {
        this.form = this.createForm();
    }

    ngOnInit(): void {
        this.route.params.subscribe(params => {
            this.formId = params['id'];
            this.isEdit = this.route.snapshot.url.some(segment => segment.path === 'edit');
            this.isView = this.route.snapshot.url.some(segment => segment.path === 'view');
        });
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
            date: [new Date(), [Validators.required]],
            claimNo: ['', [Validators.required]],

            // Discipline checkboxes
            disciplineCs: [false],
            disciplineMep: [false],
            disciplineOther: [false],
            disciplineOtherText: [''],

            // Design fee items
            designFeeItems: this.fb.array([]),

            // Total
            totalExclVat: [0, [Validators.required, Validators.min(0)]],

            // Charge-out rate options
            ratePerAgreement: [false],
            officeStandardRate: [true],

            // Meinhardt Approval
            meinhardtApprovalName: ['', [Validators.required]],
            meinhardtApprovalDate: [new Date(), [Validators.required]],

            // Client Approval
            clientApproved: [false],
            clientSignature: ['', [Validators.required]],
            clientName: ['', [Validators.required]],

            // Status
            status: ['draft'],
        });
    }

    private initializeForm(): void {
        // Add initial design fee item
        this.addDesignFeeItem();

        // Set up form value changes for calculations
        this.form.get('designFeeItems')?.valueChanges.subscribe(() => {
            this.calculateTotal();
        });

        // Load mock data for demonstration
        this.loadMockData();
    }

    private loadMockData(): void {
        // Mock project data
        const mockData = {
            projectName: 'New Hospital Complex - Phase 2',
            projectNo: 'MT2024001',
            claimNo: 'CLM-2024-001',
            disciplineCs: true,
            disciplineMep: false,
            disciplineOther: false,
            meinhardtApprovalName: 'Dr. John Smith',
            clientName: 'ABC Hospital Ltd.',
            clientSignature: 'Dr. Jane Doe',
        };

        this.form.patchValue(mockData);

        // Add some mock design fee items
        this.addMockDesignFeeItems();
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

    private addMockDesignFeeItems(): void {
        const mockItems = [
            {
                description:
                    'Additional structural analysis for seismic requirements',
                reference: 'REF-001',
                engineerLevel: 'Senior Engineer',
                hoursInput: 40,
                rateThb: 3500,
                totalThb: 140000,
            },
            {
                description: 'Revised MEP design for additional floor',
                reference: 'REF-002',
                engineerLevel: 'Engineer 1',
                hoursInput: 24,
                rateThb: 2500,
                totalThb: 60000,
            },
        ];

        // Clear existing items and add mock items
        while (this.designFeeItems.length > 0) {
            this.designFeeItems.removeAt(0);
        }

        mockItems.forEach((item) => {
            const itemGroup = this.fb.group({
                description: [item.description, [Validators.required]],
                reference: [item.reference],
                engineerLevel: [item.engineerLevel, [Validators.required]],
                hoursInput: [
                    item.hoursInput,
                    [Validators.required, Validators.min(0)],
                ],
                rateThb: [
                    item.rateThb,
                    [Validators.required, Validators.min(0)],
                ],
                totalThb: [
                    item.totalThb,
                    [Validators.required, Validators.min(0)],
                ],
            });

            // Set up value changes for this item
            itemGroup.get('hoursInput')?.valueChanges.subscribe(() => {
                this.calculateItemTotal(itemGroup);
            });

            itemGroup.get('rateThb')?.valueChanges.subscribe(() => {
                this.calculateItemTotal(itemGroup);
            });

            this.designFeeItems.push(itemGroup);
        });

        this.calculateTotal();
    }

    get designFeeItems(): FormArray {
        return this.form.get('designFeeItems') as FormArray;
    }

    addDesignFeeItem(): void {
        const item = this.fb.group({
            description: ['', [Validators.required]],
            reference: [''],
            engineerLevel: ['', [Validators.required]],
            hoursInput: [0, [Validators.required, Validators.min(0)]],
            rateThb: [0, [Validators.required, Validators.min(0)]],
            totalThb: [0, [Validators.required, Validators.min(0)]],
        });

        // Set up value changes for this item
        item.get('hoursInput')?.valueChanges.subscribe(() => {
            this.calculateItemTotal(item);
        });

        item.get('rateThb')?.valueChanges.subscribe(() => {
            this.calculateItemTotal(item);
        });

        this.designFeeItems.push(item);
    }

    removeDesignFeeItem(index: number): void {
        this.designFeeItems.removeAt(index);
    }

    private calculateItemTotal(item: FormGroup): void {
        const hours = item.get('hoursInput')?.value || 0;
        const rate = item.get('rateThb')?.value || 0;
        const total = hours * rate;
        item.get('totalThb')?.setValue(total, { emitEvent: false });
        this.calculateTotal();
    }

    private calculateTotal(): void {
        const items = this.designFeeItems.value;
        const total = items.reduce(
            (sum: number, item: DesignFeeItem) => sum + (item.totalThb || 0),
            0
        );
        this.form.get('totalExclVat')?.setValue(total, { emitEvent: false });
    }

    onEngineerLevelChange(index: number, level: string): void {
        const item = this.designFeeItems.at(index);
        const selectedRate = this.standardRates.find(
            (rate) => rate.position === level
        );
        if (selectedRate) {
            item.get('rateThb')?.setValue(selectedRate.rateThb);
        }
    }

    onDisciplineChange(): void {
        const cs = this.form.get('disciplineCs')?.value;
        const mep = this.form.get('disciplineMep')?.value;
        const other = this.form.get('disciplineOther')?.value;

        if (!cs && !mep && !other) {
            this.form.get('disciplineOther')?.setValue(true);
        }
    }

    onChargeOutRateChange(): void {
        const ratePerAgreement = this.form.get('ratePerAgreement')?.value;
        const officeStandardRate = this.form.get('officeStandardRate')?.value;

        if (ratePerAgreement && officeStandardRate) {
            this.form.get('officeStandardRate')?.setValue(false);
        }
    }

    onClientApprovalChange(): void {
        const approved = this.form.get('clientApproved')?.value;

    }

    onSubmit(): void {
        if (this.isLoading) return;

        if (!this.form.valid) {
            this.form.markAllAsTouched();
            this.toastr.error('Please fill in all required fields.');
            return;
        }

        const confirmation = this.fuseConfirmationService.open({
            title: this.isEdit ? 'Confirm update' : 'Confirm submit',
            message: this.isEdit
                ? 'Are you sure you want to update this form?'
                : 'Are you sure you want to submit this form?',
            icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
            actions: {
                cancel: { show: true, label: 'Cancel' },
                confirm: { show: true, label: this.isEdit ? 'Update' : 'Submit', color: 'primary' },
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
            this.toastr.success(this.isEdit ? 'Form updated successfully!' : 'Form submitted successfully!');
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
            const confirmLeave = confirm(
                'You have unsaved changes. Are you sure you want to leave?'
            );
            if (!confirmLeave) {
                return;
            }
        }

        // Navigate back to the list page
        this.router.navigate(['/additional-design-fees']);
    }

    onEdit(): void {
        if (this.formId) {
            this.router.navigate(['/additional-design-fees/edit', this.formId]);
        }
    }
}
