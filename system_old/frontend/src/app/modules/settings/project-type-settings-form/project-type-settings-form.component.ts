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
import { ProjectTypeService } from 'app/core/services/project-type.service';

@Component({
    selector: 'app-project-type-settings-form',
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
    templateUrl: './project-type-settings-form.component.html',
    styleUrls: ['./project-type-settings-form.component.scss'],
})
export class ProjectTypeSettingsFormComponent implements OnInit {
    form: FormGroup;
    isSubmitting = false;
    isLoading = false;
    isEditMode = false;
    alert: { type: FuseAlertType; message: string } | null = null;
    projectTypeId: number | null = null;

    constructor(
        private fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute,
        private projectTypeService: ProjectTypeService
    ) {
        this.form = this.fb.group({
            name: ['', [Validators.required]],
            code: ['', [Validators.required]],
            detail: [''],
            is_active: [1],
        });

        const id = this.route.snapshot.paramMap.get('id');
        this.isEditMode = !!id;
        this.projectTypeId = id ? parseInt(id, 10) : null;
    }

    ngOnInit(): void {
        if (this.isEditMode && this.projectTypeId) {
            this.loadData();
        }
    }

    private loadData(): void {
        if (!this.projectTypeId) return;

        this.isLoading = true;
        this.projectTypeService.getById(this.projectTypeId).subscribe({
            next: (item) => {
                if (item) {
                    this.form.patchValue({
                        name: item.name,
                        code: item.code ?? '',
                        detail: item.detail ?? '',
                        is_active: item.is_active ?? 1,
                    });
                }
                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading project type:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to load project type'
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
        const { name, code, detail, is_active } = this.form.value;
        const payload = {
            name,
            code: code || undefined,
            detail: detail || undefined,
            is_active: is_active ?? 1,
        };

        const request =
            this.isEditMode && this.projectTypeId
                ? this.projectTypeService.update(this.projectTypeId, payload)
                : this.projectTypeService.create(payload);

        request.subscribe({
            next: () => {
                this.showAlert(
                    'success',
                    this.isEditMode
                        ? 'Project Type updated successfully'
                        : 'Project Type created successfully'
                );
                setTimeout(() => {
                    this.router.navigate(['/settings/project-types']);
                }, 1000);
            },
            error: (error) => {
                console.error('Error saving project type:', error);
                this.showAlert(
                    'error',
                    error?.error?.message ||
                        (this.isEditMode
                            ? 'Unable to update project type'
                            : 'Unable to create project type')
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
