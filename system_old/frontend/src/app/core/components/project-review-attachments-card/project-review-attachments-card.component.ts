import { Clipboard } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiConfig } from 'app/core/config/api.config';
import {
    pickDate,
    pickValue,
} from 'app/core/services/project-review-api.service';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';

interface ProjectReviewAttachmentItem {
    fileName: string;
    fileSize: string;
    uploadDate: string;
    type: string;
    filePath: string;
}

@Component({
    selector: 'app-project-review-attachments-card',
    standalone: true,
    host: {
        class: 'block',
    },
    imports: [
        CommonModule,
        MatButtonModule,
        MatIconModule,
        MatSnackBarModule,
        MatTooltipModule,
    ],
    template: `
        <div
            *ngIf="attachmentItems.length"
            class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
            <div class="mb-4 flex items-center gap-3">
                <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-600"
                >
                    <mat-icon
                        class="scale-75"
                        [svgIcon]="'heroicons_solid:paper-clip'"
                    ></mat-icon>
                </span>
                <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Attachments
                </h2>
            </div>

            <div class="space-y-3">
                <div
                    *ngFor="let attachment of attachmentItems"
                    class="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-800"
                    (click)="openAttachment(attachment)"
                >
                    <mat-icon
                        class="mt-0.5 scale-75 text-slate-400"
                        [svgIcon]="
                            attachment.type === 'link'
                                ? 'heroicons_outline:link'
                                : 'heroicons_outline:document-text'
                        "
                    ></mat-icon>

                    <div class="min-w-0 flex-1">
                        <div
                            class="truncate text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                            {{ attachment.fileName }}
                        </div>
                        <div class="mt-1 text-xs text-slate-500">
                            <ng-container
                                *ngIf="attachment.type === 'link'; else fileDetails"
                            >
                                Shared link
                            </ng-container>
                            <ng-template #fileDetails>
                                {{ attachment.fileSize || 'Unknown size' }}
                                <ng-container
                                    *ngIf="
                                        attachment.uploadDate &&
                                        attachment.uploadDate !== '-'
                                    "
                                >
                                    &bull; {{ attachment.uploadDate }}
                                </ng-container>
                            </ng-template>
                        </div>
                    </div>

                    <button
                        *ngIf="isCopyableAttachment(attachment.filePath)"
                        mat-icon-button
                        type="button"
                        class="ml-auto shrink-0 text-slate-400 transition-colors hover:text-blue-600"
                        aria-label="Copy attachment path"
                        matTooltip="Copy path to clipboard"
                        (click)="
                            $event.stopPropagation();
                            copyToClipboard(attachment.filePath)
                        "
                    >
                        <mat-icon
                            class="scale-75"
                            [svgIcon]="'heroicons_outline:clipboard-document'"
                        ></mat-icon>
                    </button>
                </div>
            </div>
        </div>
    `,
})
export class ProjectReviewAttachmentsCardComponent {
    @Input() attachments: unknown;
    @Input() drivePaths: unknown;
    @Input() recordData: any;

    constructor(
        private apiConfig: ApiConfig,
        private clipboard: Clipboard,
        private snackBar: MatSnackBar
    ) {}

    get attachmentItems(): ProjectReviewAttachmentItem[] {
        const attachmentSource =
            this.attachments !== undefined
                ? this.attachments
                : (pickValue(
                      this.recordData,
                      'attachments',
                      'attachment',
                      'files'
                  ) ?? []);
        const drivePathSource =
            this.drivePaths !== undefined
                ? this.drivePaths
                : pickValue(this.recordData, 'drivePaths', 'drive_paths');
        const attachments = this.normalizeAttachmentList(
            attachmentSource
        );
        const drivePaths = this.normalizeStringList(drivePathSource);

        const items = [
            ...attachments,
            ...drivePaths.map((path) => ({ file_path: path, type: 'link' })),
        ]
            .map((item) => this.toAttachmentItem(item))
            .filter(
                (item): item is ProjectReviewAttachmentItem => item !== null
            );

        const seen = new Set<string>();
        return items.filter((item) => {
            const key = item.filePath.toLowerCase();
            if (seen.has(key)) {
                return false;
            }

            seen.add(key);
            return true;
        });
    }

