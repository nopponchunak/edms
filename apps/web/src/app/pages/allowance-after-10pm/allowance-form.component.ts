import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { DirectoryService, DirectoryUser } from '../../shared/directory/directory.service';
import { SearchableSelectComponent } from '../../shared/searchable-select/searchable-select.component';
import { FileAttachComponent } from '../../shared/file-attach/file-attach.component';
import { AttachmentInfo } from '../../shared/upload/upload.service';
import { AllowanceItem, AllowanceService } from './allowance.service';

interface FormItem {
  workDate: string;
  projectCode: string;
  projectName: string;
  description: string;
  timeFrom: string;
  timeTo: string;
  baht: number | null;
}

@Component({
  selector: 'app-allowance-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SearchableSelectComponent, FileAttachComponent],
  templateUrl: './allowance-form.component.html',
  styleUrl: './allowance-form.component.scss',
})
export class AllowanceFormComponent implements OnInit {
  private readonly service = inject(AllowanceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly directory = inject(DirectoryService);

  readonly isEdit = signal(false);
  readonly editId = signal<number | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly users = signal<DirectoryUser[]>([]);
  readonly userOptions = computed(() => {
    const me = this.authService.currentUser();
    const opts = this.users().map(u => ({ value: u.displayName, label: u.displayName }));
    const extra = [me?.displayName, this.claimantName()]
      .filter((name): name is string => !!name && !opts.some(o => o.value === name))
      .map(name => ({ value: name, label: name }));
    return [...new Map([...extra, ...opts].map(o => [o.value, o])).values()];
  });
  readonly approverOptions = computed(() => {
    const opts = this.users().map(u => ({ value: u.username, label: u.displayName }));
    const extra = [this.verifiedBy(), this.approvedBy()]
      .filter(name => !!name && !opts.some(o => o.value === name))
      .map(name => ({ value: name, label: name }));
    return [...new Map([...extra, ...opts].map(o => [o.value, o])).values()];
  });
  readonly claimantName = signal('');
  readonly discipline = signal('');
  readonly disciplines = ['C&S', 'M&E', 'Admin', 'Other'];
  // Older records hold free text (e.g. "C&S, Admin"); keep that value selectable instead of showing a blank field.
  readonly disciplineOptions = computed(() => {
    const current = this.discipline();
    return current && !this.disciplines.includes(current) ? [...this.disciplines, current] : this.disciplines;
  });
  readonly requestDate = signal(new Date().toISOString().slice(0, 10));
  readonly verifiedBy = signal('');
  readonly approvedBy = signal('');
  readonly attachments = signal<AttachmentInfo[]>([]);
  readonly items = signal<FormItem[]>([this.emptyItem()]);

  readonly total = computed(() =>
    this.items().reduce((sum, i) => sum + (Number(i.baht) || 0), 0),
  );

  ngOnInit() {
    this.loadUsers();
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isEdit.set(true);
      this.editId.set(Number(id));
      this.loadExisting(Number(id));
    } else {
      const me = this.authService.currentUser();
      if (me) this.claimantName.set(me.displayName);
    }
  }

  private loadUsers() {
    this.directory.listUsers().subscribe({
      next: (res) => this.users.set(res.data),
      error: () => undefined,
    });
  }

  private loadExisting(id: number) {
    this.loading.set(true);
    this.service.get(id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (a) => {
        this.claimantName.set(a.claimantName);
        this.discipline.set(a.discipline ?? '');
        this.requestDate.set(a.requestDate);
        this.verifiedBy.set(a.tlBy ?? '');
        this.approvedBy.set(a.diBy ?? '');
        this.attachments.set((a.attachments as AttachmentInfo[] | null) ?? []);
        this.items.set(a.items.map((i) => ({
          workDate: i.workDate,
          projectCode: i.projectCode ?? '',
          projectName: i.projectName ?? '',
          description: i.description ?? '',
          timeFrom: i.timeFrom ?? '',
          timeTo: i.timeTo ?? '',
          baht: Number(i.baht),
        })));
      },
      error: () => this.error.set('Failed to load record.'),
    });
  }

  addItem() {
    this.items.update((items) => [...items, this.emptyItem()]);
  }

  removeItem(idx: number) {
    this.items.update((items) => items.filter((_, i) => i !== idx));
  }

  updateItem(idx: number, field: keyof FormItem, value: string | number | null) {
    this.items.update((items) => items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  save(action: 'draft' | 'submitted') {
    if (this.saving()) return;
    this.error.set('');
    const payload = {
      claimantName: this.claimantName(),
      discipline: this.discipline() || null,
      requestDate: this.requestDate(),
      tlBy: this.verifiedBy() || null,
      diBy: this.approvedBy() || null,
      attachments: this.attachments().length ? this.attachments() : null,
      items: this.items().map((item, idx) => ({
        seq: idx + 1,
        workDate: item.workDate,
        projectCode: item.projectCode || null,
        projectName: item.projectName || null,
        description: item.description || null,
        timeFrom: item.timeFrom || null,
        timeTo: item.timeTo || null,
        baht: Number(item.baht) || 0,
      } as AllowanceItem)),
      action,
    };
    this.saving.set(true);
    const req = this.isEdit() && this.editId()
      ? this.service.update(this.editId()!, payload)
      : this.service.create(payload);
    req.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => void this.router.navigate(['/general/allowances']),
      error: (e) => this.error.set(e?.error?.message || 'Failed to save.'),
    });
  }

  private emptyItem(): FormItem {
    return { workDate: new Date().toISOString().slice(0, 10), projectCode: '', projectName: '', description: '', timeFrom: '', timeTo: '', baht: null };
  }

  formatBaht(val: number): string {
    return val.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
