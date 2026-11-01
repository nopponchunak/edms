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
import { AttachmentDisplayItem, getAttachmentDisplayItems } from 'app/core/utils/attachment-url.util';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { isApproved, isRejected } from 'app/core/utils/action-request-filter.util';
import { formatProjectDisplay } from 'app/core/utils/project-display.util';
import {
  escapeSignatureHtml,
  formatPoSignatureId,
  getSignatureLookupRefsFromValues,
  getSignaturePrintHtml,
} from 'app/core/utils/signature-print.util';
import {
  ALLOWANCE_AFTER_10PM_PRINT_DISCIPLINE_OPTIONS,
  getAllowanceAfter10pmOtherDisciplineText,
  isAllowanceAfter10pmPrintDisciplineSelected,
  normalizeAllowanceAfter10pmDiscipline
} from '../allowance-after-10pm-discipline.util';
import {
  ALLOWANCE_AFTER_10PM_PRINT_MAX_ROW_WEIGHT,
  AllowanceAfter10pmPrintPage,
  buildAllowanceAfter10pmPrintPages,
  formatAllowanceAfter10pmPrintProject,
} from './allowance-after-10pm-print.util';

type PrintableAttachmentItem = AttachmentDisplayItem & {
  isImage: boolean;
  isJpeg: boolean;
  isPdf: boolean;
  convertedToPdf: boolean;
  resourceUrl: SafeResourceUrl;
};

@Component({
  selector: 'app-allowance-after-10pm-view',
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
  templateUrl: './allowance-after-10pm-view.component.html',
  styleUrls: ['./allowance-after-10pm-view.component.scss'],
})
export class AllowanceAfter10pmViewComponent implements OnInit, OnDestroy {
  allowance: any = null;
  isLoading = false;
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();
  activeSignatureSettings = new Map<string, SignatureSetting>();
  printableAttachmentItems: PrintableAttachmentItem[] = [];
  isPrintDocumentMode = false;
  printDocumentReady = false;

  readonly disciplineOptions = ALLOWANCE_AFTER_10PM_PRINT_DISCIPLINE_OPTIONS;
  private _unsubscribeAll = new Subject<void>();
  private attachmentPdfObjectUrls: string[] = [];
  private readonly printBodyClass = 'allowance-after-10pm-printing';
  private readonly printBaseRowHeightMm = 9.186;
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

    if (!this.isPrintDocumentMode) {
      window.addEventListener('beforeprint', this.enableAllowancePrintMode);
      window.addEventListener('afterprint', this.disableAllowancePrintMode);
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/allowance-after-10pm/list']);
      return;
    }

    if (this.isPrintDocumentMode && this.applyPrintPayloadFromFragment()) {
      return;
    }

