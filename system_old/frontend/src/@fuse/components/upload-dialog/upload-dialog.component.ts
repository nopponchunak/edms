import { Component, Inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ApiConfig } from 'app/core/config/api.config';
import { ApiService } from 'app/core/services/api.service';
import { of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

export interface UploadDialogResult {
    id?: number | null;
    type: 'file' | 'link';
    file?: File;
    name?: string;
    file_name?: string;
    file_path?: string;
    file_url?: string;
    url?: string;
    file_size?: number;
    mime_type?: string;
    description?: string;
    uploaded_at?: Date;
}

export interface UploadedFile {
    file: File;
    file_path?: string;
    status: 'uploading' | 'success' | 'error';
    error?: string;
}

export interface UploadDialogData {
    uploadPath?: string;
    maxItems?: number;
    original?: 'Y' | 'N';
    allowedExtensions?: string[];
    accept?: string;
    allowLinks?: boolean;
}

export function normalizeUploadExtensions(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(new Set(
        value
            .map(extension => String(extension || '').trim().replace(/^\./, '').toLowerCase())
            .filter(extension => extension.length > 0)
    ));
}

export function isFileExtensionAllowed(fileName: string, allowedExtensions: string[]): boolean {
    if (!allowedExtensions.length) {
        return true;
    }

    const extension = String(fileName || '').split('.').pop()?.toLowerCase() || '';
    return allowedExtensions.includes(extension);
}

@Component({
    selector: 'fuse-upload-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        MatRadioModule,
        MatIconModule,
        MatProgressBarModule
    ],
    templateUrl: './upload-dialog.component.html',
    styleUrls: ['./upload-dialog.component.scss']
})
export class FuseUploadDialogComponent {
    // Limits
    private readonly DEFAULT_MAX_ITEMS = 5;

    @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

    mode: 'file' | 'link' = 'file';
    fileName = '';
    file: File | null = null;
    url = '';
    dragOver = false;

    // Multiple files support
    files: UploadedFile[] = [];
    isUploading = false;
    uploadPath = 'uploads/files/';
    maxItems = this.DEFAULT_MAX_ITEMS;
    maxFileSizeLabel = '';
    allowedExtensions: string[] = [];
    allowedFileTypesLabel = '';
    accept = '';
    allowLinks = true;
    /** Y = use original filename, N = system assigns name */
    useOriginalName: 'Y' | 'N' = 'Y';
    errorMessage: string | null = null;

    constructor(
        public dialogRef: MatDialogRef<FuseUploadDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: UploadDialogData,
        private apiService: ApiService,
        private apiConfig: ApiConfig
    ) {
        this.maxFileSizeLabel = this.apiConfig.formatFileSize(this.apiConfig.maxFileSize);
        this.allowedExtensions = normalizeUploadExtensions(data?.allowedExtensions);
        this.allowedFileTypesLabel = this.allowedExtensions.length
            ? this.allowedExtensions.map(extension => extension.toUpperCase()).join(', ')
            : this.apiConfig.allowedFileTypes.map(extension => extension.toUpperCase()).join(', ');
        this.accept = data?.accept || this.allowedExtensions.map(extension => `.${extension}`).join(',');
        this.allowLinks = data?.allowLinks !== false;

        if (data?.uploadPath) {
            this.uploadPath = data.uploadPath;
        }
        if (typeof data?.maxItems === 'number' && data.maxItems > 0) {
            this.maxItems = data.maxItems;
        }
        if (data?.original === 'N' || data?.original === 'Y') {
            this.useOriginalName = data.original;
        }
        if (!this.allowLinks) {
            this.mode = 'file';
        }
    }

    triggerFileInput(): void {
        if (this.fileInputRef?.nativeElement) {
            this.fileInputRef.nativeElement.click();
        }
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const files = input.files ? Array.from(input.files) : [];
        if (files.length > 0) {
            this.handleFiles(files);
        }
        // Reset input to allow selecting same file again
        input.value = '';
    }

    onDragOver(event: DragEvent): void {
        event.preventDefault();
        this.dragOver = true;
    }

    onDragLeave(_event: DragEvent): void {
        this.dragOver = false;
    }

    onDrop(event: DragEvent): void {
        event.preventDefault();
        this.dragOver = false;
        const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
        if (files.length > 0) {
            this.handleFiles(files);
        }
    }

