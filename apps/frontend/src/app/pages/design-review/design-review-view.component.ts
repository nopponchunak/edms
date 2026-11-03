import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, firstValueFrom } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { ReassignApproverComponent } from '../../shared/reassign-approver/reassign-approver.component';
import { ApprovalHistoryComponent, HistoryEvent } from '../../shared/approval-history/approval-history.component';
import { ApprovalsService } from '../../shared/approvals/approvals.service';
import { DirectoryService } from '../../shared/directory/directory.service';
import { AttachmentInfo, UploadService } from '../../shared/upload/upload.service';
import { PdfPreviewDialogComponent } from '../../shared/pdf-preview/pdf-preview-dialog.component';
import { DesignReview, DesignReviewConfig, DesignReviewService, DesignReviewEvent } from './design-review.service';
import { currentDrStep, isDrTurnOf, DR_STEPS } from './design-review-steps';

@Component({
  selector: 'app-design-review-view',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ApprovalHistoryComponent, PdfPreviewDialogComponent, ReassignApproverComponent],
  templateUrl: './design-review-view.component.html',
  styleUrl: './design-review-view.component.scss',
})
export class DesignReviewViewComponent implements OnInit, OnDestroy {
  private readonly service = inject(DesignReviewService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly directory = inject(DirectoryService);
  private readonly approvals = inject(ApprovalsService);
  private readonly uploads = inject(UploadService);

  readonly canCreate = this.auth.hasPermission('design-review.create');
  readonly record = signal<DesignReview | null>(null);
  readonly names = signal<Record<string, string>>({});
  private readonly config = signal<DesignReviewConfig | null>(null);

  /** The checklist with its question texts (the record only stores the answers). */
  readonly checklistRows = computed(() => {
    const r = this.record();
    const questions = this.config()?.forms[r?.formType ?? 'mtdd01']?.checklist ?? [];
    return (r?.checklist ?? []).map((c) => ({ ...c, question: questions.find((q) => q.id === c.id)?.question ?? '' }));
  });

  documentsText(r: DesignReview): string {
    const list = r.documentTypes.map((d) => (d === 'Other' && r.documentTypesOther ? `Other: ${r.documentTypesOther}` : d));
    return list.length ? list.join(', ') : '—';
  }
  readonly loading = signal(true);
  readonly error = signal('');
  readonly deleting = signal(false);
  readonly acting = signal(false);
  readonly actionError = signal('');
  readonly events = signal<DesignReviewEvent[]>([]);
  /** The decision dialog (comment + Approve / Reject / Cancel) is open while this is true. */
  readonly deciding = signal(false);
  readonly comment = signal('');
  /** The revision and comment history is collapsed until opened. */
  readonly historyOpen = signal(false);

  /** Administrators can hand a waiting step to someone else (e.g. the person has left). */
  readonly isAdmin = this.auth.isAdministrator();
  readonly waitingStep = computed(() => {
    const r = this.record();
    return r ? currentDrStep(r) : null;
  });
  readonly waitingPerson = computed(() => {
    const r = this.record();
    const step = this.waitingStep();
    return r && step ? (r[step.by] as string) : '';
  });

  onReassigned(record: unknown): void {
    const r = record as DesignReview;
    this.record.set(r);
    this.loadNames(r);
    this.loadEvents(r.id);
    this.approvals.refresh();
  }

    readonly pdfError = signal('');
  readonly pdf = signal<{ url: string; title: string; filename: string; image?: boolean } | null>(null);

  readonly statuses: Record<string, string> = { draft: 'Draft', submitted: 'Submitted', verified: 'Verified', approved: 'Approved', rejected: 'Rejected' };

  // Matches the API rule: only the creator, the requester or an administrator may edit or delete.
  readonly isOwner = computed(() => {
    const record = this.record();
    const me = this.auth.currentUser();
    return !!record && !!me && (this.auth.isAdministrator() || record.createBy === me.username || record.preparedBy === me.displayName);
  });
  readonly canEdit = computed(() => this.canCreate && this.isOwner() && ['draft', 'rejected'].includes(this.record()?.status ?? ''));
  readonly canDelete = computed(() => this.canCreate && this.isOwner() && this.record()?.status === 'draft');

  /** The step waiting on the signed-in user, if it is their turn. */
  readonly myStep = computed(() => {
    const r = this.record();
    return r && isDrTurnOf(r, this.auth.currentUser()?.username) ? currentDrStep(r) : null;
  });

  readonly history = computed<HistoryEvent[]>(() => {
    const r = this.record();
    if (!r) return [];
    const events: HistoryEvent[] = [{ title: 'Prepared by', username: r.createBy, date: r.createdAt, tone: 'done' }];
    for (const s of DR_STEPS) {
      const by = r[s.by] as string | null;
      if (!by) continue;
      const status = r[s.status] as string | null;
      const date = r[s.date] as string | null;
      if (status === 'approved') events.push({ title: s.done, username: by, date, tone: 'done' });
      else if (status === 'rejected') events.push({ title: s.verb === 'Approve' ? 'Rejected by' : `${s.verb} rejected by`, username: by, date, tone: 'rejected' });
      else events.push({ title: s.done, username: by, date: null, tone: 'pending' });
    }
    return events;
  });

  closePdf(): void {
    const current = this.pdf();
    if (current) URL.revokeObjectURL(current.url);
    this.pdf.set(null);
  }

  ngOnDestroy(): void { this.closePdf(); }

  ngOnInit(): void {
    this.service.config().subscribe({ next: (c) => this.config.set(c), error: () => undefined });
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.service.get(id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (r) => { this.record.set(r); this.loadNames(r); this.loadEvents(r.id); },
      error: (e: HttpErrorResponse) => this.error.set(e.status === 403 ? 'You do not have access to this record.' : 'Failed to load record.'),
    });
  }

