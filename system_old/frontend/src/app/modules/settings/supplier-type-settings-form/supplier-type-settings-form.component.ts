import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { SupplierTypeService } from 'app/core/services/supplier-type.service';

@Component({
    selector: 'app-supplier-type-settings-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterLink,
        MatButtonModule,
        MatCardModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatProgressSpinnerModule,
        MatSelectModule,
        FuseAlertComponent,
    ],
    templateUrl: './supplier-type-settings-form.component.html',
    styleUrls: ['./supplier-type-settings-form.component.scss'],
})
export class SupplierTypeSettingsFormComponent implements OnInit {
    form: FormGroup;
    isSubmitting = false;
    isLoading = false;
    isEditMode = false;
    alert: { type: FuseAlertType; message: string } | null = null;
    supplierTypeId: number | null = null;

    constructor(
        private fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute,
        private supplierTypeService: SupplierTypeService
    ) {
        this.form = this.fb.group({
            code: ['', [Validators.required]],
            name: ['', [Validators.required]],
            detail: [''],
            is_active: [1],
        });

        const id = this.route.snapshot.paramMap.get('id');
        this.isEditMode = !!id;
        this.supplierTypeId = id ? parseInt(id, 10) : null;
    }

    ngOnInit(): void {
        if (this.isEditMode && this.supplierTypeId) {
            this.loadData();
        }
    }

    private loadData(): void {
        if (!this.supplierTypeId) return;

        this.isLoading = true;
        this.supplierTypeService.getById(this.supplierTypeId).subscribe({
            next: (item) => {
                if (item) {
                    this.form.patchValue({
                        code: item.code ?? '',
                        name: item.name,
                        detail: item.detail ?? '',
                        is_active: item.is_active ?? 1,
                    });
                }
                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading supplier type:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to load supplier type'
                );
                this.isLoading = false;
            },
        });
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.isSubmitting = true;
        const { code, name, detail, is_active } = this.form.value;
        const payload = {
            code,
            name,
            detail: detail || undefined,
            is_active: is_active ?? 1,
        };

        const request =
            this.isEditMode && this.supplierTypeId
                ? this.supplierTypeService.update(this.supplierTypeId, payload)
                : this.supplierTypeService.create(payload);

        request.subscribe({
            next: () => {
                this.showAlert(
                    'success',
                    this.isEditMode
                        ? 'Supplier Type updated successfully'
                        : 'Supplier Type created successfully'
                );
                setTimeout(() => {
                    this.router.navigate(['/settings/supplier-types']);
                }, 1000);
            },
            error: (error) => {
                console.error('Error saving supplier type:', error);
                this.showAlert(
                    'error',
                    error?.error?.message ||
                        (this.isEditMode
                            ? 'Unable to update supplier type'
                            : 'Unable to create supplier type')
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
