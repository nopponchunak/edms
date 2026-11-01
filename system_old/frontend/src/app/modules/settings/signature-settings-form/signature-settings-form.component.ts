import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { EmployeeOption, EmployeeService } from 'app/core/services/employee.service';
import { SignatureSettingService } from 'app/core/services/signature-setting.service';

@Component({
    selector: 'app-signature-settings-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterLink,
        MatButtonModule,
        MatCardModule,
        MatFormFieldModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatSelectModule,
        NgxMatSelectSearchModule,
        FuseAlertComponent,
    ],
    templateUrl: './signature-settings-form.component.html',
    styleUrls: ['./signature-settings-form.component.scss'],
})
export class SignatureSettingsFormComponent implements OnInit, OnDestroy {
    private readonly unsubscribeAll = new Subject<void>();

    form: FormGroup;
    employeeSearchCtrl = new FormControl('');
    employeeOptions: EmployeeOption[] = [];
    isSubmitting = false;
    isLoading = false;
    isEditMode = false;
    alert: { type: FuseAlertType; message: string } | null = null;
    signatureSettingId: number | null = null;

    constructor(
        private fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute,
        private signatureSettingService: SignatureSettingService,
        private employeeService: EmployeeService
    ) {
        this.form = this.fb.group({
            employee_code: ['', [Validators.required]],
            is_active: [true],
        });

        const id = this.route.snapshot.paramMap.get('id');
        this.isEditMode = !!id;
        this.signatureSettingId = id ? parseInt(id, 10) : null;
    }

    ngOnInit(): void {
        this.loadEmployeeOptions();

        this.employeeSearchCtrl.valueChanges
            .pipe(
                debounceTime(250),
                distinctUntilChanged(),
                takeUntil(this.unsubscribeAll)
            )
            .subscribe((search) => {
                this.loadEmployeeOptions(search || '');
            });

        if (this.isEditMode && this.signatureSettingId) {
            this.loadData();
        }
    }

    ngOnDestroy(): void {
        this.unsubscribeAll.next();
        this.unsubscribeAll.complete();
    }

    toggleActive(): void {
        const control = this.form.get('is_active');
        control?.setValue(!control.value);
        control?.markAsDirty();
        control?.markAsTouched();
    }

    private loadData(): void {
        if (!this.signatureSettingId) return;

        this.isLoading = true;
        this.signatureSettingService.getById(this.signatureSettingId).subscribe({
            next: (item) => {
                if (item) {
                    this.form.patchValue({
                        employee_code: item.employee_code,
                        is_active: item.is_active === 1,
                    });

                    this.ensureSelectedEmployeeOption(item.employee_code);
                }

                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading signature setting:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to load signature setting'
                );
                this.isLoading = false;
            },
        });
    }

    private loadEmployeeOptions(search = ''): void {
        this.employeeService
            .getEmployeeOptions(search, 100)
            .pipe(takeUntil(this.unsubscribeAll))
            .subscribe({
                next: (options) => {
                    this.employeeOptions = this.mergeSelectedEmployee(options);
                },
                error: () => {
                    this.employeeOptions = this.mergeSelectedEmployee([]);
                },
            });
    }

    private ensureSelectedEmployeeOption(code: string): void {
        if (!code) {
            return;
        }

        const exists = this.employeeOptions.some((option) => option.code === code);
        if (exists) {
            return;
        }

        this.employeeService
            .getEmployeeOptionByReference(code)
            .pipe(takeUntil(this.unsubscribeAll))
            .subscribe((option) => {
                if (option) {
                    this.employeeOptions = this.mergeEmployeeOptions([
                        option,
                        ...this.employeeOptions,
                    ]);
                }
            });
    }

    private mergeSelectedEmployee(options: EmployeeOption[]): EmployeeOption[] {
        const selectedCode = this.form.get('employee_code')?.value;
        if (!selectedCode) {
            return this.mergeEmployeeOptions(options);
        }

        const selected = this.employeeOptions.find((option) => option.code === selectedCode);
        return this.mergeEmployeeOptions(selected ? [selected, ...options] : options);
    }

    private mergeEmployeeOptions(options: EmployeeOption[]): EmployeeOption[] {
        const seen = new Set<string>();
        return options.filter((option) => {
            if (!option?.code || seen.has(option.code)) {
                return false;
            }
            seen.add(option.code);
            return true;
        });
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.isSubmitting = true;
        const payload = {
            employee_code: String(this.form.value.employee_code || '').trim(),
            is_active: this.form.value.is_active ? 1 : 0,
        };

        const request =
            this.isEditMode && this.signatureSettingId
                ? this.signatureSettingService.update(this.signatureSettingId, payload)
                : this.signatureSettingService.create(payload);

        request.subscribe({
            next: () => {
                this.showAlert(
                    'success',
                    this.isEditMode
                        ? 'Signature Setting updated successfully'
                        : 'Signature Setting created successfully'
                );
                setTimeout(() => {
                    this.router.navigate(['/settings/signatures']);
                }, 1000);
            },
            error: (error) => {
                console.error('Error saving signature setting:', error);
                const validationMessage = error?.error?.errors?.employee_code?.[0];
                this.showAlert(
                    'error',
                    validationMessage ||
                        error?.error?.message ||
                        (this.isEditMode
                            ? 'Unable to update signature setting'
                            : 'Unable to create signature setting')
                );
                this.isSubmitting = false;
            },
        });
    }

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 3000);
    }
}
