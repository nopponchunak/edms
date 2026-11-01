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
    selector: 'app-sign-in',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterLink,
        MatIconModule,
        MatProgressSpinnerModule,
    ],
    templateUrl: './sign-in.component.html',
    styleUrls: ['./sign-in.component.scss'],
    animations: fuseAnimations,
})
export class SignInComponent implements OnInit {
    signInForm: FormGroup;
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
        this.signInForm = this.fb.group({
            username: ['', Validators.required],
            password: ['', Validators.required],
            rememberMe: [false],
        });
    }

    signIn(): void {
        if (this.signInForm.invalid) {
            this.signInForm.markAllAsTouched();
            return;
        }

        this.showAlert = false;
        this.loading = true;

        const { username, password } = this.signInForm.value;

        this.authService.loginLdap({ username, password }).subscribe({
            next: (response) => {
                this.loading = false;
                this.router.navigate(['/dashboard']);
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
