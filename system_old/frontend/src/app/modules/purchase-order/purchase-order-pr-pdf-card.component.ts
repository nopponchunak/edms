import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SafeResourceUrl } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  AttachmentDisplayItem,
  getAttachmentIcon,
  getAttachmentPreviewType,
  AttachmentPreviewType,
  getAttachmentTypeLabel,
} from 'app/core/utils/attachment-url.util';

@Component({
  selector: 'app-purchase-order-pr-pdf-card',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <section
      *ngIf="pdfItems.length"
      class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20"
    >
      <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex min-w-0 items-center gap-2">
          <span class="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white text-indigo-600 shadow-sm dark:bg-gray-900/70 dark:text-indigo-300">
            <mat-icon svgIcon="heroicons_outline:document-text" class="text-base"></mat-icon>
          </span>
          <div class="min-w-0">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">Purchase Requisition Documents</h3>
            <p class="text-xs text-gray-600 dark:text-gray-300">
              {{ pdfItems.length }} file(s)
            </p>
          </div>
        </div>
      </div>

      <div class="overflow-hidden rounded-lg border border-indigo-100 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div
          *ngFor="let pdf of pdfItems"
          class="flex flex-col gap-3 border-b border-gray-100 px-3 py-2.5 last:border-b-0 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between"
          [ngClass]="isPdfSelected(pdf) ? 'bg-indigo-50/70 dark:bg-indigo-950/20' : ''"
        >
          <div class="flex min-w-0 items-center gap-2">
            <mat-icon class="flex-shrink-0 text-base text-indigo-500" [svgIcon]="getAttachmentIcon(pdf)"></mat-icon>
            <div class="min-w-0">
              <button
                type="button"
                (click)="viewPdf.emit(pdf)"
                class="block max-w-full truncate text-left text-sm font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
              >
                {{ pdf.fileName }}
              </button>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {{ getAttachmentTypeLabel(pdf) }}<span *ngIf="pdf.fileSize"> / {{ pdf.fileSize }}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            mat-stroked-button
            color="primary"
            class="self-start text-xs sm:self-auto"
            (click)="viewPdf.emit(pdf)"
          >
            {{ isPdfSelected(pdf) ? 'Viewing' : 'View' }}
          </button>
        </div>
      </div>

      <div
        *ngIf="selectedPdf as pdf"
        class="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-900"
      >
        <div class="flex flex-col gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 items-center gap-3">
            <span class="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300">
              <mat-icon class="text-base" [svgIcon]="getAttachmentIcon(pdf)"></mat-icon>
            </span>
            <div class="min-w-0">
              <h4 class="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {{ pdf.fileName }}
              </h4>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {{ getAttachmentTypeLabel(pdf) }}<span *ngIf="pdf.fileSize"> / {{ pdf.fileSize }}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            mat-icon-button
            (click)="closePdf.emit()"
            aria-label="Close purchase requisition PDF preview"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <ng-container [ngSwitch]="getAttachmentPreviewType(pdf)">
          <div *ngSwitchCase="'pdf'" class="h-[640px] min-h-[420px] bg-gray-100 dark:bg-gray-950">
            <iframe
              *ngIf="selectedPdfResourceUrl"
              class="h-full w-full"
              [src]="selectedPdfResourceUrl"
              [attr.title]="pdf.fileName"
            ></iframe>
          </div>

          <div *ngSwitchCase="'image'" class="flex justify-center bg-gray-100 p-4 dark:bg-gray-950">
            <img
              class="max-h-[640px] w-full object-contain"
              [src]="pdf.href"
              [alt]="pdf.fileName"
            />
          </div>

          <div *ngSwitchDefault class="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <mat-icon class="text-4xl text-gray-400" [svgIcon]="getAttachmentIcon(pdf)"></mat-icon>
            <div>
              <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
                Preview not available
              </h4>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Inline preview supports PDF and image files.
              </p>
            </div>
            <a
              [href]="pdf.href"
              download
              mat-stroked-button
              color="primary"
            >
              Download file
            </a>
          </div>
        </ng-container>
      </div>
    </section>
  `,
})
export class PurchaseOrderPrPdfCardComponent {
  @Input() pdfItems: AttachmentDisplayItem[] = [];
  @Input() selectedPdf: AttachmentDisplayItem | null = null;
  @Input() selectedPdfResourceUrl: SafeResourceUrl | null = null;
  @Output() viewPdf = new EventEmitter<AttachmentDisplayItem>();
  @Output() closePdf = new EventEmitter<void>();

  getAttachmentIcon(attachment: AttachmentDisplayItem): string {
    return getAttachmentIcon(attachment);
  }

  getAttachmentTypeLabel(attachment: AttachmentDisplayItem): string {
    return getAttachmentTypeLabel(attachment);
  }

  getAttachmentPreviewType(attachment: AttachmentDisplayItem): AttachmentPreviewType {
    return getAttachmentPreviewType(attachment);
  }

  isPdfSelected(attachment: AttachmentDisplayItem): boolean {
    return this.selectedPdf?.href === attachment.href
      && this.selectedPdf?.fileName === attachment.fileName;
  }
}
