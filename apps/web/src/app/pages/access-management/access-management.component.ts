import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize, forkJoin, Subject, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import {
  AccessManagementService,
  AccessAuditLog,
  AccessPermission,
  AccessRole,
  AccessUser,
  UpdateLocalUserPayload,
} from './access-management.service';

@Component({
  selector: 'app-access-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './access-management.component.html',
  styleUrl: './access-management.component.scss',
})
export class AccessManagementComponent implements OnDestroy {
  private readonly access = inject(AccessManagementService);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  readonly users = signal<AccessUser[]>([]);
  readonly roles = signal<AccessRole[]>([]);
  readonly permissions = signal<AccessPermission[]>([]);
  readonly auditLogs = signal<AccessAuditLog[]>([]);
  readonly totalUsers = signal(0);
  readonly search = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly auditLoading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly selectedUser = signal<AccessUser | null>(null);
  readonly selectedRole = signal<AccessRole | null>(null);
  readonly draftRoleCodes = signal<string[]>([]);
  readonly draftPermissionCodes = signal<string[]>([]);
  readonly isSuperAdmin = this.auth.isSuperAdministrator();
  readonly canViewAudit = this.auth.hasPermission('system.manage');
  readonly canSyncHris = this.auth.hasPermission('users.manage');
  readonly syncingHris = signal(false);
  readonly hrisSyncMessage = signal('');
  readonly hrisSyncError = signal(false);
  readonly selectedUserIsSuperAdmin = computed(() =>
    this.selectedUser()?.roles.includes('super_admin') ?? false,
  );

  readonly showSuggestions = signal(false);
  readonly searchSuggestions = signal<AccessUser[]>([]);
  private readonly searchInput$ = new Subject<string>();

  readonly popoverUserId = signal<number | null>(null);
  readonly editModalUser = signal<AccessUser | null>(null);
  readonly editForm = signal<UpdateLocalUserPayload & { confirmPassword: string }>({ confirmPassword: '' });
  readonly editSaving = signal(false);
  readonly editError = signal('');

