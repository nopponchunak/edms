import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { HttpClient } from '@angular/common/http';

describe('authInterceptor', () => {
  let http: HttpClient;
  let testing: HttpTestingController;
  let auth: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', [
      'accessToken',
      'refreshToken',
      'refreshAccessToken',
      'clearSession',
    ]);
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
    router.navigateByUrl.and.resolveTo(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    testing = TestBed.inject(HttpTestingController);
  });

  afterEach(() => testing.verify());

  it('clears a legacy session and redirects when no refresh token exists', async () => {
    auth.accessToken.and.returnValue('expired-access-token');
    auth.refreshToken.and.returnValue(null);

    const result = firstValueFrom(http.get(`${environment.apiBaseUrl}/modules`)).catch(() => null);
    testing.expectOne(`${environment.apiBaseUrl}/modules`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await result;

    expect(auth.clearSession).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('refreshes once and retries the failed request with the new token', async () => {
    auth.accessToken.and.returnValue('expired-access-token');
    auth.refreshToken.and.returnValue('refresh-token');
    auth.refreshAccessToken.and.returnValue(of('new-access-token'));

    const result = firstValueFrom(http.get(`${environment.apiBaseUrl}/modules`));
    const first = testing.expectOne(`${environment.apiBaseUrl}/modules`);
    expect(first.request.headers.get('Authorization')).toBe('Bearer expired-access-token');
    first.flush({}, { status: 401, statusText: 'Unauthorized' });
    const retry = testing.expectOne(`${environment.apiBaseUrl}/modules`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-access-token');
    retry.flush({ status: true });

    await expectAsync(result).toBeResolvedTo({ status: true });
  });
});