    openAttachment(item: ProjectReviewAttachmentItem): void {
        const path = item.filePath;
        if (!path) {
            return;
        }

        if (/^https?:\/\//i.test(path) || path.startsWith('\\\\')) {
            window.open(path, '_blank');
            return;
        }

        if (this.isDrivePath(path)) {
            this.copyToClipboard(path);
            window.open(`file:///${path.replace(/\\/g, '/')}`, '_blank');
            return;
        }

        if (item.type === 'file') {
            const url = path.startsWith('/') ? path : `/storage/${path}`;
            window.open(this.apiConfig.buildUrl(url), '_blank');
            return;
        }

        window.open(path, '_blank');
    }

    copyToClipboard(text: string): void {
        if (text && this.clipboard.copy(text)) {
            this.snackBar.open('Path copied to clipboard', 'OK', {
                duration: 3000,
            });
        }
    }

    isCopyableAttachment(path: string): boolean {
        return this.isDrivePath(path) || String(path || '').startsWith('\\\\');
    }

    private normalizeAttachmentList(value: unknown): any[] {
        if (Array.isArray(value)) {
            return value;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return [];
            }

            try {
                const decoded = JSON.parse(trimmed);
                return Array.isArray(decoded) ? decoded : [trimmed];
            } catch {
                return [trimmed];
            }
        }

        return [];
    }

    private normalizeStringList(value: unknown): string[] {
        if (Array.isArray(value)) {
            return value.map((item) => String(item).trim()).filter(Boolean);
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return [];
            }

            try {
                const decoded = JSON.parse(trimmed);
                if (Array.isArray(decoded)) {
                    return decoded
                        .map((item) => String(item).trim())
                        .filter(Boolean);
                }
            } catch {
                // Continue with text splitting fallback.
            }

            return trimmed
                .split(/\r?\n|,/)
                .map((item) => item.trim())
                .filter(Boolean);
        }

        return [];
    }

    private toAttachmentItem(
        item: any
    ): ProjectReviewAttachmentItem | null {
        const isStringItem = typeof item === 'string';
        const filePath = String(
            isStringItem
                ? item
                : (item?.file_path ??
                      item?.path ??
                      item?.file_url ??
                      item?.url ??
                      '')
        ).trim();

        if (!filePath) {
            return null;
        }

        const type = isStringItem
            ? 'file'
            : String(
                  item?.type ?? (this.isDrivePath(filePath) ? 'link' : 'file')
              );
        const fileName =
            type === 'link'
                ? filePath
                : String(
                      isStringItem
                          ? filePath.split(/[\\/]/).pop() || filePath
                          : (item?.file_name ??
                                item?.fileName ??
                                item?.name ??
                                filePath.split(/[\\/]/).pop() ??
                                filePath)
                  ).trim();

        return {
            fileName,
            fileSize: this.formatAttachmentSize(
                isStringItem ? null : item?.file_size ?? item?.fileSize
            ),
            uploadDate: isStringItem
                ? ''
                : formatDateTimeDisplay(
                      pickDate(item, 'uploaded_at', 'uploadDate', 'upload_date')
                  ),
            type,
            filePath,
        };
    }

    private isDrivePath(path: string): boolean {
        return /^[a-zA-Z]:\\/.test(path) || /^[a-zA-Z]:\//.test(path);
    }

    private formatAttachmentSize(value: unknown): string {
        if (typeof value === 'string' && value.trim() && isNaN(Number(value))) {
            return value.trim();
        }

        const size = Number(value);
        if (!Number.isFinite(size) || size <= 0) {
            return '';
        }

        return `${(size / 1024).toFixed(2)} KB`;
    }
}
