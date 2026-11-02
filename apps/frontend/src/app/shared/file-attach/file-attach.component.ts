import { Component, EventEmitter, Input, OnDestroy, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfPreviewDialogComponent } from '../pdf-preview/pdf-preview-dialog.component';
import { AttachmentInfo, UploadService } from '../upload/upload.service';

@Component({
  selector: 'app-file-attach',
  standalone: true,
  imports: [CommonModule, PdfPreviewDialogComponent],
  templateUrl: './file-attach.component.html',
  styleUrl: './file-attach.component.scss',
})
export class FileAttachComponent implements OnDestroy {
  @Input() attachments: AttachmentInfo[] = [];
  @Output() attachmentsChange = new EventEmitter<AttachmentInfo[]>();

  readonly uploading = signal(false);
  readonly uploadError = signal('');
  readonly preview = signal<{ url: string; title: string; filename: string; image: boolean } | null>(null);

  constructor(private readonly uploadService: UploadService) {}

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    input.value = '';

    this.uploadError.set('');
    this.uploading.set(true);

    let pending = files.length;
    const next = [...this.attachments];

    files.forEach((file) => {
      this.uploadService.upload(file).subscribe({
        next: (info) => {
          next.push(info);
          pending--;
          if (pending === 0) {
            this.uploading.set(false);
            this.attachmentsChange.emit([...next]);
          }
        },
        error: () => {
          pending--;
          this.uploadError.set('Upload failed. Please try again.');
          if (pending === 0) this.uploading.set(false);
        },
      });
    });
  }

  open(att: AttachmentInfo, event: Event): void {
    event.preventDefault();
    const failed = () => this.uploadError.set('Unable to open the attachment. Please try again.');
    if (!this.uploadService.isPreviewable(att)) {
      this.uploadService.download(att).subscribe({ error: failed });
      return;
    }
    this.uploadService.blobUrl(att).subscribe({
      next: (url) => {
        this.closePreview();
        this.preview.set({ url, title: att.originalName, filename: att.originalName, image: att.mimeType.startsWith('image/') });
      },
      error: failed,
    });
  }

  ngOnDestroy(): void {
    this.closePreview();
  }

  closePreview(): void {
    const current = this.preview();
    if (current) URL.revokeObjectURL(current.url);
    this.preview.set(null);
  }

  remove(att: AttachmentInfo) {
    this.uploadService.delete(att.filename).subscribe();
    this.attachmentsChange.emit(this.attachments.filter((a) => a.id !== att.id));
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
}
