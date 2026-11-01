import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'app/core/services/auth.service';

@Component({
    selector: 'app-sign-out',
    standalone: true,
    template: `
        <div class="flex flex-col items-center justify-center min-h-screen">
            <div class="text-xl">Signing out...</div>
        </div>
    `
})
export class SignOutComponent implements OnInit {
    constructor(
        private authService: AuthService,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.authService.logout();
    }
}
