import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  @ViewChild('usernameInput') private usernameInput!: ElementRef<HTMLInputElement>;
  @ViewChild('passwordInput') private passwordInput!: ElementRef<HTMLInputElement>;
  username = '';
  password = '';
  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal('');
  readonly loginProvider = signal<'ldap' | 'local' | null>(null);

  constructor(private readonly auth: AuthService, private readonly router: Router) {}

  submit(provider: 'ldap' | 'local' = 'ldap'): void {
    const username = this.usernameInput.nativeElement.value.trim();
    const password = this.passwordInput.nativeElement.value;
    if (!username || !password || this.loading()) return;
    this.errorMessage.set('');
    this.loading.set(true);
    this.loginProvider.set(provider);
    const request = provider === 'local' ? this.auth.loginLocal(username, password) : this.auth.login(username, password);
    request.pipe(finalize(() => { this.loading.set(false); this.loginProvider.set(null); }))
      .subscribe({
        next: () => void this.router.navigateByUrl('/dashboard'),
        error: (error: HttpErrorResponse) => {
          if (error.status === 401) this.errorMessage.set('Username or password is incorrect.');
          else if (error.status === 503 && provider === 'ldap') this.errorMessage.set('LDAP service is temporarily unavailable. Please try again.');
          else this.errorMessage.set('Unable to sign in. Please contact the administrator.');
        },
      });
  }
}
