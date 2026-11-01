import { Component, computed, EventEmitter, HostListener, inject, Input, Output, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-pdf-preview-dialog',
  standalone: true,
  templateUrl: './pdf-preview-dialog.component.html',
  styleUrl: './pdf-preview-dialog.component.scss',
})
export class PdfPreviewDialogComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly blobUrl = signal('');

  @Input({ required: true }) title = '';
  @Input({ required: true }) filename = '';
  @Input({ required: true }) set url(value: string) { this.blobUrl.set(value); }
  @Input() image = false;
  @Output() closed = new EventEmitter<void>();

  get href(): string { return this.blobUrl(); }
  readonly frameUrl = computed<SafeResourceUrl>(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrl()));

  @HostListener('document:keydown.escape')
  close(): void { this.closed.emit(); }
}