    this.loadAllowance(id);
  }

  ngOnDestroy(): void {
    this.revokeAttachmentPdfObjectUrls();
    window.removeEventListener('beforeprint', this.enableAllowancePrintMode);
    window.removeEventListener('afterprint', this.disableAllowancePrintMode);
    this.disableAllowancePrintMode();
    this._unsubscribeAll.next();
    this._unsubscribeAll.complete();
  }

  private loadAllowance(id: string): void {
    this.isLoading = true;
    forkJoin({
      response: this.apiService.getAllowanceAfter10pm(id),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle(),
    })
      .pipe(
        switchMap(({ response, employeeLookup, employeeLookupWithTitle }) => {
          const allowance = response?.status && response?.data
            ? this.resolveDisplayAllowance(response.data)
            : null;
          const employeeRefs = this.getAllowanceEmployeeRefs(allowance).filter((code) => !!code);

          if (!allowance || employeeRefs.length === 0) {
            return of({
              allowance,
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
                  allowance,
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
        next: ({ allowance, employeeLookup, employeeLookupWithTitle, activeSignatureSettings }) => {
          this.employeeLookup = employeeLookup;
          this.employeeLookupWithTitle = employeeLookupWithTitle;
          this.activeSignatureSettings = activeSignatureSettings;
          this.allowance = allowance;
          this.isLoading = false;

          if (this.allowance && this.isPrintDocumentMode) {
            this.printableAttachmentItems = [];
            this.changeDetectorRef.detectChanges();
            this.markPrintDocumentReadyAfterFontsLoaded();
          } else if (this.allowance) {
            void this.preparePrintableAttachments();
          }
        },
        error: (error) => {
          console.error('Error loading allowance after 10pm:', error);
          this.isLoading = false;
          this.router.navigate(['/allowance-after-10pm/list']);
        }
      });
  }

  private resolveDisplayAllowance(allowance: any): any {
    if (String(allowance?.status || '').toLowerCase() !== 'draft') {
      return allowance;
    }

    const draftPayload = this.extractDraftPayload(allowance);
    return {
      ...allowance,
      ...draftPayload,
      id: allowance.id,
      voucher_no: allowance.voucher_no || draftPayload?.voucher_no || '',
      status: allowance.status,
      draft_payload: allowance.draft_payload,
    };
  }

  private extractDraftPayload(allowance: any): any {
    const payload = allowance?.draft_payload;
    if (payload && typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return allowance;
      }
    }
    if (payload && typeof payload === 'object') {
      return payload;
    }
    return allowance;
  }

  private getAllowanceEmployeeRefs(allowance: any = this.allowance): Array<string | number | null | undefined> {
    return [
      allowance?.claimant_name,
      allowance?.tl_by,
      allowance?.di_by,
      allowance?.notified_user,
      allowance?.create_by,
      allowance?.update_by
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
    this.allowance = this.resolveDisplayAllowance(payload.document);
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
      console.warn('Unable to read allowance print payload:', error);
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
    this.router.navigate(['/allowance-after-10pm/list']);
  }

  onEdit(): void {
    if (!this.allowance?.id) return;
    this.router.navigate(['/allowance-after-10pm/edit', this.allowance.id]);
  }

  canEdit(): boolean {
    return this.getWorkflowStatus() === 'pending';
  }

  onPrint(): void {
    if (!this.allowance?.id) {
      return;
    }

    this.openPdfUrl(this.apiService.getAllowanceAfter10pmPrintPdfUrl(this.allowance.id));
  }

  onOpenCombinedPdf(): void {
    if (!this.allowance?.id) {
      return;
    }

    this.openPdfUrl(this.apiService.getAllowanceAfter10pmCombinedPdfUrl(this.allowance.id));
  }

  private enableAllowancePrintMode = (): void => {
    document.body.classList.add(this.printBodyClass);
  };

  private disableAllowancePrintMode = (): void => {
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
    this.printFallbackCleanupTimer = setTimeout(this.disableAllowancePrintMode, 120000);
  }

  private writePrintWindow(printWindow: Window | null): boolean {
    const printRoot = document.querySelector('.allowance-after-10pm-print-root');
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
    <title>Allowance After 10 PM Print</title>
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
      const fitSignatureCells = () => {
        document.querySelectorAll('.signature-cell-content').forEach((cell) => {
          const block = cell.querySelector('.signature-print-block');
          const name = block?.querySelector('.signature-name');
          const id = block?.querySelector('.signature-id');
          const width = Math.max(block?.scrollWidth || 0, name?.scrollWidth || 0, id?.scrollWidth || 0);
          if (width) {
            const columnIndex = cell.closest('td')?.cellIndex;
            const printCellWidth = columnIndex === 6 ? 105 : 110.75;
            const availableWidth = Math.max(0, printCellWidth - 2);
            cell.style.setProperty('--signature-print-scale', String(Math.min(1, availableWidth / width)));
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
          fitSignatureCells();
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
        const cellCount = this.fitSignatureCells();
        if (cellCount === 0 && attempts < 20) {
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
    this.waitForSignatureFont().then(() => this.fitSignatureCells()).catch(() => undefined);
  }

  private fitSignatureCells(): number {
    const cells = document.querySelectorAll<HTMLElement>('.signature-cell-content');
    let fittedBlocks = 0;
    cells.forEach((cell) => {
      const block = cell.querySelector<HTMLElement>('.signature-print-block');
      const name = block?.querySelector<HTMLElement>('.signature-name');
      const id = block?.querySelector<HTMLElement>('.signature-id');
      const width = Math.max(block?.scrollWidth ?? 0, name?.scrollWidth ?? 0, id?.scrollWidth ?? 0);
      if (width > 0) {
        const columnIndex = cell.closest('td')?.cellIndex;
        const printCellWidth = columnIndex === 6 ? 105 : 110.75;
        const availableWidth = Math.max(0, printCellWidth - 2);
        cell.style.setProperty('--signature-print-scale', String(Math.min(1, availableWidth / width)));
        fittedBlocks += 1;
      }
    });

    const itemCount = this.printableAllowancePages.reduce((total, page) => total + page.items.length, 0);
    const signedRoles = Number(isApproved(this.allowance?.tl_by_status)) + Number(isApproved(this.allowance?.di_by_status));
    const expectedBlocks = itemCount * signedRoles;
    return expectedBlocks === 0 || fittedBlocks >= expectedBlocks ? cells.length : 0;
  }

  private updatePrintRowWeightsFromMeasurements(): boolean {
    const items = Array.isArray(this.allowance?.items) ? this.allowance.items : [];
    if (!items.length) {
      this.printRowWeights = [];
      return false;
    }

    const probe = document.querySelector<HTMLElement>('.allowance-row-measurement .print-row-height-probe');
    const rows = document.querySelectorAll<HTMLElement>('.allowance-row-measurement [data-print-row-index]');
    const baseHeight = probe?.getBoundingClientRect().height ?? 0;
    if (baseHeight <= 0 || rows.length !== items.length) {
      return false;
    }

    const nextWeights = Array.from(rows).map((row) => Math.min(
      ALLOWANCE_AFTER_10PM_PRINT_MAX_ROW_WEIGHT,
      Math.max(1, Math.ceil((row.getBoundingClientRect().height - 0.5) / baseHeight))
    ));
    const changed = nextWeights.length !== this.printRowWeights.length ||
      nextWeights.some((weight, index) => weight !== this.printRowWeights[index]);

    if (changed) {
      this.printRowWeights = nextWeights;
      this.printableAllowancePagesCache = null;
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

  getWorkflowStatus(): 'pending' | 'reject' | 'approve' {
    const statuses = [
      this.allowance?.tl_by_status,
      this.allowance?.di_by_status
    ];
    if (statuses.some((s) => isRejected(s))) return 'reject';
    if (statuses.every((s) => isApproved(s))) return 'approve';
    return 'pending';
  }

  getStatusBadgeClass(status: string | null | undefined): string {
    if (isApproved(status) || String(status || '').toLowerCase() === 'notified') return 'bg-green-100 text-green-800';
    if (isRejected(status)) return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  }

  getStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const s = String(status).toLowerCase();
    if (s === 'approve' || s === 'approved') return 'Approved';
    if (s === 'reject' || s === 'rejected') return 'Rejected';
    if (s === 'notified') return 'Notified';
    return 'Pending';
  }

  getOverallStatusLabel(): string {
    const status = String(this.allowance?.status || '').toLowerCase();
    if (status === 'notified' || status === 'approved' || status === 'account_approved') return 'Completed';
    if (status === 'rejected') return 'Rejected';
    if (status === 'di_approved') return 'Approved';
    if (status === 'tl_approved') return 'Verified';
    if (status === 'submitted') return 'Submitted';
    return 'Pending';
  }

  getOverallStatusBadgeClass(): string {
    const status = this.getWorkflowStatus();
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

  getVerifiedInitial(): string {
    if (!this.allowance?.tl_by || !isApproved(this.allowance.tl_by_status)) return '';
    return this.getEmployeeInitial(this.allowance.tl_by);
  }

  getApprovedInitial(): string {
    if (!this.allowance?.di_by || !isApproved(this.allowance.di_by_status)) return '';
    return this.getEmployeeInitial(this.allowance.di_by);
  }

  getVerifiedSignature(): string {
    if (!this.allowance?.tl_by || !isApproved(this.allowance.tl_by_status)) return '';
    return this.getSignaturePrintValue(this.allowance.tl_by, this.allowance.tl_by_date);
  }

  getApprovedSignature(): string {
    if (!this.allowance?.di_by || !isApproved(this.allowance.di_by_status)) return '';
    return this.getSignaturePrintValue(this.allowance.di_by, this.allowance.di_by_date);
  }

  getPrintReceivedBy(): string {
    return '';
  }

  private getSignaturePrintValue(
    ref: string | number | null | undefined,
    actionDate: string | Date | null | undefined
  ): string {
    const fallbackName = this.getEmployeeName(ref) || this.getEmployeeInitial(ref);
    const fallbackInitial = this.getEmployeeInitial(ref);
    return getSignaturePrintHtml(ref, actionDate, {
      activeSignatureSettings: this.activeSignatureSettings,
      employeeLookup: this.employeeLookup,
      fallbackName,
    }) || this.getFallbackSignaturePrintHtml(fallbackName, fallbackInitial, ref, actionDate);
  }

  private getFallbackSignaturePrintHtml(
    fallbackName: string,
    fallbackInitial: string,
    ref: string | number | null | undefined,
    actionDate: string | Date | null | undefined
  ): string {
    const name = fallbackName || fallbackInitial;
    if (!name) {
      return '';
    }

    const signId = formatPoSignatureId(ref, actionDate);
    return `
      <span class="signature-print-block">
        <img class="signature-watermark" src="/favicon-32x32.png" alt="" />
        <span class="signature-name">${escapeSignatureHtml(name)}</span>
        ${signId ? `<span class="signature-id">${escapeSignatureHtml(signId)}</span>` : ''}
      </span>
    `;
  }

  formatDate(value: string | null | undefined): string {
    return formatDateDisplay(value);
  }

  formatPrintDate(value: string | null | undefined): string {
    const formatted = formatDateDisplay(value);
    const match = formatted.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
    if (!match) return formatted;
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      .indexOf(match[2]);
    return month < 0 ? formatted : `${match[1]}/${String(month + 1).padStart(2, '0')}/${match[3]}`;
  }

  formatDateTime(value: string | null | undefined): string {
    return formatDateTimeDisplay(value);
  }

  formatAmount(value: number | string | null | undefined): string {
    return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatTime(value: string | null | undefined): string {
    if (!value) return '-';
    return String(value).slice(0, 5);
  }

  formatProject(item: any, separator = ' - '): string {
    return formatProjectDisplay(item, separator);
  }

  formatPrintProject(item: any): string {
    return formatAllowanceAfter10pmPrintProject(item);
  }

  formatDiscipline(value: string | null | undefined): string {
    return normalizeAllowanceAfter10pmDiscipline(value) || '-';
  }

  isDisciplineSelected(option: typeof ALLOWANCE_AFTER_10PM_PRINT_DISCIPLINE_OPTIONS[number]): boolean {
    return isAllowanceAfter10pmPrintDisciplineSelected(this.allowance?.discipline, option);
  }

  getOtherDisciplineText(): string {
    return getAllowanceAfter10pmOtherDisciplineText(this.allowance?.discipline);
  }

  get itemCount(): number {
    return Array.isArray(this.allowance?.items) ? this.allowance.items.length : 0;
  }

  get attachmentItems(): AttachmentDisplayItem[] {
    return getAttachmentDisplayItems(this.allowance?.attachments);
  }

  get blankRows(): number[] {
    return Array.from({ length: Math.max(0, 10 - this.itemCount) }, (_, index) => index);
  }

  private printableAllowanceItemsRef: unknown;
  private printableAllowancePagesCache: AllowanceAfter10pmPrintPage<any>[] | null = null;

  get printableAllowancePages(): AllowanceAfter10pmPrintPage<any>[] {
    const items = this.allowance?.items;

    if (this.printableAllowancePagesCache === null || this.printableAllowanceItemsRef !== items) {
      this.printableAllowanceItemsRef = items;
      this.printableAllowancePagesCache = buildAllowanceAfter10pmPrintPages(
        items,
        (item) => this.getPrintRowWeight(item)
      );
    }

    return this.printableAllowancePagesCache;
  }

  getPrintRowHeightMm(item: any): number {
    return this.getPrintRowWeight(item) * this.printBaseRowHeightMm;
  }

  private getPrintRowWeight(item: any): number {
    const items = Array.isArray(this.allowance?.items) ? this.allowance.items : [];
    const itemIndex = items.indexOf(item);
    return itemIndex >= 0 ? (this.printRowWeights[itemIndex] ?? 1) : 1;
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
