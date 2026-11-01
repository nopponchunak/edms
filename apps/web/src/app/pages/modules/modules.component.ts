import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MODULE_CATALOG } from '../../core/module-catalog';
import { EdmsModule } from '../../core/module.model';
import { AuthService } from '../../auth/auth.service';

type SortKey = 'name' | 'category' | 'status';

@Component({
  selector: 'app-modules',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './modules.component.html',
  styleUrl: './modules.component.scss',
})
export class ModulesComponent {
  private readonly auth = inject(AuthService);
  private readonly visibleModules = MODULE_CATALOG.filter((item) => this.auth.canViewModule(item.permissionPrefix));
  readonly search = signal('');
  readonly category = signal('');
  readonly status = signal('');
  readonly sortKey = signal<SortKey>('name');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');
  readonly categories = [...new Set(this.visibleModules.map((item) => item.category))].sort();

  readonly rows = computed(() => {
    const query = this.search().trim().toLowerCase();
    const category = this.category();
    const status = this.status();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    return this.visibleModules.filter((item) => !query || [item.name, item.code, item.description].some((value) => value.toLowerCase().includes(query)))
      .filter((item) => !category || item.category === category)
      .filter((item) => !status || item.status === status)
      .sort((left, right) => left[this.sortKey()].localeCompare(right[this.sortKey()]) * direction);
  });

  constructor(route: ActivatedRoute) {
    route.queryParamMap.subscribe((params) => {
      this.category.set(params.get('category') ?? '');
      this.search.set(params.get('q') ?? '');
    });
  }

  sortBy(key: SortKey): void {
    if (this.sortKey() === key) this.sortDirection.update((value) => (value === 'asc' ? 'desc' : 'asc'));
    else { this.sortKey.set(key); this.sortDirection.set('asc'); }
  }

  sortSymbol(key: SortKey): string {
    return this.sortKey() === key ? (this.sortDirection() === 'asc' ? '↑' : '↓') : '↕';
  }

  statusLabel(module: EdmsModule): string {
    return module.status === 'available' ? 'Available' : module.status === 'migration' ? 'In migration' : 'Planned';
  }
}
