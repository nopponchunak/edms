import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, interval, Subscription } from 'rxjs';
import { Project, ProjectSyncState, ProjectsService, SyncMode } from '../../shared/projects/projects.service';

/** Master Data > Projects: the list the review forms pick their project from (later this can be imported from another system). */
@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
})
export class ProjectsComponent implements OnInit, OnDestroy {
  private readonly service = inject(ProjectsService);

  readonly projects = signal<Project[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly saving = signal(false);

  /** null = the dialog is closed; id 0 = a new project. */
  readonly editing = signal<{ id: number; projectNo: string; name: string; status: 'active' | 'inactive'; fromPmts: boolean } | null>(null);

  /** Thousands of projects can come from PMTS, so the table shows the first matches; search to narrow down. */
  readonly rowLimit = 200;
  readonly matches = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.projects().filter((p) => !q || p.projectNo.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  });
  readonly filtered = computed(() => this.matches().slice(0, this.rowLimit));

  // PMTS sync (runs on the server in the background; this page only starts it and shows its progress)
  readonly sync = signal<ProjectSyncState | null>(null);
  readonly syncMenu = signal(false);
  readonly syncError = signal('');
  readonly percent = computed(() => {
    const s = this.sync();
    return s && s.total > 0 ? Math.min(100, Math.round((s.fetched / s.total) * 100)) : 0;
  });
  private poll: Subscription | null = null;

  ngOnInit(): void {
    this.load();
    this.refreshSync();
  }

  ngOnDestroy(): void { this.stopPolling(); }

  refreshSync(): void {
    this.service.syncState().subscribe({
      next: (state) => { this.sync.set(state); if (state.status === 'running') this.startPolling(); },
      error: () => undefined,
    });
  }

  startSync(mode: SyncMode): void {
    this.syncMenu.set(false);
    this.syncError.set('');
    if (mode === 'full' && !confirm('Copy every project from PMTS again? This can take several minutes. It runs in the background.')) return;
    this.service.startSync(mode).subscribe({
      next: (state) => { this.sync.set(state); this.startPolling(); },
      error: (err: HttpErrorResponse) => {
        const message = err.error?.message;
        this.syncError.set(Array.isArray(message) ? message.join(' ') : message ?? 'Unable to start the sync.');
      },
    });
  }

  private startPolling(): void {
    if (this.poll) return;
    this.poll = interval(3000).subscribe(() => {
      this.service.syncState().subscribe({
        next: (state) => {
          this.sync.set(state);
          if (state.status !== 'running') { this.stopPolling(); this.load(); }
        },
        error: () => undefined,
      });
    });
  }

  private stopPolling(): void { this.poll?.unsubscribe(); this.poll = null; }

  externalLabel(p: Project): string { return p.source === 'pmts' ? (p.externalStatus ?? 'PMTS') : '—'; }

  load(): void {
    this.loading.set(true);
    this.service.list().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (rows) => this.projects.set(rows),
      error: () => this.error.set('Failed to load projects.'),
    });
  }

  add(): void { this.error.set(''); this.editing.set({ id: 0, projectNo: '', name: '', status: 'active', fromPmts: false }); }
  edit(p: Project): void { this.error.set(''); this.editing.set({ id: p.id, projectNo: p.projectNo, name: p.name, status: p.status, fromPmts: p.source === 'pmts' }); }
  close(): void { if (!this.saving()) this.editing.set(null); }

  patch(patch: Partial<{ projectNo: string; name: string; status: 'active' | 'inactive' }>): void {
    this.editing.update((e) => (e ? { ...e, ...patch } : e));
  }

  save(): void {
    const e = this.editing();
    if (!e || this.saving()) return;
    if (!e.projectNo.trim() || !e.name.trim()) { this.error.set('Project number and name are required.'); return; }
    this.saving.set(true);
    this.error.set('');
    const request = e.id ? this.service.update(e.id, e.projectNo.trim(), e.name.trim(), e.status) : this.service.create(e.projectNo.trim(), e.name.trim());
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => { this.editing.set(null); this.load(); },
      error: (err: HttpErrorResponse) => {
        const message = err.error?.message;
        this.error.set(Array.isArray(message) ? message.join(' ') : message ?? 'Failed to save.');
      },
    });
  }
}
