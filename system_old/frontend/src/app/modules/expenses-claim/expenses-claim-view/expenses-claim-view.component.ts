import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, firstValueFrom, forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { ApiService } from 'app/core/services/api.service';
import { AuthenticatedPdfService } from 'app/core/services/authenticated-pdf.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { SignatureSetting, SignatureSettingService } from 'app/core/services/signature-setting.service';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { isApproved, isRejected } from 'app/core/utils/action-request-filter.util';
import { AttachmentDisplayItem, getAttachmentDisplayItems } from 'app/core/utils/attachment-url.util';
import { formatProjectDisplay } from 'app/core/utils/project-display.util';
import {
  escapeSignatureHtml,
  formatPoSignatureId,
  getSignatureLookupRefsFromValues,
  getSignaturePrintHtml,
} from 'app/core/utils/signature-print.util';
import {
  EXPENSES_CLAIM_PRINT_MAX_ROW_WEIGHT,
  ExpensesClaimPrintPage,
  buildExpensesClaimPrintPages,
} from './expenses-claim-print.util';

type PrintableAttachmentItem = AttachmentDisplayItem & {
  isImage: boolean;
  isJpeg: boolean;
  isPdf: boolean;
  convertedToPdf: boolean;
  resourceUrl: SafeResourceUrl;
};

@Component({
  selector: 'app-expenses-claim-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    ViewActionsComponent,
  ],
  templateUrl: './expenses-claim-view.component.html',
  styleUrls: ['./expenses-claim-view.component.scss'],
})
export class ExpensesClaimViewComponent implements OnInit, OnDestroy {
  claim: any = null;
  isLoading = false;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();
  activeSignatureSettings = new Map<string, SignatureSetting>();
  printableAttachmentItems: PrintableAttachmentItem[] = [];
  isPrintDocumentMode = false;
  printDocumentReady = false;
  private _unsubscribeAll = new Subject<void>();
  private attachmentPdfObjectUrls: string[] = [];
  private readonly printBodyClass = 'expenses-claim-printing';
  private readonly printBaseRowHeightMm = 7.11;
  private printRowWeights: number[] = [];
  private printFallbackCleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private apiService: ApiService,
    private employeeService: EmployeeService,
    private signatureSettingService: SignatureSettingService,
    private sanitizer: DomSanitizer,
    private changeDetectorRef: ChangeDetectorRef,
    private route: ActivatedRoute,
    public router: Router,
    private authenticatedPdfService: AuthenticatedPdfService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.isPrintDocumentMode =
      this.route.snapshot.data?.['printDocument'] === true ||
      this.route.snapshot.queryParamMap.has('printDocument');

    if (this.isPrintDocumentMode) {
      this.enableExpensesClaimPrintMode();
    } else {
      window.addEventListener('beforeprint', this.enableExpensesClaimPrintMode);
      window.addEventListener('afterprint', this.disableExpensesClaimPrintMode);
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/expenses-claim/list']);
      return;
    }

    if (this.isPrintDocumentMode && this.applyPrintPayloadFromFragment()) {
      return;
    }

