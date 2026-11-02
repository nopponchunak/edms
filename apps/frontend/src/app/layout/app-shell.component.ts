import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, interval } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { MODULE_CATALOG } from '../core/module-catalog';
import { ApprovalsService } from '../shared/approvals/approvals.service';

@Component({ selector: 'app-shell', standalone: true, imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet], templateUrl: './app-shell.component.html', styleUrl: './app-shell.component.scss' })
export class AppShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly approvals = inject(ApprovalsService);
  readonly sidebarCollapsed = signal(localStorage.getItem('hd_sidebar_collapsed') === 'true');
  readonly mobileOpen = signal(false);
  readonly isDark = signal(localStorage.getItem('hd_theme') !== 'light');
  readonly userMenuOpen = signal(false);
  readonly notificationsOpen = signal(false);
  readonly search = signal('');
  private readonly visibleModules = MODULE_CATALOG.filter((item) => this.auth.canViewModule(item.permissionPrefix));
  readonly moduleCount = this.visibleModules.length;
  readonly canManageAccess = this.auth.canManageAccess();
  readonly canViewExpenses = this.auth.hasPermission('expenses-claim.view');
  readonly canViewAllowances = this.auth.hasPermission('allowance-after-10pm.view');
  readonly canManageCommittees = this.auth.hasPermission('committees.manage');
  readonly administrationOpen = signal(true);
  readonly masterDataOpen = signal(true);
  readonly generalOpen = signal(true);
  readonly antiCorruptionOpen = signal(true);
  readonly antiCorruptionForms = [
    { path: '/anti-corruption/charitable-contribution', code: '1-ACCC-01', title: 'Charitable Contribution Requests', icon: 'heart', permission: 'charitable-contribution.view', waiting: () => this.approvals.charitableCount() },
    { path: '/anti-corruption/gift-hospitality-offering', code: '4-ACGH-02', title: 'Gift/Hospitality Offering Requests', icon: 'gift', permission: 'gift-hospitality-offering.view', waiting: () => this.approvals.giftOfferingCount() },
    { path: '/anti-corruption/gift-hospitality-receiving', code: '4-ACGH-01', title: 'Gift/Hospitality Receiving Requests', icon: 'gift', permission: 'gift-hospitality-receiving.view', waiting: () => this.approvals.giftReceivingCount() },
  ].filter((form) => this.auth.hasPermission(form.permission));
  readonly procurementOpen = signal(true);
  readonly procurementForms = [
    { path: '/procurement/requisitions', code: 'MTPC-02', title: 'Purchase Requisitions', permission: 'purchase-requisition.view', waiting: () => this.approvals.purchaseRequisitionCount() },
  ].filter((form) => this.auth.hasPermission(form.permission));
  readonly displayName = this.auth.currentUser()?.displayName ?? this.auth.currentUser()?.username ?? '';
  readonly initials = this.displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
  readonly roleLabel = this.auth.isAdministrator() ? 'Administrator' : 'Employee';
  readonly categories = [...new Set(this.visibleModules.map((item) => item.category))].map((name) => ({ name, count: this.visibleModules.filter((item) => item.category === name).length }));

  constructor() {
    this.applyTheme(this.isDark());
    this.approvals.refresh();
    interval(60_000).pipe(takeUntilDestroyed()).subscribe(() => this.approvals.refresh());
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.approvals.refresh());
  }

  toggleSidebar(): void {
    if (window.matchMedia('(max-width: 768px)').matches) { this.mobileOpen.update((value) => !value); return; }
    this.sidebarCollapsed.update((value) => !value);
    localStorage.setItem('hd_sidebar_collapsed', String(this.sidebarCollapsed()));
  }
  closeMobileMenu(): void { this.mobileOpen.set(false); }
  toggleTheme(): void { this.isDark.update((value) => !value); this.applyTheme(this.isDark()); localStorage.setItem('hd_theme', this.isDark() ? 'dark' : 'light'); }
  openSearch(): void { const query = this.search().trim(); void this.router.navigate(['/modules'], { queryParams: query ? { q: query } : {} }); }
  signOut(): void { this.approvals.clear(); this.auth.logout(); void this.router.navigateByUrl('/login'); }
  private applyTheme(dark: boolean): void { if (dark) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', 'light'); }
}
