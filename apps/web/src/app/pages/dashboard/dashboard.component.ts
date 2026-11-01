import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { MODULE_CATALOG } from '../../core/module-catalog';
import { ApprovalsService } from '../../shared/approvals/approvals.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  readonly approvals = inject(ApprovalsService);
  readonly displayName = this.auth.currentUser()?.displayName ?? this.auth.currentUser()?.username ?? '';
  readonly search = signal('');
  readonly modules = MODULE_CATALOG.filter((item) => this.auth.canViewModule(item.permissionPrefix));
  readonly categories = [...new Set(this.modules.map((item) => item.category))].map((name) => ({
    name,
    count: this.modules.filter((item) => item.category === name).length,
  }));
  readonly filteredModules = computed(() => {
    const query = this.search().trim().toLowerCase();
    if (!query) return this.modules.slice(0, 10);
    return this.modules.filter((item) =>
      [item.name, item.code, item.description, item.category].some((value) => value.toLowerCase().includes(query)),
    );
  });
  readonly stats = computed(() => {
    const waitingRoute = this.approvals.expensesCount() > 0 ? '/general/expenses'
      : this.approvals.allowancesCount() > 0 ? '/general/allowances'
      : this.approvals.charitableCount() > 0 ? '/anti-corruption/charitable-contribution'
      : this.approvals.giftReceivingCount() > 0 ? '/anti-corruption/gift-hospitality-receiving'
      : this.approvals.giftOfferingCount() > 0 ? '/anti-corruption/gift-hospitality-offering'
      : '/general/expenses';
    return [
      { label: 'My actions', value: this.approvals.total(), helper: 'Waiting for a decision', tone: 'blue', marker: 'A', link: waitingRoute, query: this.approvals.total() > 0 ? { waiting: 'me' } : {} },
      { label: 'Pending', value: 0, helper: 'Requests in progress', tone: 'orange', marker: 'P', link: '/modules', query: {} },
      { label: 'Drafts', value: 0, helper: 'Saved, not submitted', tone: 'purple', marker: 'D', link: '/modules', query: {} },
      { label: 'Available apps', value: this.modules.length, helper: 'Based on permission', tone: 'green', marker: 'M', link: '/modules', query: {} },
    ];
  });

}
