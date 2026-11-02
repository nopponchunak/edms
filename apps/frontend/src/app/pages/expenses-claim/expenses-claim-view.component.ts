import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { ApprovalsService } from '../../shared/approvals/approvals.service';
import { UploadService } from '../../shared/upload/upload.service';
import { DirectoryService } from '../../shared/directory/directory.service';
import { createLineCounter, createPdfBlob, loadLogoPng } from '../../shared/pdf/pdf-generator';
import { PdfPreviewDialogComponent } from '../../shared/pdf-preview/pdf-preview-dialog.component';
import { buildExpensesClaimPdf } from './expenses-claim-pdf';
import { ApprovalHistoryComponent, HistoryEvent } from '../../shared/approval-history/approval-history.component';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ExpensesClaim, ExpensesClaimService } from './expenses-claim.service';
import { AttachmentInfo } from '../../shared/upload/upload.service';

@Component({
  selector: 'app-expenses-claim-view',
  standalone: true,
  imports: [CommonModule, RouterLink, ApprovalHistoryComponent, PdfPreviewDialogComponent],
  templateUrl: './expenses-claim-view.component.html',
  styleUrl: './expenses-claim-view.component.scss',
})
export class ExpensesClaimViewComponent implements OnInit, OnDestroy {
  private readonly service = inject(ExpensesClaimService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly canCreate = this.auth.hasPermission('expenses-claim.create');
  // Matches the API rule: only the creator, the person it was prepared for, or an administrator may edit or delete.
  readonly isOwner = computed(() => {
    const record = this.record();
    const me = this.auth.currentUser();
    return !!record && !!me && (this.auth.isAdministrator() || record.createBy === me.username || record.claimantName === me.displayName);
  });
  private readonly directory = inject(DirectoryService);
  private readonly approvals = inject(ApprovalsService);
  private readonly uploads = inject(UploadService);

  readonly record = signal<ExpensesClaim | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly deleting = signal(false);

  readonly statuses: Record<string, string> = {
    draft: 'Draft', submitted: 'Submitted',
    verified: 'Verified', approved: 'Approved', rejected: 'Rejected',
  };

  readonly history = computed<HistoryEvent[]>(() => {
    const r = this.record();
    if (!r) return [];
    const step = (title: string, by: string | null, status: string | null, date: string | null): HistoryEvent => {
      if (status === 'approved') return { title, username: by, date, tone: 'done' };
      if (status === 'rejected') return { title, username: by, date, tone: 'rejected' };
      return { title, username: by, date: null, tone: 'pending' };
    };
    return [
      { title: 'Prepared by', username: r.createBy, date: r.createdAt, tone: 'done' },
      step('Verified by', r.verifiedBy, r.verifiedByStatus, r.verifiedByDate),
      step('Approved by', r.approvedBy, r.approvedByStatus, r.approvedByDate),
    ];
  });

  readonly pdfBusy = signal(false);
  readonly pdfError = signal('');
  readonly pdf = signal<{ url: string; title: string; filename: string; image?: boolean } | null>(null);

  async openPdf() {
    const r = this.record();
    if (!r || this.pdfBusy()) return;
    this.pdfBusy.set(true);
    this.pdfError.set('');
    try {
      const [people, logo, lines] = await Promise.all([
        firstValueFrom(this.directory.resolvePeople([r.verifiedBy, r.approvedBy])),
        loadLogoPng(),
        createLineCounter(),
      ]);
      const blob = await createPdfBlob(buildExpensesClaimPdf(r, people, logo, lines));
      this.closePdf();
      this.pdf.set({
        url: URL.createObjectURL(blob),
        title: `Expenses Claim ${r.voucherNo ?? '(Draft)'}`,
        filename: `${r.voucherNo ?? `Expenses-Claim-${r.id}-draft`}.pdf`,
      });
    } catch {
      this.pdfError.set('Unable to generate the PDF. Please try again.');
    } finally {
      this.pdfBusy.set(false);
    }
  }

  closePdf() {
    const current = this.pdf();
    if (current) URL.revokeObjectURL(current.url);
    this.pdf.set(null);
  }

  ngOnDestroy() { this.closePdf(); }

  readonly acting = signal(false);
  readonly actionError = signal('');
  readonly actionStage = computed<'verify' | 'approve' | null>(() => {
    const r = this.record();
    const me = this.auth.currentUser()?.username;
    if (!r || !me) return null;
    if (r.status === 'submitted' && r.verifiedBy === me && r.verifiedByStatus === 'pending') return 'verify';
    const approverTurn = r.status === 'verified' || (r.status === 'submitted' && !r.verifiedBy);
    if (approverTurn && r.approvedBy === me && r.approvedByStatus === 'pending') return 'approve';
    return null;
  });

  act(action: 'approved' | 'rejected') {
    const rec = this.record();
    const stage = this.actionStage();
    if (!rec || !stage || this.acting()) return;
    const verb = action === 'rejected' ? 'Reject' : stage === 'verify' ? 'Verify' : 'Approve';
    if (!confirm(`${verb} this expenses claim?`)) return;
    this.acting.set(true);
    this.actionError.set('');
    this.service.approve(rec.id, action).pipe(finalize(() => this.acting.set(false))).subscribe({
      next: (r) => { this.record.set(r); this.approvals.refresh(); },
      error: (e: HttpErrorResponse) => this.actionError.set(e.error?.message ?? 'Action failed.'),
    });
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.service.get(id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (r) => this.record.set(r),
      error: (e: HttpErrorResponse) => this.error.set(e.status === 403 ? 'You do not have access to this record.' : 'Failed to load claim.'),
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

  formatBaht(val: string | number): string {
    return Number(val).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  statusLabel(status: string): string {
    return this.statuses[status] ?? status;
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  fileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return '🖼';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    return '📎';
  }

  delete() {
    const rec = this.record();
    if (!rec || this.deleting()) return;
    if (!confirm('Delete this draft claim?')) return;
    this.deleting.set(true);
    this.service.remove(rec.id).pipe(finalize(() => this.deleting.set(false))).subscribe({
      next: () => void this.router.navigate(['/general/expenses']),
      error: () => this.error.set('Failed to delete.'),
    });
  }
}
