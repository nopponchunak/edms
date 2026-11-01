import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
    FormBuilder,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { fuseAnimations } from '@fuse/animations';
import { AuthService } from 'app/core/services/auth.service';

@Component({
    selector: 'app-login-admin',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterLink,
        MatIconModule,
        MatProgressSpinnerModule,
    ],
    templateUrl: './login-admin.component.html',
    styleUrls: ['./login-admin.component.scss'],
    animations: fuseAnimations,
})
export class LoginAdminComponent implements OnInit {
    loginForm: FormGroup;
    showAlert = false;
    alert: { type: 'success' | 'error'; message: string } = {
        type: 'success',
        message: '',
    };
    loading = false;
    hidePassword = true;

    constructor(
        private fb: FormBuilder,
        private authService: AuthService,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.loginForm = this.fb.group({
            username: ['', Validators.required],
            password: ['', Validators.required],
        });
    }

    login(): void {
        if (this.loginForm.invalid) {
            this.loginForm.markAllAsTouched();
            return;
        }

        this.showAlert = false;
        this.loading = true;

        const { username, password } = this.loginForm.value;

        this.authService.login({ email: username, password }).subscribe({
            next: (response) => {
                this.loading = false;
                // Redirect to dashboard/home after successful login
                this.router.navigate(['/charitable-contributions']);
            },
            error: (error) => {
                this.loading = false;
                this.showAlert = true;
                this.alert = {
                    type: 'error',
                    message:
                        error.message ||
                        error.error?.message ||
                        'Invalid username or password. Please try again.',
                };
            },
        });
    }

    togglePasswordVisibility(): void {
        this.hidePassword = !this.hidePassword;
    }
}
