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
import { SubConsultantTypeService } from 'app/core/services/sub-consultant-type.service';

@Component({
    selector: 'app-sub-consultant-type-settings-form',
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
    templateUrl: './sub-consultant-type-settings-form.component.html',
    styleUrls: ['./sub-consultant-type-settings-form.component.scss'],
})
export class SubConsultantTypeSettingsFormComponent implements OnInit {
    form: FormGroup;
    isSubmitting = false;
    isLoading = false;
    isEditMode = false;
    alert: { type: FuseAlertType; message: string } | null = null;
    subConsultantTypeId: number | null = null;

    constructor(
        private fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute,
        private subConsultantTypeService: SubConsultantTypeService
    ) {
        this.form = this.fb.group({
            code: ['', [Validators.required]],
            name: ['', [Validators.required]],
            detail: [''],
            is_active: [1],
        });

        const id = this.route.snapshot.paramMap.get('id');
        this.isEditMode = !!id;
        this.subConsultantTypeId = id ? parseInt(id, 10) : null;
    }

    ngOnInit(): void {
        if (this.isEditMode && this.subConsultantTypeId) {
            this.loadData();
        }
    }

    private loadData(): void {
        if (!this.subConsultantTypeId) return;

        this.isLoading = true;
        this.subConsultantTypeService.getById(this.subConsultantTypeId).subscribe({
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
                console.error('Error loading sub-consultant type:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to load sub-consultant type'
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
            this.isEditMode && this.subConsultantTypeId
                ? this.subConsultantTypeService.update(this.subConsultantTypeId, payload)
                : this.subConsultantTypeService.create(payload);

        request.subscribe({
            next: () => {
                this.showAlert(
                    'success',
                    this.isEditMode
                        ? 'Sub-Consultant Type updated successfully'
                        : 'Sub-Consultant Type created successfully'
                );
                setTimeout(() => {
                    this.router.navigate(['/settings/sub-consultant-types']);
                }, 1000);
            },
            error: (error) => {
                console.error('Error saving sub-consultant type:', error);
                this.showAlert(
                    'error',
                    error?.error?.message ||
                        (this.isEditMode
                            ? 'Unable to update sub-consultant type'
                            : 'Unable to create sub-consultant type')
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