  readonly statusOptions: { value: 'active' | 'inactive' | 'pending'; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'pending', label: 'Pending' },
  ];

  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly totalPages = signal(1);
  readonly pageSizeOptions = [10, 25, 50, 100];
  readonly pageStart = computed(() => (this.page() - 1) * this.pageSize() + 1);
  readonly pageEnd = computed(() => Math.min(this.page() * this.pageSize(), this.totalUsers()));

  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const cur = this.page();
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 3) return [1, 2, 3, 4, 5];
    if (cur >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total];
    return [cur - 2, cur - 1, cur, cur + 1, cur + 2];
  });

  readonly sortColumn = signal<keyof Pick<AccessUser, 'username' | 'initial' | 'displayName' | 'email' | 'title' | 'level' | 'department' | 'authProvider'> | 'roles'>('displayName');
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  readonly sortedUsers = computed(() => {
    const col = this.sortColumn();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...this.users()].sort((a, b) => {
      let av: string, bv: string;
      if (col === 'roles') { av = a.roles.join(','); bv = b.roles.join(','); }
      else { av = (a[col] ?? '').toLowerCase(); bv = (b[col] ?? '').toLowerCase(); }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  });

  sortBy(col: 'username' | 'initial' | 'displayName' | 'email' | 'title' | 'level' | 'department' | 'authProvider' | 'roles'): void {
    if (this.sortColumn() === col) { this.sortDir.update((d) => d === 'asc' ? 'desc' : 'asc'); }
    else { this.sortColumn.set(col); this.sortDir.set('asc'); }
  }

  constructor() {
    window.addEventListener('scroll', this.closePopoverOnScroll, true);
    window.addEventListener('resize', this.closePopoverOnScroll);
    this.loadAll();
    this.searchInput$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((q) => q.length >= 1 ? this.access.listUsers(q, 1, 8) : [null]),
    ).subscribe((res) => {
      this.searchSuggestions.set(res ? res.data : []);
    });
  }

  loadAll(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      users: this.access.listUsers(this.search(), this.page(), this.pageSize()),
      roles: this.access.listRoles(),
      permissions: this.access.listPermissions(),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ users, roles, permissions }) => {
          this.users.set(users.data);
          this.totalUsers.set(users.meta.total);
          this.totalPages.set(users.meta.pages);
          this.roles.set(roles.data);
          this.permissions.set(permissions.data);
          this.reselectCurrentItems();
        },
        error: (error: HttpErrorResponse) => this.error.set(this.errorMessage(error)),
      });
    if (this.canViewAudit) this.loadAuditLogs();
  }

  loadAuditLogs(): void {
    if (!this.canViewAudit) return;
    this.auditLoading.set(true);
    this.access.listAuditLogs()
      .pipe(finalize(() => this.auditLoading.set(false)))
      .subscribe({
        next: (response) => this.auditLogs.set(response.data),
        error: (error: HttpErrorResponse) => this.error.set(this.errorMessage(error)),
      });
  }

  onSearchChange(value: string): void {
    this.search.set(value);
    if (!value.trim()) {
      this.searchSuggestions.set([]);
      this.showSuggestions.set(false);
      this.resetSearch();
    } else {
      this.showSuggestions.set(true);
      this.searchInput$.next(value.trim());
    }
  }

  onSearchNative(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) this.resetSearch();
  }

  resetSearch(): void {
    this.search.set('');
    this.showSuggestions.set(false);
    this.page.set(1);
    this.loadUsers();
  }

  selectSuggestion(user: AccessUser): void {
    this.search.set(user.displayName);
    this.showSuggestions.set(false);
    this.page.set(1);
    this.loadUsers();
  }

  searchUsers(): void {
    this.page.set(1);
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set('');
    this.access.listUsers(this.search(), this.page(), this.pageSize())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.users.set(response.data);
          this.totalUsers.set(response.meta.total);
          this.totalPages.set(response.meta.pages);
          this.selectedUser.set(null);
        },
        error: (error: HttpErrorResponse) => this.error.set(this.errorMessage(error)),
      });
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages() || p === this.page()) return;
    this.page.set(p);
    this.loadUsers();
  }

  changePageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.loadUsers();
  }

  /** The role popover is fixed to the viewport so the table's scroll area cannot clip it. */
  readonly popoverPos = signal({ top: 0, right: 0, maxHeight: 480 });

  private readonly closePopoverOnScroll = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (this.popoverUserId() !== null && !target?.closest?.('.role-popover')) this.closePopover();
  };

  togglePopover(user: AccessUser, event: Event): void {
    if (this.popoverUserId() === user.id) {
      this.popoverUserId.set(null);
    } else {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const top = rect.bottom + 6;
      this.popoverPos.set({ top, right: Math.max(8, window.innerWidth - rect.right), maxHeight: Math.max(220, window.innerHeight - top - 12) });
      this.notice.set('');
      this.error.set('');
      this.selectedUser.set(user);
      this.draftRoleCodes.set([...user.roles]);
      this.popoverUserId.set(user.id);
    }
  }

  closePopover(): void { this.popoverUserId.set(null); }

  editUser(user: AccessUser): void {
    this.notice.set('');
    this.error.set('');
    this.selectedUser.set(user);
    this.draftRoleCodes.set([...user.roles]);
  }

  editRole(role: AccessRole): void {
    this.notice.set('');
    this.error.set('');
    this.selectedRole.set(role);
    this.draftPermissionCodes.set([...role.permissions]);
  }

  toggleUserRole(code: string, checked: boolean): void {
    this.draftRoleCodes.update((items) =>
      checked ? [...new Set([...items, code])] : items.filter((item) => item !== code),
    );
  }

  toggleRolePermission(code: string, checked: boolean): void {
    this.draftPermissionCodes.update((items) =>
      checked ? [...new Set([...items, code])] : items.filter((item) => item !== code),
    );
  }

  saveUserRoles(): void {
    const user = this.selectedUser();
    if (!user || this.draftRoleCodes().length === 0 || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    this.access.updateUserRoles(user.id, this.draftRoleCodes())
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: ({ data }) => {
          this.users.update((items) => items.map((item) => item.id === data.id ? data : item));
          this.selectedUser.set(data);
          this.draftRoleCodes.set([...data.roles]);
          this.notice.set(`Roles for ${data.displayName} were updated.`);
          this.popoverUserId.set(null);
          this.loadAuditLogs();
        },
        error: (error: HttpErrorResponse) => this.error.set(this.errorMessage(error)),
      });
  }

  saveRolePermissions(): void {
    const role = this.selectedRole();
    if (!role || role.code === 'super_admin' || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    this.access.updateRolePermissions(role.id, this.draftPermissionCodes())
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: ({ data }) => {
          this.roles.update((items) => items.map((item) => item.id === data.id ? data : item));
          this.selectedRole.set(data);
          this.draftPermissionCodes.set([...data.permissions]);
          this.notice.set(`Permissions for ${data.name} were updated.`);
          this.loadAuditLogs();
        },
        error: (error: HttpErrorResponse) => this.error.set(this.errorMessage(error)),
      });
  }

  openEditModal(user: AccessUser): void {
    this.editModalUser.set(user);
    this.editForm.set({ displayName: user.displayName, email: user.email ?? '', phone: user.phone ?? '', password: '', confirmPassword: '', status: user.status });
    this.editError.set('');
    document.body.style.overflow = 'hidden';
  }

  closeEditModal(): void {
    this.editModalUser.set(null);
    document.body.style.overflow = '';
  }

  patchEditForm(patch: Partial<UpdateLocalUserPayload & { confirmPassword: string }>): void {
    this.editForm.update((f) => ({ ...f, ...patch }));
  }

  saveLocalUser(): void {
    const user = this.editModalUser();
    if (!user || this.editSaving()) return;
    const form = this.editForm();
    if (form.password && form.password !== form.confirmPassword) {
      this.editError.set('Passwords do not match.');
      return;
    }
    const payload: UpdateLocalUserPayload = {};
    if (form.displayName !== undefined) payload.displayName = form.displayName;
    if (form.email !== undefined) payload.email = form.email;
    if (form.phone !== undefined) payload.phone = form.phone;
    if (form.status !== undefined) payload.status = form.status;
    if (form.password) payload.password = form.password;

    this.editSaving.set(true);
    this.editError.set('');
    this.access.updateLocalUser(user.id, payload)
      .pipe(finalize(() => this.editSaving.set(false)))
      .subscribe({
        next: ({ data }) => {
          this.users.update((items) => items.map((item) => item.id === data.id ? data : item));
          if (this.selectedUser()?.id === data.id) { this.selectedUser.set(data); }
          this.notice.set(`Profile for ${data.displayName} was updated.`);
          this.editModalUser.set(null);
          this.loadAuditLogs();
        },
        error: (error: HttpErrorResponse) => this.editError.set(this.errorMessage(error)),
      });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    window.removeEventListener('scroll', this.closePopoverOnScroll, true);
    window.removeEventListener('resize', this.closePopoverOnScroll);
    this.searchInput$.complete();
  }

  syncHris(): void {
    if (this.syncingHris()) return;
    this.syncingHris.set(true);
    this.hrisSyncMessage.set('');
    this.hrisSyncError.set(false);
    this.http.post<{ processed: number; created: number; updated: number; skipped: number; usersCreated: number; usersUpdated: number; usersSkipped: number }>(`${environment.apiBaseUrl}/employees/sync-hris`, {})
      .pipe(finalize(() => this.syncingHris.set(false)))
      .subscribe({
        next: (result) => {
          this.hrisSyncMessage.set(`HRIS sync completed: ${result.created} employees created, ${result.updated} updated; ${result.usersCreated} users created, ${result.usersUpdated} updated, ${result.usersSkipped} skipped.`);
          this.loadAll();
        },
        error: (error: HttpErrorResponse) => {
          this.hrisSyncError.set(true);
          this.hrisSyncMessage.set(error.status === 403 ? 'Administrator access is required to sync HRIS.' : 'HRIS sync failed. Please try again or contact the administrator.');
        },
      });
  }

  hasDraftRole(code: string): boolean { return this.draftRoleCodes().includes(code); }
  hasDraftPermission(code: string): boolean { return this.draftPermissionCodes().includes(code); }

  auditActionLabel(action: string): string {
    if (action === 'access.user_roles.updated') return 'User roles updated';
    if (action === 'access.role_permissions.updated') return 'Role permissions updated';
    return action;
  }

  auditChange(log: AccessAuditLog): string {
    const before = Object.values(log.beforeState ?? {}).flat();
    const after = Object.values(log.afterState ?? {}).flat();
    return `${before.length ? before.join(', ') : 'None'} → ${after.length ? after.join(', ') : 'None'}`;
  }

  private reselectCurrentItems(): void {
    const userId = this.selectedUser()?.id;
    const roleId = this.selectedRole()?.id;
    if (userId) {
      const user = this.users().find((item) => item.id === userId) ?? null;
      this.selectedUser.set(user);
      this.draftRoleCodes.set(user ? [...user.roles] : []);
    }
    if (roleId) {
      const role = this.roles().find((item) => item.id === roleId) ?? null;
      this.selectedRole.set(role);
      this.draftPermissionCodes.set(role ? [...role.permissions] : []);
    }
  }

  private errorMessage(error: HttpErrorResponse): string {
    if (error.status === 403) return 'You do not have permission to perform this action.';
    const message = error.error?.message;
    return Array.isArray(message) ? message.join(' ') : message || 'Unable to update access settings.';
  }
}
