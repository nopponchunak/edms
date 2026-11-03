import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, EventEmitter, inject, Input, OnInit, Output, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DirectoryService } from '../directory/directory.service';
import { SearchableSelectComponent, SelectOption } from '../searchable-select/searchable-select.component';

/**
 * Administrators only: hands the step that is still waiting (for example because the person has left) to someone else.
 * The change is recorded in the document's history.
 */
@Component({
  selector: 'app-reassign-approver',
  standalone: true,
  imports: [CommonModule, SearchableSelectComponent],
  template: `
    <div class="card">
      <div class="title">Reassign approver</div>
      <p class="hint">{{ stepLabel }} is waiting for <b>{{ currentName }}</b>. As an administrator you can hand it to someone else.</p>
      <app-searchable-select [options]="options()" [value]="username()" (valueChange)="username.set($event)" placeholder="— Select person —" />
      @if (error()) { <div class="error">{{ error() }}</div> }
      <button type="button" class="btn" [disabled]="busy() || !username() || username() === current" (click)="save()">{{ busy() ? 'Saving…' : 'Reassign' }}</button>
    </div>
  `,
  styles: [`
    .card { display:grid; gap:8px; padding:14px 16px; border:1px solid var(--mh-border); border-radius:12px; background:var(--mh-surface); }
    .title { font-size:13px; font-weight:700; color:var(--mh-ink); }
    .hint { margin:0; font-size:12px; color:var(--mh-muted); }
    .error { padding:8px 10px; border-radius:8px; background:rgba(239,68,68,.1); color:var(--mh-red); font-size:12px; }
    .btn { height:32px; border:1px solid var(--mh-border); border-radius:8px; background:transparent; color:var(--mh-ink); font-size:12.5px; font-weight:600; cursor:pointer; }
    .btn:disabled { opacity:.5; cursor:default; }
  `],
})
export class ReassignApproverComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly directory = inject(DirectoryService);

  /** API path of the form, e.g. `purchase-requisitions`. */
  @Input({ required: true }) path!: string;
  @Input({ required: true }) id!: number;
  @Input({ required: true }) stepKey!: string;
  @Input({ required: true }) stepLabel!: string;
  @Input({ required: true }) current!: string;
  @Input() currentName = '';
  @Output() reassigned = new EventEmitter<unknown>();

  readonly username = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly users = signal<SelectOption[]>([]);
  readonly options = computed(() => this.users());

  ngOnInit(): void {
    this.directory.listUsers().subscribe({
      next: (res) => this.users.set(res.data.map((u) => ({ value: u.username, label: u.displayName }))),
      error: () => undefined,
    });
  }

  save(): void {
    if (this.busy() || !this.username()) return;
    this.busy.set(true);
    this.error.set('');
    this.http.post(`${environment.apiBaseUrl}/${this.path}/${this.id}/reassign`, { step: this.stepKey, username: this.username() })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (record) => { this.username.set(''); this.reassigned.emit(record); },
        error: (e: HttpErrorResponse) => {
          const message = e.error?.message;
          this.error.set(Array.isArray(message) ? message.join(' ') : message ?? 'Unable to reassign.');
        },
      });
  }
}