    private handleFiles(files: File[]): void {
        if (this.mode === 'file') {
            this.errorMessage = null;

            // Enforce max total items (files + links via this dialog = 5 per dialog usage)
            if (this.files.length >= this.maxItems) {
                this.errorMessage = `You can upload a maximum of ${this.maxItems} files.`;
                return;
            }

            // Respect remaining slots
            const availableSlots = this.maxItems - this.files.length;
            const limitedFiles = files.slice(0, availableSlots);

            const oversizedFiles = this.apiConfig.getOversizedFiles(limitedFiles);
            const invalidTypeFiles = limitedFiles.filter(file => !isFileExtensionAllowed(file.name, this.allowedExtensions));
            const validFiles = limitedFiles.filter(file =>
                this.apiConfig.isFileSizeValid(file.size) &&
                isFileExtensionAllowed(file.name, this.allowedExtensions)
            );

            if (oversizedFiles.length > 0) {
                this.errorMessage = this.apiConfig.getFileSizeExceededMessage(oversizedFiles);
            }
            if (invalidTypeFiles.length > 0) {
                this.errorMessage = `Only ${this.allowedFileTypesLabel} files can be uploaded.`;
            }

            if (validFiles.length === 0) {
                return;
            }

            // Add new files to the list
            const newFiles: UploadedFile[] = validFiles.map(file => ({
                file,
                status: 'uploading' as const
            }));
            this.files = [...this.files, ...newFiles];

            // Auto-upload files
            this.uploadFiles(newFiles);
        }
    }

    private uploadFiles(filesToUpload: UploadedFile[]): void {
        this.isUploading = true;
        const fileList = filesToUpload.map(f => f.file);

        this.apiService
            .uploadMultipleFilesToApi(fileList, this.uploadPath, this.useOriginalName, this.allowedExtensions)
            .pipe(
                catchError(error => {
                    this.errorMessage = error.error?.message || error.message || 'Upload failed';
                    filesToUpload.forEach(f => {
                        f.status = 'error';
                        f.error = this.errorMessage || 'Upload failed';
                    });
                    return of(null);
                }),
                finalize(() => {
                    this.isUploading = false;
                })
            )
            .subscribe(result => {
                if (!result) return;
                // Response: data as array of paths, or data.paths, or paths (same order as files[])
                const paths: string[] =
                    Array.isArray(result.data)
                        ? result.data
                        : result.data?.paths ?? result.paths ?? [];
                paths.forEach((path, index) => {
                    if (path && filesToUpload[index]) {
                        filesToUpload[index].file_path = path;
                        filesToUpload[index].status = 'success';
                    } else if (filesToUpload[index] && !filesToUpload[index].error) {
                        filesToUpload[index].status = 'error';
                        filesToUpload[index].error = result.message || 'Upload failed';
                    }
                });
                // If backend returns fewer paths than files, mark rest as error
                filesToUpload.forEach((f, i) => {
                    if (f.status === 'uploading') {
                        f.status = 'error';
                        f.error = 'No path returned for this file';
                    }
                });
            });
    }

    removeFile(index: number): void {
        this.files.splice(index, 1);
    }

    retryUpload(index: number): void {
        const fileToRetry = this.files[index];
        fileToRetry.status = 'uploading';
        fileToRetry.error = undefined;
        this.uploadFiles([fileToRetry]);
    }

    canSubmit(): boolean {
        const hasFiles = this.files.some(f => f.status === 'success');
        const hasLink = this.allowLinks && this.url.trim().length > 0;
        return hasFiles || hasLink;
    }

    confirm(): void {
        const results: UploadDialogResult[] = [];

        // 1. Collect all successfully uploaded files
        this.files
            .filter(f => f.status === 'success')
            .forEach(uploadedFile => {
                results.push({
                    type: 'file',
                    file: uploadedFile.file,
                    name: uploadedFile.file.name,
                    file_name: uploadedFile.file.name,
                    file_path: uploadedFile.file_path,
                    file_size: uploadedFile.file.size,
                    mime_type: uploadedFile.file.type,
                    uploaded_at: new Date()
                });
            });

        // 2. Collect link if entered
        if (this.allowLinks && this.url.trim()) {
            results.push({
                type: 'link',
                url: this.url.trim(),
                file_path: this.url.trim(),
                file_url: this.url.trim(),
                file_name: this.url.trim(),
                uploaded_at: new Date()
            });
        }

        if (results.length === 0) {
            return;
        }

        // Return result(s)
        this.dialogRef.close(results.length === 1 ? results[0] : results);
    }
}
