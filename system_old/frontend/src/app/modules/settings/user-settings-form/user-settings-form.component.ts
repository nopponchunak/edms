import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ApiService } from 'app/core/services/api.service';
import { PermissionService, PermissionItem } from 'app/core/services/permission.service';
import { MatSelectModule } from '@angular/material/select';

@Component({
    selector: 'app-user-settings-form',
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
        MatSelectModule,
        MatProgressSpinnerModule,
        FuseAlertComponent,
    ],
    templateUrl: './user-settings-form.component.html',
    styleUrls: ['./user-settings-form.component.scss'],
})
export class UserSettingsFormComponent implements OnInit, OnDestroy {
    form: FormGroup;
    isSubmitting = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    permissions: PermissionItem[] = [];

    /** จาก API ตอนโหลด user: 'local' = แก้ Name, Email, Phone, Permission ได้ | 'sync_ad' = แก้ได้เฉพาะ Permission */
    userType: 'local' | 'sync_ad' | null = null;

    private userId: string | null = null;
    isEdit = false;

    constructor(
        private fb: FormBuilder,
        private apiService: ApiService,
        private permissionService: PermissionService,
        private router: Router,
        private route: ActivatedRoute,
    ) {
        this.form = this.fb.group({
            permission_id: [1, [Validators.required]],
            code: [''],
            username: ['', [Validators.required]],
            name: ['', [Validators.required]],
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(6)]],
            phone: ['', [Validators.required]],
            image: [''],
        });
    }

    ngOnInit(): void {
        this.userId = this.route.snapshot.paramMap.get('id');
        this.isEdit = !!this.userId;

        // ถ้าเป็นโหมดแก้ไข ไม่บังคับกรอก password
        if (this.isEdit) {
            const passwordCtrl = this.form.get('password');
            passwordCtrl?.clearValidators();
            passwordCtrl?.updateValueAndValidity();
        }

        this.loadPermissions();
        if (this.isEdit && this.userId) {
            this.loadUser(this.userId);
        }
    }

    ngOnDestroy(): void {}

    private loadPermissions(): void {
        this.permissionService.getPermissionsList().subscribe({
            next: (response) => {
                if (response.status && response.data) {
                    this.permissions = response.data;
                }
            },
            error: (error) => {
                console.error('Error loading permissions:', error);
                this.permissions = [];
            },
        });
    }

    private loadUser(id: string): void {
        this.apiService.getUserDetail(id).subscribe({
            next: (response) => {
                if (response.status && response.data) {
                    const data = response.data;
                    this.userType = (data.type === 'sync_ad' ? 'sync_ad' : 'local') as 'local' | 'sync_ad';
                    this.form.patchValue({
                        permission_id: data.permission_id ?? 1,
                        code: data.code ?? '',
                        username: data.username ?? '',
                        name: data.name ?? '',
                        email: data.email ?? '',
                        phone: data.phone ?? '',
                        image: data.image ?? '',
                    });
                    // โหมด edit: username เป็น identifier ไม่ให้แก้
                    this.form.get('username')?.disable();
                    // type === "sync_ad" → แก้ได้เฉพาะ Permission; type === "local" → แก้ Name, Email, Phone, Permission ได้
                    if (this.userType === 'sync_ad') {
                        this.form.get('name')?.disable();
                        this.form.get('email')?.disable();
                        this.form.get('phone')?.disable();
                    }
                }
            },
            error: (error) => {
                console.error('Error loading user for edit:', error);
                this.showAlert('error', 'Unable to load user data. Please try again.');
            },
        });
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.isSubmitting = true;
        let payload: any;

        if (this.isEdit && this.userId) {
            payload = { ...this.form.getRawValue() };
            if (!payload.password) {
                delete payload.password;
            }
        } else {
            payload = { ...this.form.getRawValue() };
            if (!payload.password) {
                delete payload.password;
            }
            // เพิ่ม User จาก Program ให้ fix type === "local"
            payload.type = 'local';
        }

        const request$ = this.isEdit && this.userId
            ? this.apiService.updateUserDetail(this.userId, payload)
            : this.apiService.createUser(payload);

        request$.subscribe({
            next: (response) => {
                this.isSubmitting = false;
                if (response.status) {
                    const msg = this.isEdit
                        ? response.message || 'User updated successfully'
                        : response.message || 'User created successfully';
                    this.showAlert('success', msg);
                    setTimeout(() => {
                        this.router.navigate(['/settings/users/local']);
                    }, 800);
                } else {
                    const msg = this.isEdit
                        ? response.message || 'Unable to update user'
                        : response.message || 'Unable to create user';
                    this.showAlert('error', msg);
                }
            },
            error: (error) => {
                console.error('Error saving user:', error);
                this.isSubmitting = false;
                const msg = this.isEdit
                    ? error.error?.message || 'Unable to update user. Please try again.'
                    : error.error?.message || 'Unable to create user. Please try again.';
                this.showAlert('error', msg);
            },
        });
    }

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 4000);
    }
}


