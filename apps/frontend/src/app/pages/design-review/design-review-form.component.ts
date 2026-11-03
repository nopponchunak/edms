import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { DirectoryService, DirectoryUser } from '../../shared/directory/directory.service';
import { FileAttachComponent } from '../../shared/file-attach/file-attach.component';
import { Project, ProjectsService } from '../../shared/projects/projects.service';
import { SearchableSelectComponent, SelectOption } from '../../shared/searchable-select/searchable-select.component';
import { AttachmentInfo } from '../../shared/upload/upload.service';
import { ChecklistValue, DesignReviewConfig, DesignReviewService, SaveDesignReviewPayload } from './design-review.service';
import { DR_STEPS } from './design-review-steps';

const FORM_TYPE = 'mtdd01';

@Component({
  selector: 'app-design-review-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SearchableSelectComponent, FileAttachComponent],
  templateUrl: './design-review-form.component.html',
  styleUrl: './design-review-form.component.scss',
})
export class DesignReviewFormComponent implements OnInit {
  private readonly service = inject(DesignReviewService);
  private readonly projectsService = inject(ProjectsService);
  private readonly directory = inject(DirectoryService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isEdit = signal(false);
  readonly editId = signal<number | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errors = signal<string[]>([]);
  /** Set when editing a rejected review: who rejected it and why. */
  readonly rejection = signal<{ by: string; label: string; comment: string } | null>(null);

  readonly config = signal<DesignReviewConfig | null>(null);
  readonly projects = signal<Project[]>([]);
  readonly users = signal<DirectoryUser[]>([]);

  // form values
  readonly projectId = signal<number | null>(null);
  readonly preparedBy = signal('');
  readonly discipline = signal('');
  readonly disciplineOther = signal('');
  readonly stage = signal('');
  readonly documentTypes = signal<string[]>([]);
  readonly documentTypesOther = signal('');
  readonly documentLocation = signal('');
  readonly answers = signal<Record<string, ChecklistValue | null>>({});
  readonly comments = signal('');
  readonly recommendedActions = signal('');
  readonly actionsTaken = signal<boolean | null>(null);
  readonly actionNote = signal('');
  readonly reviewBy = signal('');
  readonly respondBy = signal('');
  readonly tlBy = signal('');
  readonly tl2By = signal('');
  readonly ackBy = signal('');
  readonly attachments = signal<AttachmentInfo[]>([]);

  readonly form = computed(() => this.config()?.forms[FORM_TYPE] ?? null);
  readonly project = computed(() => this.projects().find((p) => p.id === this.projectId()) ?? null);
  readonly projectOptions = computed<SelectOption[]>(() => {
    const options = this.projects().map((p) => ({ value: String(p.id), label: p.label }));
    const current = this.projectId();
    return current !== null && !options.some((o) => o.value === String(current))
      ? [{ value: String(current), label: `Project #${current}` }, ...options]
      : options;
  });
  readonly disciplineOptions = computed(() => this.config()?.disciplines ?? []);
  readonly userOptions = computed<SelectOption[]>(() => {
    const options = this.users().map((u) => ({ value: u.displayName, label: u.displayName }));
    const extra = [this.auth.currentUser()?.displayName, this.preparedBy()]
      .filter((name): name is string => !!name && !options.some((o) => o.value === name))
      .map((name) => ({ value: name, label: name }));
    return [...new Map([...extra, ...options].map((o) => [o.value, o])).values()];
  });
  /** Sign-offs can be picked from every active user for now; committees / roles come later. */
  readonly signerOptions = computed<SelectOption[]>(() => this.users().map((u) => ({ value: u.username, label: u.displayName })));
  private signerWith(current: string): SelectOption[] {
    const options = this.signerOptions();
    return current && !options.some((o) => o.value === current) ? [...options, { value: current, label: current }] : options;
  }
  readonly reviewOptions = computed(() => this.signerWith(this.reviewBy()));
  readonly respondOptions = computed(() => this.signerWith(this.respondBy()));
  readonly tlOptions = computed(() => this.signerWith(this.tlBy()));
  readonly tl2Options = computed(() => this.signerWith(this.tl2By()));
  readonly ackOptions = computed(() => this.signerWith(this.ackBy()));

  ngOnInit(): void {
    this.service.config().subscribe({
      next: (c) => this.config.set(c),
      error: () => this.errors.set(['Unable to load the form configuration.']),
    });
    this.projectsService.dropdown().subscribe({ next: (rows) => this.projects.set(rows), error: () => undefined });
    this.directory.listUsers().subscribe({ next: (res) => this.users.set(res.data), error: () => undefined });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.editId.set(Number(id));
      this.loadExisting(Number(id));
    } else {
      const me = this.auth.currentUser();
      if (me) this.preparedBy.set(me.displayName);
    }
  }

