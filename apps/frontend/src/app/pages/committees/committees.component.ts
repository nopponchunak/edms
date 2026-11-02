import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { Committee, CommitteeService, EmployeeOption } from '../../shared/committee/committee.service';

@Component({
  selector: 'app-committees',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './committees.component.html',
  styleUrl: './committees.component.scss',
})
export class CommitteesComponent implements OnInit {
  private readonly service = inject(CommitteeService);

  readonly committees = signal<Committee[]>([]);
  readonly selected = signal<Committee | null>(null);
  readonly members = signal<EmployeeOption[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  readonly editing = signal<{ id: number | null; name: string; description: string } | null>(null);

  readonly candidates = signal<EmployeeOption[]>([]);
  readonly searching = signal(false);
  search = '';
  private readonly search$ = new Subject<string>();
  private readonly memberIds = computed(() => new Set(this.members().map((m) => m.id)));

  ngOnInit(): void {
    this.load();
    this.search$.pipe(debounceTime(250), distinctUntilChanged(), switchMap((q) => {
      this.searching.set(true);
      return this.service.searchEmployees(q);
    })).subscribe({
      next: (rows) => { this.candidates.set(rows); this.searching.set(false); },
      error: () => { this.searching.set(false); this.fail('Unable to search employees.'); },
    });
  }

  load(selectId?: number): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (rows) => {
        this.committees.set(rows);
        this.loading.set(false);
        const keep = rows.find((c) => c.id === (selectId ?? this.selected()?.id));
        if (keep) this.select(keep, !selectId);
        else if (!rows.some((c) => c.id === this.selected()?.id)) { this.selected.set(null); this.members.set([]); }
      },
      error: (e: HttpErrorResponse) => { this.loading.set(false); this.fail(this.message(e, 'Unable to load committees.')); },
    });
  }

  select(committee: Committee, keepMembers = false): void {
    this.selected.set(committee);
    this.search = '';
    this.candidates.set([]);
    this.notice.set('');
    if (keepMembers && this.dirty()) return;
    this.dirty.set(false);
    this.service.members(committee.id).subscribe({
      next: (rows) => this.members.set(rows),
      error: (e: HttpErrorResponse) => this.fail(this.message(e, 'Unable to load members.')),
    });
  }

  onSearch(value: string): void {
    this.search = value;
    this.search$.next(value.trim());
  }

  isMember(employee: EmployeeOption): boolean {
    return this.memberIds().has(employee.id);
  }

  add(employee: EmployeeOption): void {
    if (this.isMember(employee)) return;
    this.members.update((rows) => [...rows, employee].sort((a, b) => a.label.localeCompare(b.label)));
    this.dirty.set(true);
  }

  remove(employee: EmployeeOption): void {
    this.members.update((rows) => rows.filter((m) => m.id !== employee.id));
    this.dirty.set(true);
  }

  saveMembers(): void {
    const committee = this.selected();
    if (!committee || this.saving()) return;
    this.saving.set(true);
    this.service.setMembers(committee.id, this.members().map((m) => m.id)).subscribe({
      next: (rows) => {
        this.members.set(rows);
        this.dirty.set(false);
        this.saving.set(false);
        this.error.set('');
        this.notice.set('Members saved.');
        this.committees.update((list) => list.map((c) => c.id === committee.id ? { ...c, memberCount: rows.length } : c));
      },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.fail(this.message(e, 'Unable to save members.')); },
    });
  }

  startNew(): void { this.editing.set({ id: null, name: '', description: '' }); }
  startEdit(c: Committee): void { this.editing.set({ id: c.id, name: c.name, description: c.description ?? '' }); }
  cancelEdit(): void { this.editing.set(null); }

  saveCommittee(): void {
    const form = this.editing();
    if (!form || !form.name.trim() || this.saving()) return;
    this.saving.set(true);
    const request = form.id === null ? this.service.create(form.name, form.description) : this.service.update(form.id, form.name, form.description);
    request.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.editing.set(null);
        this.error.set('');
        this.notice.set(form.id === null ? 'Committee created.' : 'Committee updated.');
        this.load(form.id ?? (res as Committee).id);
      },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.fail(this.message(e, 'Unable to save the committee.')); },
    });
  }

  deleteCommittee(c: Committee): void {
    if (!confirm(`Delete committee "${c.name}"? Its member list will be removed.`)) return;
    this.service.remove(c.id).subscribe({
      next: () => { this.notice.set('Committee deleted.'); if (this.selected()?.id === c.id) { this.selected.set(null); this.members.set([]); } this.load(); },
      error: (e: HttpErrorResponse) => this.fail(this.message(e, 'Unable to delete the committee.')),
    });
  }

  private fail(message: string): void { this.notice.set(''); this.error.set(message); }
  private message(e: HttpErrorResponse, fallback: string): string {
    const text = e.error?.message;
    return Array.isArray(text) ? text.join(' ') : text ?? fallback;
  }
}
