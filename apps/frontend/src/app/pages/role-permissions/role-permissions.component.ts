import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { finalize, forkJoin } from 'rxjs';
import {
  AccessManagementService,
  AccessPermission,
  AccessRole,
} from '../access-management/access-management.service';

@Component({
  selector: 'app-role-permissions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './role-permissions.component.html',
  styleUrl: './role-permissions.component.scss',
})
export class RolePermissionsComponent {
  private readonly access = inject(AccessManagementService);

  readonly roles = signal<AccessRole[]>([]);
  readonly permissions = signal<AccessPermission[]>([]);
  readonly selectedRole = signal<AccessRole | null>(null);
  readonly draftPermissionCodes = signal<string[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  constructor() { this.loadAll(); }

  loadAll(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({ roles: this.access.listRoles(), permissions: this.access.listPermissions() })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ roles, permissions }) => {
          this.roles.set(roles.data);
          this.permissions.set(permissions.data);
          const current = this.selectedRole();
          if (current) {
            const updated = roles.data.find((r) => r.id === current.id) ?? null;
            this.selectedRole.set(updated);
            this.draftPermissionCodes.set(updated ? [...updated.permissions] : []);
          }
        },
        error: (error: HttpErrorResponse) => this.error.set(this.errorMessage(error)),
      });
  }

  editRole(role: AccessRole): void {
    this.notice.set('');
    this.error.set('');
    this.selectedRole.set(role);
    this.draftPermissionCodes.set([...role.permissions]);
  }

  toggleRolePermission(code: string, checked: boolean): void {
    this.draftPermissionCodes.update((items) =>
      checked ? [...new Set([...items, code])] : items.filter((item) => item !== code),
    );
  }

  hasDraftPermission(code: string): boolean { return this.draftPermissionCodes().includes(code); }

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
        },
        error: (error: HttpErrorResponse) => this.error.set(this.errorMessage(error)),
      });
  }

  private errorMessage(error: HttpErrorResponse): string {
    if (error.status === 403) return 'You do not have permission to perform this action.';
    const message = error.error?.message;
    return Array.isArray(message) ? message.join(' ') : message || 'Unable to update role permissions.';
  }
}