  private loadExisting(id: number): void {
    this.loading.set(true);
    this.service.get(id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (r) => {
        this.projectId.set(r.projectId);
        this.preparedBy.set(r.preparedBy);
        this.discipline.set(r.discipline ?? '');
        this.disciplineOther.set(r.disciplineOther ?? '');
        this.stage.set(r.stage ?? '');
        this.documentTypes.set(r.documentTypes);
        this.documentTypesOther.set(r.documentTypesOther ?? '');
        this.documentLocation.set(r.documentLocation ?? '');
        this.answers.set(Object.fromEntries(r.checklist.map((c) => [c.id, c.answer])));
        this.comments.set(r.comments ?? '');
        this.recommendedActions.set(r.recommendedActions ?? '');
        this.actionsTaken.set(r.actionsTaken);
        this.actionNote.set(r.actionNote ?? '');
        this.reviewBy.set(r.reviewBy ?? '');
        this.respondBy.set(r.respondBy ?? '');
        this.tlBy.set(r.tlBy ?? '');
        this.tl2By.set(r.tl2By ?? '');
        this.ackBy.set(r.ackBy ?? '');
        const rejectedStep = DR_STEPS.find((s) => r[s.status] === 'rejected');
        this.rejection.set(r.status === 'rejected' && rejectedStep
          ? { by: r[rejectedStep.by] as string, label: rejectedStep.label, comment: (r[rejectedStep.comment] as string | null) ?? '' }
          : null);
        this.attachments.set((r.attachments as AttachmentInfo[] | null) ?? []);
      },
      error: (e: HttpErrorResponse) => this.errors.set([e.status === 403 ? 'You do not have access to this record.' : 'Failed to load record.']),
    });
  }

  onProjectChange(value: string): void { this.projectId.set(value ? Number(value) : null); }

  toggleDocument(type: string, checked: boolean): void {
    this.documentTypes.update((list) => (checked ? [...new Set([...list, type])] : list.filter((d) => d !== type)));
  }

  answer(id: string, value: ChecklistValue): void { this.answers.update((a) => ({ ...a, [id]: value })); }

  save(action: 'draft' | 'submitted'): void {
    if (this.saving()) return;
    this.errors.set([]);
    const text = (value: string) => value.trim() || null;
    const payload: SaveDesignReviewPayload = {
      formType: FORM_TYPE,
      projectId: this.projectId(),
      preparedBy: this.preparedBy(),
      discipline: this.discipline() || null,
      disciplineOther: text(this.disciplineOther()),
      stage: text(this.stage()),
      documentTypes: this.documentTypes(),
      documentTypesOther: text(this.documentTypesOther()),
      documentLocation: text(this.documentLocation()),
      checklist: (this.form()?.checklist ?? []).map((item) => ({ id: item.id, answer: this.answers()[item.id] ?? null })),
      comments: text(this.comments()),
      recommendedActions: text(this.recommendedActions()),
      actionsTaken: this.actionsTaken(),
      actionNote: text(this.actionNote()),
      reviewBy: this.reviewBy() || null,
      respondBy: this.respondBy() || null,
      tlBy: this.tlBy() || null,
      tl2By: this.tl2By() || null,
      ackBy: this.ackBy() || null,
      attachments: this.attachments().length ? this.attachments() : null,
      action,
    };
    this.saving.set(true);
    const request = this.isEdit() && this.editId() ? this.service.update(this.editId()!, payload) : this.service.create(payload);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => void this.router.navigate(['/design-review/concept']),
      error: (e: HttpErrorResponse) => {
        const message = e.error?.message;
        this.errors.set(Array.isArray(message) ? message : [message ?? 'Failed to save.']);
      },
    });
  }
}
