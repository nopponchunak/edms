import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { AuthService } from 'app/core/services/auth.service';
import { UserRole } from 'app/core/models/user.model';

@Component({
    selector: 'app-sign-up',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterLink,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        MatIconModule,
        MatSelectModule,
        MatProgressSpinnerModule,
        FuseAlertComponent
    ],
    templateUrl: './sign-up.component.html',
    styleUrls: ['./sign-up.component.scss']
})
export class SignUpComponent implements OnInit {
    signUpForm: FormGroup;
    showAlert = false;
    alert: { type: FuseAlertType; message: string } = {
        type: 'success',
        message: ''
    };
    loading = false;
    hidePassword = true;
    hidePasswordConfirm = true;
    
    userRoles = [
        { value: UserRole.USER, label: 'User' },
        { value: UserRole.DOCTOR, label: 'Doctor' },
        { value: UserRole.NURSE, label: 'Nurse' },
        { value: UserRole.ADMIN, label: 'Administrator' }
    ];

    constructor(
        private fb: FormBuilder,
        private authService: AuthService,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.signUpForm = this.fb.group({
            firstName: ['', Validators.required],
            lastName: ['', Validators.required],
            email: ['', [Validators.required, Validators.email]],
            phoneNumber: ['', [Validators.pattern(/^[0-9]{10}$/)]],
            password: ['', [Validators.required, Validators.minLength(6)]],
            passwordConfirm: ['', Validators.required],
            role: [UserRole.USER, Validators.required]
        }, {
            validators: this.passwordMatchValidator
        });
    }

    passwordMatchValidator(form: FormGroup) {
        const password = form.get('password')?.value;
        const passwordConfirm = form.get('passwordConfirm')?.value;

        if (password !== passwordConfirm) {
            form.get('passwordConfirm')?.setErrors({ passwordMismatch: true });
        } else {
            const errors = form.get('passwordConfirm')?.errors;
            if (errors) {
                delete errors['passwordMismatch'];
                if (Object.keys(errors).length === 0) {
                    form.get('passwordConfirm')?.setErrors(null);
                }
            }
        }
        return null;
    }

    signUp(): void {
        if (this.signUpForm.invalid) {
            return;
        }

        this.showAlert = false;
        this.loading = true;

        const { passwordConfirm, ...registerData } = this.signUpForm.value;

        this.authService.register(registerData).subscribe({
            next: (response) => {
                this.loading = false;
                this.showAlert = true;
                this.alert = {
                    type: 'success',
                    message: 'Registration successful! Signing in...'
                };
                setTimeout(() => {
                    // Redirect to dashboard/home after successful registration
                    this.router.navigate(['/charitable-contributions']);
                }, 1500);
            },
            error: (error) => {
                this.loading = false;
                this.showAlert = true;
                this.alert = {
                    type: 'error',
                    message: error.error?.message || 'Registration failed. Please try again.'
                };
            }
        });
    }

    togglePasswordVisibility(field: 'password' | 'passwordConfirm'): void {
        if (field === 'password') {
            this.hidePassword = !this.hidePassword;
        } else {
            this.hidePasswordConfirm = !this.hidePasswordConfirm;
        }
    }
}
