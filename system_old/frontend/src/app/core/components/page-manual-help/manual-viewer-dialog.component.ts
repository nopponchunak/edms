import { CommonModule } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
    MAT_DIALOG_DATA,
    MatDialogModule,
    MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
    Manual,
    ManualMediaType,
    ManualService,
} from 'app/core/services/manual.service';
import { finalize } from 'rxjs';

@Component({
    selector: 'app-manual-viewer-dialog',
    standalone: true,
    imports: [
        CommonModule,
        MatButtonModule,
        MatDialogModule,
        MatIconModule,
        MatProgressSpinnerModule,
    ],
    template: `
        <div class="flex min-h-0 flex-col">
            <div
                class="flex items-start justify-between gap-4 border-b px-5 py-4"
            >
                <div class="min-w-0">
                    <h2 class="truncate text-lg font-semibold text-gray-900">
                        {{ selectedManual?.title || 'User manual' }}
                    </h2>
                    <p
                        *ngIf="selectedManual?.description"
                        class="mt-1 line-clamp-2 text-sm text-gray-600"
                    >
                        {{ selectedManual?.description }}
                    </p>
                </div>
                <button mat-icon-button type="button" (click)="close()">
                    <mat-icon [svgIcon]="'heroicons_outline:x-mark'"></mat-icon>
                </button>
            </div>

            <div
                class="grid min-h-0 flex-1 grid-cols-1 bg-gray-50"
                [ngClass]="
                    manuals.length > 1
                        ? 'md:grid-cols-[17rem_minmax(0,1fr)]'
                        : 'md:grid-cols-1'
                "
            >
                <aside
                    *ngIf="manuals.length > 1"
                    class="border-b bg-white p-3 md:border-b-0 md:border-r"
                >
                    <div class="mb-2 px-2 text-sm font-medium text-gray-700">
                        Manuals on this page
                    </div>
                    <button
                        *ngFor="let manual of manuals"
                        type="button"
                        class="mb-1 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-blue-50"
                        [class.bg-blue-100]="manual.id === selectedManual?.id"
                        [class.text-blue-800]="manual.id === selectedManual?.id"
                        (click)="selectManual(manual)"
                    >
                        <mat-icon
                            class="mt-0.5 shrink-0 icon-size-4"
                            [svgIcon]="getManualIcon(manual)"
                        ></mat-icon>
                        <span class="min-w-0 flex-1">
                            <span class="block truncate font-medium">
                                {{ manual.title }}
                            </span>
                            <span class="block truncate text-xs text-gray-500">
                                {{ manual.original_file_name || '-' }}
                            </span>
                        </span>
                    </button>
                </aside>

                <main class="flex min-h-[28rem] min-w-0 flex-col">
                    <div
                        *ngIf="isLoading"
                        class="flex flex-1 items-center justify-center"
                    >
                        <mat-progress-spinner
                            mode="indeterminate"
                            diameter="36"
                        ></mat-progress-spinner>
                    </div>

                    <div
                        *ngIf="!isLoading && errorMessage"
                        class="flex flex-1 flex-col items-center justify-center p-8 text-center text-gray-600"
                    >
                        <mat-icon
                            class="mb-3 text-gray-400 icon-size-10"
                            [svgIcon]="'heroicons_outline:exclamation-triangle'"
                        ></mat-icon>
                        <div class="font-medium text-gray-900">
                            Cannot open this manual
                        </div>
                        <div class="mt-1 text-sm">{{ errorMessage }}</div>
                    </div>

                    <ng-container *ngIf="!isLoading && !errorMessage">
                        <iframe
                            *ngIf="viewerType === 'pdf'"
                            class="h-[72vh] w-full flex-1 bg-white"
                            [src]="safeObjectUrl"
                            title="Manual PDF preview"
                        ></iframe>

                        <div
                            *ngIf="viewerType === 'image'"
                            class="flex h-[72vh] flex-1 items-center justify-center overflow-auto bg-neutral-100 p-4"
                        >
                            <img
                                class="max-h-full max-w-full rounded-md bg-white object-contain"
                                [src]="objectUrl"
                                alt="Manual image preview"
                            />
                        </div>

                        <div
                            *ngIf="viewerType === 'video'"
                            class="flex h-[72vh] flex-1 items-center justify-center bg-neutral-950 p-3"
                        >
                            <video
                                class="max-h-full w-full max-w-full rounded-md bg-black"
                                [src]="objectUrl"
                                controls
                                preload="metadata"
                                playsinline
                            >
                                Video preview is not supported by this browser.
                            </video>
                        </div>

                        <div
                            *ngIf="viewerType === 'unsupported'"
                            class="flex flex-1 flex-col items-center justify-center p-8 text-center text-gray-600"
                        >
                            <mat-icon
                                class="mb-3 text-gray-400 icon-size-10"
                                [svgIcon]="'heroicons_outline:document'"
                            ></mat-icon>
                            <div class="font-medium text-gray-900">
                                Preview is not available
                            </div>
                            <div class="mt-1 text-sm">
                                Open the manual in a new tab.
                            </div>
                        </div>
                    </ng-container>
                </main>
            </div>

            <div class="flex justify-end gap-2 border-t bg-white px-5 py-3">
                <button mat-button type="button" (click)="close()">
                    Close
                </button>
                <button
                    mat-flat-button
                    color="primary"
                    type="button"
                    [disabled]="!fileBlob || isLoading"
                    (click)="openInNewTab()"
                >
                    <mat-icon
                        class="mr-2"
                        [svgIcon]="
                            'heroicons_outline:arrow-top-right-on-square'
                        "
                    ></mat-icon>
                    Open in new tab
                </button>
            </div>
        </div>
    `,
})
export class ManualViewerDialogComponent implements OnInit, OnDestroy {
    manuals: Manual[] = [];
    selectedManual: Manual | null = null;
    isLoading = false;
    errorMessage = '';
    objectUrl = '';
    safeObjectUrl: SafeResourceUrl | null = null;
    viewerType: ManualMediaType = 'unsupported';
    fileBlob: Blob | null = null;

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: { manuals: Manual[] },
        private dialogRef: MatDialogRef<ManualViewerDialogComponent>,
        private manualService: ManualService,
        private sanitizer: DomSanitizer
    ) {
        this.manuals = data.manuals ?? [];
        this.selectedManual = this.manuals[0] ?? null;
    }

    ngOnInit(): void {
        if (this.selectedManual) {
            this.loadManualFile(this.selectedManual);
        }
    }

    ngOnDestroy(): void {
        this.revokeObjectUrl();
    }

    selectManual(manual: Manual): void {
        if (manual.id === this.selectedManual?.id) {
            return;
        }

        this.selectedManual = manual;
        this.loadManualFile(manual);
    }

    close(): void {
        this.dialogRef.close();
    }

    openInNewTab(): void {
        if (!this.fileBlob) {
            return;
        }

        const tabUrl = URL.createObjectURL(this.fileBlob);
        window.open(tabUrl, '_blank', 'noopener');
        window.setTimeout(() => URL.revokeObjectURL(tabUrl), 60000);
    }

    getManualIcon(manual: Manual): string {
        return this.manualService.getManualMediaIcon(manual);
    }

    private loadManualFile(manual: Manual): void {
        this.isLoading = true;
        this.errorMessage = '';
        this.fileBlob = null;
        this.viewerType = 'unsupported';
        this.revokeObjectUrl();

        this.manualService
            .getFileBlob(manual.id)
            .pipe(finalize(() => (this.isLoading = false)))
            .subscribe({
                next: ({ blob, contentType }) => {
                    const type = this.getPreviewMimeType(
                        contentType,
                        blob.type,
                        manual.mime_type,
                        manual.original_file_name
                    );
                    this.fileBlob = type
                        ? blob.slice(0, blob.size, type)
                        : blob;
                    this.objectUrl = URL.createObjectURL(this.fileBlob);
                    this.safeObjectUrl =
                        this.sanitizer.bypassSecurityTrustResourceUrl(
                            this.objectUrl
                        );

                    this.viewerType = this.manualService.getManualMediaType({
                        ...manual,
                        mime_type: type,
                    });
                },
                error: (error) => {
                    this.errorMessage =
                        error?.error?.message ||
                        error?.message ||
                        'The file could not be loaded.';
                },
            });
    }

    private getPreviewMimeType(
        contentType?: string | null,
        blobType?: string | null,
        manualType?: string | null,
        fileName?: string | null
    ): string {
        const candidates = [
            contentType,
            blobType,
            manualType,
            this.getMimeTypeFromFileName(fileName),
        ]
            .map((type) => (type ?? '').split(';')[0].trim().toLowerCase())
            .filter(Boolean);

        return (
            candidates.find((type) => type !== 'application/octet-stream') ??
            candidates[0] ??
            ''
        );
    }

    private getMimeTypeFromFileName(fileName?: string | null): string {
        const name = (fileName ?? '').toLowerCase();

        if (name.endsWith('.pdf')) {
            return 'application/pdf';
        }

        if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
            return 'image/jpeg';
        }

        if (name.endsWith('.png')) {
            return 'image/png';
        }

        if (name.endsWith('.mp4')) {
            return 'video/mp4';
        }

        if (name.endsWith('.webm')) {
            return 'video/webm';
        }

        if (name.endsWith('.mov')) {
            return 'video/quicktime';
        }

        return '';
    }

    private revokeObjectUrl(): void {
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
        }

        this.objectUrl = '';
        this.safeObjectUrl = null;
    }
}