    this.loadClaim(id);
  }

  ngOnDestroy(): void {
    this.revokeAttachmentPdfObjectUrls();
    window.removeEventListener('beforeprint', this.enableExpensesClaimPrintMode);
    window.removeEventListener('afterprint', this.disableExpensesClaimPrintMode);
    this.disableExpensesClaimPrintMode();
    this._unsubscribeAll.next();
    this._unsubscribeAll.complete();
  }

  private loadClaim(id: string): void {
    this.isLoading = true;
    forkJoin({
      response: this.apiService.getExpensesClaim(id),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle(),
    })
      .pipe(
        switchMap(({ response, employeeLookup, employeeLookupWithTitle }) => {
          const claim = response?.status && response?.data
            ? this.resolveDisplayClaim(response.data)
            : null;
          const employeeRefs = this.getClaimEmployeeRefs(claim).filter((code) => !!code);

          if (!claim || employeeRefs.length === 0) {
            return of({
              claim,
              employeeLookup,
              employeeLookupWithTitle,
              activeSignatureSettings: new Map<string, SignatureSetting>(),
            });
          }

          return forkJoin({
            employeeLookup: this.employeeService.ensureEmployeesInLookup(employeeLookup, employeeRefs),
            employeeLookupWithTitle: this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, employeeRefs),
          }).pipe(
            switchMap((lookups) => {
              const signatureLookupRefs = getSignatureLookupRefsFromValues(employeeRefs, lookups.employeeLookup);

              return this.signatureSettingService.getActiveMapByCodes(signatureLookupRefs).pipe(
                catchError(() => of(new Map<string, SignatureSetting>())),
                map((activeSignatureSettings) => ({
                  claim,
                  employeeLookup: lookups.employeeLookup,
                  employeeLookupWithTitle: lookups.employeeLookupWithTitle,
                  activeSignatureSettings,
                }))
              );
            })
          );
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe({
        next: ({ claim, employeeLookup, employeeLookupWithTitle, activeSignatureSettings }) => {
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          this.activeSignatureSettings = activeSignatureSettings;
          this.claim = claim;
          this.isLoading = false;

          if (this.claim && this.isPrintDocumentMode) {
            this.printableAttachmentItems = [];
            this.changeDetectorRef.detectChanges();
            this.markPrintDocumentReadyAfterFontsLoaded();
          } else if (this.claim) {
            void this.preparePrintableAttachments();
          }
        },
        error: (error) => {
          console.error('Error loading expenses claim:', error);
          this.isLoading = false;
          this.router.navigate(['/expenses-claim/list']);
        }
      });
  }

  private resolveDisplayClaim(claim: any): any {
    if (String(claim?.status || '').toLowerCase() !== 'draft') {
      return claim;
    }

    const draftPayload = this.extractDraftPayload(claim);

    return {
      ...claim,
      ...draftPayload,
      id: claim.id,
      voucher_no: claim.voucher_no || draftPayload?.voucher_no || '',
      status: claim.status,
      draft_payload: claim.draft_payload,
      created_at: claim.created_at,
      updated_at: claim.updated_at,
      attachments: draftPayload?.attachments ?? claim.attachments ?? [],
      items: Array.isArray(draftPayload?.items)
        ? draftPayload.items
        : Array.isArray(claim.items)
          ? claim.items
          : [],
      total_baht: Number(draftPayload?.total_baht ?? claim.total_baht ?? 0),
    };
  }

  private extractDraftPayload(claim: any): any {
    const payload = claim?.draft_payload;
    if (payload && typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return claim;
      }
    }
    if (payload && typeof payload === 'object') {
      return payload;
    }
    return claim;
  }

  private getClaimEmployeeRefs(claim: any = this.claim): Array<string | number | null | undefined> {
    return [
      claim?.claimant_name,
      claim?.recive_by,
      claim?.verified_by,
      claim?.approved_by,
      claim?.create_by,
      claim?.update_by
    ];
  }

  private applyPrintPayloadFromFragment(): boolean {
    const payload = this.readPrintPayload();
    if (!payload?.document) {
      return false;
    }

    this.employeeLookup = this.objectToStringMap(payload.employeeLookup);
    this.employeeLookupWithTitle = this.objectToStringMap(payload.employeeLookupWithTitle);
    this.activeSignatureSettings = this.signatureSettingsMapFromPayload(payload.activeSignatureSettings);
    this.claim = this.resolveDisplayClaim(payload.document);
    this.printableAttachmentItems = [];
    this.isLoading = false;
    this.changeDetectorRef.detectChanges();
    this.markPrintDocumentReadyAfterFontsLoaded();

    return true;
  }

  private readPrintPayload(): any | null {
    const fragment = this.route.snapshot.fragment || '';
    const encoded = new URLSearchParams(fragment).get('printPayload');
    if (!encoded) {
      return null;
    }

    try {
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      console.warn('Unable to read expenses claim print payload:', error);
      return null;
    }
  }

  private objectToStringMap(value: unknown): Map<string, string> {
    const lookup = new Map<string, string>();
    if (!value || typeof value !== 'object') {
      return lookup;
    }

    Object.entries(value as Record<string, unknown>).forEach(([key, label]) => {
      lookup.set(String(key), String(label ?? ''));
    });

    return lookup;
  }

  private signatureSettingsMapFromPayload(value: unknown): Map<string, SignatureSetting> {
    const lookup = new Map<string, SignatureSetting>();
    const items = Array.isArray(value) ? value as SignatureSetting[] : [];
    items.forEach((item) => {
      [
        item.employee_code,
        item.employee_code?.replace(/-/g, ''),
        item.initial,
        item.employee?.code,
        item.employee?.code?.replace(/-/g, ''),
        item.employee?.initial,
      ].forEach((key) => {
        const normalizedKey = String(key ?? '').trim();
        if (normalizedKey) {
          lookup.set(normalizedKey, item);
          lookup.set(normalizedKey.toUpperCase(), item);
        }
      });
    });

    return lookup;
  }

  onBack(): void {
    this.router.navigate(['/expenses-claim/list']);
  }

  onEdit(): void {
    if (!this.claim?.id) return;
    this.router.navigate(['/expenses-claim/edit', this.claim.id]);
  }

  canEdit(): boolean {
    return ['draft', 'pending'].includes(this.getWorkflowStatus());
  }

  onPrint(): void {
    if (!this.claim?.id) {
      return;
    }

    this.openPdfUrl(this.apiService.getExpensesClaimPrintPdfUrl(this.claim.id));
  }

  onOpenCombinedPdf(): void {
    if (!this.claim?.id) {
      return;
    }

    this.openPdfUrl(this.apiService.getExpensesClaimCombinedPdfUrl(this.claim.id));
  }

  private enableExpensesClaimPrintMode = (): void => {
    document.body.classList.add(this.printBodyClass);
  };

  private disableExpensesClaimPrintMode = (): void => {
    if (this.printFallbackCleanupTimer) {
      clearTimeout(this.printFallbackCleanupTimer);
      this.printFallbackCleanupTimer = null;
    }
    document.body.classList.remove(this.printBodyClass);
  };

  private schedulePrintModeFallbackCleanup(): void {
    if (this.printFallbackCleanupTimer) {
      clearTimeout(this.printFallbackCleanupTimer);
    }
    this.printFallbackCleanupTimer = setTimeout(this.disableExpensesClaimPrintMode, 120000);
  }

  private writePrintWindow(printWindow: Window | null): boolean {
    const printRoot = document.querySelector('.expenses-claim-print-root');
    if (!printWindow || !printRoot) {
      return false;
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join('\n');
    const baseHref = this.escapeAttribute(document.baseURI || window.location.origin + '/');

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <base href="${baseHref}">
    <title>Expenses Claim Print</title>
    ${styles}
    <style>
      @font-face {
        font-family: 'testimonia-font';
        src: url('/fonts/testimonia/Testimonia-3zp8X.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }
      body {
        margin: 0;
        background: #ffffff;
      }
      .screen-view {
        display: none !important;
      }
      .print-only {
        display: block !important;
      }
      @media screen {
        body {
          padding: 12px;
        }
      }
      @media print {
        html,
        body {
          width: auto !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: visible !important;
        }
      }
    </style>
  </head>
  <body class="${this.printBodyClass}">
    ${printRoot.outerHTML}
    <script>
      const fitSignatureLines = () => {
        document.querySelectorAll('.sig-line').forEach((line) => {
          const block = line.querySelector('.signature-print-block');
          const name = block?.querySelector('.signature-name');
          const id = block?.querySelector('.signature-id');
          const width = Math.max(block?.scrollWidth || 0, name?.scrollWidth || 0, id?.scrollWidth || 0);
          if (width) {
            const isApprovedLine = line.closest('.sig-block')?.matches(':last-child');
            const printLineWidth = isApprovedLine ? 194.90625 : 226.765625;
            const availableWidth = Math.max(0, printLineWidth - 4);
            line.style.setProperty('--signature-print-scale', String(Math.min(1, availableWidth / width)));
          }
        });
      };

      const waitForFonts = () => {
        if (!document.fonts || !document.fonts.load) {
          return Promise.resolve();
        }

        return Promise.all([
          document.fonts.load('18px testimonia-font'),
          document.fonts.ready
        ]).then(() => undefined).catch(() => undefined);
      };

      const printWhenReady = () => {
        const waitForEmbeddedPdfs = () => {
          const pdfFrames = Array.from(document.querySelectorAll('.print-attachment-pdf'));
          if (!pdfFrames.length) {
            return Promise.resolve();
          }

          const frameLoads = pdfFrames.map((frame) => new Promise((resolve) => {
            let resolved = false;
            const done = () => {
              if (resolved) return;
              resolved = true;
              resolve(undefined);
            };
            frame.addEventListener('load', done, { once: true });
            setTimeout(done, 2500);
          }));

          return Promise.all(frameLoads).then(() => undefined).catch(() => undefined);
        };

        Promise.all([waitForFonts(), waitForEmbeddedPdfs()]).then(() => {
          fitSignatureLines();
          window.focus();
          window.addEventListener('afterprint', () => {
            setTimeout(() => window.close(), 300);
          }, { once: true });
          setTimeout(() => window.print(), 100);
        });
      };
      if (document.readyState === 'complete') {
        printWhenReady();
      } else {
        window.addEventListener('load', printWhenReady, { once: true });
      }
    </script>
  </body>
</html>`);
    printWindow.document.close();

    return true;
  }

  private openPdfUrl(url: string): boolean {
    return this.authenticatedPdfService.open(url);
  }

  private markPrintDocumentReadyAfterFontsLoaded(): void {
    this.printDocumentReady = false;

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-print-document-ready', 'false');
      document.getElementById('frontend-print-ready')?.setAttribute('data-ready', 'false');
    }

    const setReady = () => {
      this.printDocumentReady = true;

      if (typeof document === 'undefined') {
        return;
      }

      this.changeDetectorRef.detectChanges();
      if (this.updatePrintRowWeightsFromMeasurements()) {
        this.changeDetectorRef.detectChanges();
      }
      let attempts = 0;
      const finalize = () => {
        const lineCount = this.fitSignatureLines();
        if (lineCount === 0 && attempts < 20) {
          attempts += 1;
          setTimeout(() => requestAnimationFrame(finalize), 50);
          return;
        }
        document.documentElement.setAttribute('data-print-document-ready', 'true');
        document.getElementById('frontend-print-ready')?.setAttribute('data-ready', 'true');
      };

      finalize();
    };

    if (typeof document === 'undefined') {
      setReady();
      return;
    }

    setReady();
    this.waitForSignatureFont().then(() => this.fitSignatureLines()).catch(() => undefined);
  }

  private fitSignatureLines(): number {
    const lines = document.querySelectorAll<HTMLElement>('.sig-line');
    let fittedBlocks = 0;
    lines.forEach((line) => {
      const block = line.querySelector<HTMLElement>('.signature-print-block');
      const name = block?.querySelector<HTMLElement>('.signature-name');
      const id = block?.querySelector<HTMLElement>('.signature-id');
      const width = Math.max(block?.scrollWidth ?? 0, name?.scrollWidth ?? 0, id?.scrollWidth ?? 0);
      if (width > 0) {
        const isApprovedLine = line.closest('.sig-block')?.matches(':last-child');
        const printLineWidth = isApprovedLine ? 194.90625 : 226.765625;
        const availableWidth = Math.max(0, printLineWidth - 4);
        line.style.setProperty('--signature-print-scale', String(Math.min(1, availableWidth / width)));
        fittedBlocks += 1;
      }
    });

    const signedRoles = Number(isApproved(this.claim?.verified_by_status)) + Number(isApproved(this.claim?.approved_by_status));
    const expectedBlocks = this.printableExpensesClaimPages.length * signedRoles;
    return expectedBlocks === 0 || fittedBlocks >= expectedBlocks ? lines.length : 0;
  }

  private updatePrintRowWeightsFromMeasurements(): boolean {
    const items = Array.isArray(this.claim?.items) ? this.claim.items : [];
    if (!items.length) {
      this.printRowWeights = [];
      return false;
    }

    const probe = document.querySelector<HTMLElement>('.expenses-claim-row-measurement .print-row-height-probe');
    const rows = document.querySelectorAll<HTMLElement>('.expenses-claim-row-measurement [data-print-row-index]');
    const baseHeight = probe?.getBoundingClientRect().height ?? 0;
    if (baseHeight <= 0 || rows.length !== items.length) {
      return false;
    }

    const nextWeights = Array.from(rows).map((row) => Math.min(
      EXPENSES_CLAIM_PRINT_MAX_ROW_WEIGHT,
      Math.max(1, Math.ceil((row.getBoundingClientRect().height - 0.5) / baseHeight))
    ));
    const changed = nextWeights.length !== this.printRowWeights.length ||
      nextWeights.some((weight, index) => weight !== this.printRowWeights[index]);

    if (changed) {
      this.printRowWeights = nextWeights;
      this.printableExpensesClaimPagesCache = null;
    }

    return changed;
  }

  private async waitForSignatureFont(): Promise<void> {
    const fonts = document.fonts;
    if (!fonts?.load) {
      return;
    }

    const fontLoad = fonts.load('18px testimonia-font').then(() => undefined).catch(() => undefined);
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));
    await Promise.race([fontLoad, timeout]);
  }

  private escapeAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  getWorkflowStatus(): 'draft' | 'pending' | 'reject' | 'approve' {
    if (String(this.claim?.status || '').toLowerCase() === 'draft') {
      return 'draft';
    }

    const statuses = [this.claim?.verified_by_status, this.claim?.approved_by_status];
    if (statuses.some((s) => isRejected(s))) return 'reject';
    if (statuses.every((s) => isApproved(s))) return 'approve';
    return 'pending';
  }

  getStatusBadgeClass(status: string | null | undefined): string {
    if (isApproved(status)) return 'bg-green-100 text-green-800';
    if (isRejected(status)) return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  }

  getStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const s = String(status).toLowerCase();
    if (s === 'approve' || s === 'approved') return 'Approved';
    if (s === 'reject' || s === 'rejected') return 'Rejected';
    return 'Pending';
  }

  getOverallStatusLabel(): string {
    const status = String(this.claim?.status || '').toLowerCase();
    if (status === 'draft') return 'Draft';
    if (status === 'approved' || status === 'approved_by') return 'Approved';
    if (status === 'rejected') return 'Rejected';
    if (status === 'verified') return 'Verified';
    if (status === 'submitted') return 'Submitted';
    return 'Pending';
  }

  getOverallStatusBadgeClass(): string {
    const status = this.getWorkflowStatus();
    if (status === 'draft') return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    if (status === 'approve') return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    if (status === 'reject') return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
  }

  getEmployeeLabelWithTitle(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookupWithTitle, '-');
  }

  getEmployeeLabelWithoutTitle(ref: string | number | null | undefined): string {
    const label = this.getEmployeeLabelWithTitle(ref);
    if (!label || label === '-') return '-';
    return label.split('|')[0].trim();
  }

  getEmployeeName(ref: string | number | null | undefined): string {
    if (!ref) return '';
    const label = this.getEmployeeLabelWithTitle(ref);
    if (!label || label === '-') return '';
    const namePart = label.split('|')[0].trim();
    const nameParts = namePart.split(',');
    if (nameParts.length > 1) {
      return nameParts[1].trim();
    }
    return namePart;
  }

  getEmployeeInitial(ref: string | number | null | undefined): string {
    if (!ref) return '';
    const label = this.getEmployeeLabelWithTitle(ref);
    if (!label || label === '-') return '';
    const namePart = label.split('|')[0].trim();
    const nameParts = namePart.split(',');
    if (nameParts.length > 1) {
      return nameParts[0].trim();
    }
    const fallback = String(ref).trim();
    return fallback.length <= 5 ? fallback : '';
  }

  getVerifiedInitials(): string {
    if (!this.claim?.verified_by || !isApproved(this.claim?.verified_by_status)) return '';
    return this.getEmployeeInitial(this.claim.verified_by);
  }

  getApprovedInitials(): string {
    if (!this.claim?.approved_by || !isApproved(this.claim?.approved_by_status)) return '';
    return this.getEmployeeInitial(this.claim.approved_by);
  }

  getPrintVerifiedBy(): string {
    if (!isApproved(this.claim?.verified_by_status)) return '';
    return this.getSignaturePrintValue(this.claim?.verified_by, this.claim?.verified_by_date);
  }

  getPrintApprovedBy(): string {
    if (!isApproved(this.claim?.approved_by_status)) return '';
    return this.getSignaturePrintValue(this.claim?.approved_by, this.claim?.approved_by_date);
  }

  getPrintReceivedBy(): string {
    return '';
  }

  private getSignaturePrintValue(
    ref: string | number | null | undefined,
    actionDate: string | Date | null | undefined
  ): string {
    const fallbackLabel = this.getEmployeeLabelWithoutTitle(ref);
    const fallbackName = fallbackLabel === '-' ? '' : fallbackLabel;
    return getSignaturePrintHtml(ref, actionDate, {
      activeSignatureSettings: this.activeSignatureSettings,
      employeeLookup: this.employeeLookup,
      fallbackName,
    }) || this.getFallbackSignaturePrintHtml(fallbackName, ref, actionDate);
  }

  private getFallbackSignaturePrintHtml(
    fallbackName: string,
    ref: string | number | null | undefined,
    actionDate: string | Date | null | undefined
  ): string {
    if (!fallbackName) {
      return '';
    }

    const signId = formatPoSignatureId(ref, actionDate);
    return `
      <span class="signature-print-block">
        <img class="signature-watermark" src="/favicon-32x32.png" alt="" />
        <span class="signature-name">${escapeSignatureHtml(fallbackName)}</span>
        ${signId ? `<span class="signature-id">${escapeSignatureHtml(signId)}</span>` : ''}
      </span>
    `;
  }

  formatDate(value: string | null | undefined): string {
    return formatDateDisplay(value);
  }

  formatDateTime(value: string | null | undefined): string {
    return formatDateTimeDisplay(value);
  }

  formatAmount(value: number | string | null | undefined): string {
    return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatProject(item: any): string {
    return formatProjectDisplay(item);
  }

  get itemCount(): number {
    return Array.isArray(this.claim?.items) ? this.claim.items.length : 0;
  }

  get attachmentItems(): AttachmentDisplayItem[] {
    return getAttachmentDisplayItems(this.claim?.attachments);
  }

  private printableExpensesClaimItemsRef: unknown;
  private printableExpensesClaimPagesCache: ExpensesClaimPrintPage<any>[] | null = null;

  get printableExpensesClaimPages(): ExpensesClaimPrintPage<any>[] {
    const items = this.claim?.items;

    if (this.printableExpensesClaimPagesCache === null || this.printableExpensesClaimItemsRef !== items) {
      this.printableExpensesClaimItemsRef = items;
      this.printableExpensesClaimPagesCache = buildExpensesClaimPrintPages(
        items,
        (item) => this.getPrintRowWeight(item)
      );
    }

    return this.printableExpensesClaimPagesCache;
  }

  getPrintRowHeightMm(item: any): number {
    return this.getPrintRowWeight(item) * this.printBaseRowHeightMm;
  }

  private getPrintRowWeight(item: any): number {
    const items = Array.isArray(this.claim?.items) ? this.claim.items : [];
    const itemIndex = items.indexOf(item);
    return itemIndex >= 0 ? (this.printRowWeights[itemIndex] ?? 1) : 1;
  }

  get grandTotalBaht(): number {
    const items = Array.isArray(this.claim?.items) ? this.claim.items : [];
    const rawApiTotal = this.claim?.total_baht;
    const apiTotal = Number(rawApiTotal);
    if (
      rawApiTotal !== null &&
      rawApiTotal !== undefined &&
      String(rawApiTotal).trim() !== '' &&
      Number.isFinite(apiTotal)
    ) {
      return apiTotal;
    }
    return this.sumItemBaht(items);
  }

  private sumItemBaht(items: any[]): number {
    return items.reduce((sum, item) => sum + Number(item?.baht || 0), 0);
  }

  private async preparePrintableAttachments(): Promise<void> {
    this.revokeAttachmentPdfObjectUrls();
    const printableItems = await Promise.all(
      this.attachmentItems.map((attachment) => this.createPrintableAttachment(attachment))
    );
    this.printableAttachmentItems = printableItems;
  }

  private async createPrintableAttachment(attachment: AttachmentDisplayItem): Promise<PrintableAttachmentItem> {
    const source = this.attachmentSource(attachment);
    const isJpeg = /\.(jpe?g)(\?|#|$)/i.test(source);
    const isImage = /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(source);
    const isPdf = this.isPdfAttachment(attachment);

    const baseItem: PrintableAttachmentItem = {
      ...attachment,
      isImage,
      isJpeg,
      isPdf,
      convertedToPdf: false,
      resourceUrl: this.sanitizer.bypassSecurityTrustResourceUrl(attachment.href),
    };

    if (!isJpeg) {
      return baseItem;
    }

    try {
      const pdfUrl = await this.convertJpegAttachmentToPdfUrl(attachment);
      this.attachmentPdfObjectUrls.push(pdfUrl);
      return {
        ...baseItem,
        isImage: false,
        isPdf: true,
        convertedToPdf: true,
        resourceUrl: this.sanitizer.bypassSecurityTrustResourceUrl(pdfUrl),
      };
    } catch (error) {
      console.warn('Failed to convert JPEG attachment to PDF:', error);
      return baseItem;
    }
  }

  private attachmentSource(attachment: AttachmentDisplayItem): string {
    return `${attachment.fileName} ${attachment.filePath} ${attachment.href}`.toLowerCase();
  }

  private isPdfAttachment(attachment: AttachmentDisplayItem): boolean {
    return /\.pdf(\?|#|$)/i.test(this.attachmentSource(attachment));
  }

  private async convertJpegAttachmentToPdfUrl(attachment: AttachmentDisplayItem): Promise<string> {
    const response = await firstValueFrom(
      this.apiService.getAllowanceAfter10pmAttachmentDataUrl(attachment.filePath || attachment.href)
    );
    const dataUrl = response?.data?.data_url;
    if (!dataUrl) {
      throw new Error('Attachment data URL is empty');
    }

    const imageData = await this.dataUrlToJpegImageData(dataUrl);
    const pdfBlob = this.createSingleImagePdfBlob(imageData.bytes, imageData.width, imageData.height);
    return URL.createObjectURL(pdfBlob);
  }

  private dataUrlToJpegImageData(dataUrl: string): Promise<{ bytes: Uint8Array; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        try {
          const maxSide = 2500;
          const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
          const width = Math.max(1, Math.round(image.naturalWidth * ratio));
          const height = Math.max(1, Math.round(image.naturalHeight * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Canvas context is not available');
          }

          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          const base64 = dataUrl.split(',')[1] || '';
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
          }

          resolve({ bytes, width, height });
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => {
        reject(new Error('Unable to decode attachment image'));
      };

      image.src = dataUrl;
    });
  }

  private createSingleImagePdfBlob(imageBytes: Uint8Array, imageWidth: number, imageHeight: number): Blob {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    const offsets: number[] = [0];
    let offset = 0;

    const add = (part: string | Uint8Array): void => {
      const bytes = typeof part === 'string' ? encoder.encode(part) : part;
      chunks.push(bytes);
      offset += bytes.length;
    };

    const addObject = (id: number, parts: Array<string | Uint8Array>): void => {
      offsets[id] = offset;
      add(`${id} 0 obj\n`);
      parts.forEach(add);
      add('\nendobj\n');
    };

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 24;
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - margin * 2;
    const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;
    const contentStream = [
      'q',
      `${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`,
      '/Im0 Do',
      'Q',
      '',
    ].join('\n');
    const contentBytes = encoder.encode(contentStream);

    add('%PDF-1.4\n');
    addObject(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
    addObject(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
    addObject(3, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] `,
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
    ]);
    addObject(4, [
      `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} `,
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
      imageBytes,
      '\nendstream',
    ]);
    addObject(5, [
      `<< /Length ${contentBytes.length} >>\nstream\n`,
      contentBytes,
      'endstream',
    ]);

    const xrefOffset = offset;
    add(`xref\n0 6\n0000000000 65535 f \n`);
    for (let id = 1; id <= 5; id += 1) {
      add(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    }
    add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    const pdfBytes = new Uint8Array(offset);
    let position = 0;
    chunks.forEach((chunk) => {
      pdfBytes.set(chunk, position);
      position += chunk.length;
    });

    return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  }

  private revokeAttachmentPdfObjectUrls(): void {
    this.attachmentPdfObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.attachmentPdfObjectUrls = [];
  }
}