  private loadNames(r: DesignReview): void {
    const usernames = [r.createBy, ...DR_STEPS.map((s) => r[s.by] as string | null)];
    this.directory.resolveNames(usernames, r.signers).subscribe((names) => this.names.set(names));
  }

  nameOf(username: string | null): string {
    return username ? this.names()[username] ?? username : '—';
  }

  openDecision(): void {
    this.comment.set('');
    this.actionError.set('');
    this.deciding.set(true);
  }

  cancelDecision(): void {
    if (this.acting()) return;
    this.deciding.set(false);
  }

  act(action: 'approved' | 'rejected'): void {
    const record = this.record();
    if (!record || !this.myStep() || this.acting()) return;
    if (action === 'rejected' && !this.comment().trim()) {
      this.actionError.set('Please enter a comment explaining why this request is rejected.');
      return;
    }
    this.acting.set(true);
    this.actionError.set('');
    this.service.approve(record.id, action, this.comment()).pipe(finalize(() => this.acting.set(false))).subscribe({
      next: (r) => { this.record.set(r); this.loadNames(r); this.loadEvents(r.id); this.approvals.refresh(); this.deciding.set(false); },
      error: (e: HttpErrorResponse) => {
        const message = e.error?.message;
        this.actionError.set(Array.isArray(message) ? message.join(' ') : message ?? 'Action failed.');
      },
    });
  }

  private loadEvents(id: number): void {
    this.service.events(id).subscribe({ next: (events) => this.events.set(events), error: () => undefined });
  }

  /** Why a rejected request came back: the rejecting person's comment. */
  readonly rejection = computed(() => {
    const r = this.record();
    if (!r || r.status !== 'rejected') return null;
    const step = DR_STEPS.find((s) => r[s.status] === 'rejected');
    return step ? { by: r[step.by] as string, label: step.label, comment: (r[step.comment] as string | null) ?? '' } : null;
  });

  eventTitle(event: DesignReviewEvent): string {
    if (event.action === 'submitted') return 'Submitted';
    if (event.action === 'revised') return 'Revised and resubmitted';
    const step = DR_STEPS.find((s) => s.key === event.step);
    if (event.action === 'rejected') return `Rejected · ${step?.label ?? ''}`;
    return `${step?.past ?? 'Approved'} · ${step?.label ?? ''}`;
  }

  delete(): void {
    const record = this.record();
    if (!record || this.deleting() || !confirm('Delete this draft request?')) return;
    this.deleting.set(true);
    this.service.remove(record.id).pipe(finalize(() => this.deleting.set(false))).subscribe({
      next: () => void this.router.navigate(['/design-review/concept']),
      error: () => this.error.set('Failed to delete.'),
    });
  }

  get attachments(): AttachmentInfo[] {
    return (this.record()?.attachments as AttachmentInfo[] | null) ?? [];
  }

  openAttachment(att: AttachmentInfo, event: Event): void {
    event.preventDefault();
    const failed = () => this.pdfError.set('Unable to open the attachment. Please try again.');
    if (!this.uploads.isPreviewable(att)) {
      this.uploads.download(att).subscribe({ error: failed });
      return;
    }
    this.uploads.blobUrl(att).subscribe({
      next: (url) => {
        this.closePdf();
        this.pdf.set({ url, title: att.originalName, filename: att.originalName, image: att.mimeType.startsWith('image/') });
      },
      error: failed,
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  statusLabel(status: string): string { return this.statuses[status] ?? status; }
}
