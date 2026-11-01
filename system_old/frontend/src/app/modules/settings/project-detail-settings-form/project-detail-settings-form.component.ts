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
import { ProjectDetailService } from 'app/core/services/project-detail.service';

@Component({
    selector: 'app-project-detail-settings-form',
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
    templateUrl: './project-detail-settings-form.component.html',
    styleUrls: ['./project-detail-settings-form.component.scss'],
})
export class ProjectDetailSettingsFormComponent implements OnInit {
    form: FormGroup;
    isSubmitting = false;
    isLoading = false;
    isEditMode = false;
    alert: { type: FuseAlertType; message: string } | null = null;
    projectDetailId: number | null = null;

    constructor(
        private fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute,
        private projectDetailService: ProjectDetailService
    ) {
        this.form = this.fb.group({
            name: ['', [Validators.required]],
            code: [''],
            detail: [''],
            is_active: [1],
        });

        const id = this.route.snapshot.paramMap.get('id');
        this.isEditMode = !!id;
        this.projectDetailId = id ? parseInt(id, 10) : null;
    }

    ngOnInit(): void {
        if (this.isEditMode && this.projectDetailId) {
            this.loadData();
        }
    }

    private loadData(): void {
        if (!this.projectDetailId) return;

        this.isLoading = true;
        this.projectDetailService.getById(this.projectDetailId).subscribe({
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
                console.error('Error loading project detail:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to load project detail'
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

        const request =
            this.isEditMode && this.projectDetailId
                ? this.projectDetailService.update(this.projectDetailId, {
                      code: code || undefined,
                      name,
                      detail: detail || undefined,
                      is_active: is_active ?? 1,
                  })
                : this.projectDetailService.create({
                      code: code || undefined,
                      name,
                      detail: detail || undefined,
                      is_active: is_active ?? 1,
                  });

        request.subscribe({
            next: (_result) => {
                this.showAlert(
                    'success',
                    this.isEditMode
                        ? 'Project Detail updated successfully'
                        : 'Project Detail created successfully'
                );
                setTimeout(() => {
                    this.router.navigate(['/settings/project-details']);
                }, 1000);
            },
            error: (error) => {
                console.error('Error saving project detail:', error);
                this.showAlert(
                    'error',
                    error?.error?.message ||
                        (this.isEditMode
                            ? 'Unable to update project detail'
                            : 'Unable to create project detail')
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
