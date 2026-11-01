import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Environment } from '../../../environments/environment.interface';

/**
 * API Configuration Service
 * Provides centralized access to API configuration
 */
@Injectable({
    providedIn: 'root'
})
export class ApiConfig {
    private readonly config: Environment = environment;

    /**
     * Get the base API URL
     */
    get apiUrl(): string {
        return this.config.apiUrl;
    }

    /**
     * Get API timeout in milliseconds
     */
    get apiTimeout(): number {
        return this.config.apiTimeout;
    }

    /**
     * Get API retry attempts
     */
    get apiRetryAttempts(): number {
        return this.config.apiRetryAttempts;
    }

    /**
     * Check if mock API is enabled
     */
    get isMockApi(): boolean {
        return this.config.mockApi;
    }

    /**
     * Check if logging is enabled
     */
    get isLoggingEnabled(): boolean {
        return this.config.enableLogging;
    }

    /**
     * Check if debug mode is enabled
     */
    get isDebugEnabled(): boolean {
        return this.config.enableDebug;
    }

    /**
     * Get maximum file size in bytes
     */
    get maxFileSize(): number {
        return this.config.maxFileSize;
    }

    /**
     * Get allowed file types
     */
    get allowedFileTypes(): string[] {
        return this.config.allowedFileTypes;
    }

    /**
     * Get maximum manual file size in bytes
     */
    get manualMaxFileSize(): number {
        return this.config.manualMaxFileSize ?? this.config.maxFileSize;
    }

    /**
     * Get allowed manual file types
     */
    get manualAllowedFileTypes(): string[] {
        return (
            this.config.manualAllowedFileTypes ?? ['pdf', 'jpg', 'jpeg', 'png']
        );
    }

    /**
     * Get default page size
     */
    get defaultPageSize(): number {
        return this.config.defaultPageSize;
    }

    /**
     * Get page size options
     */
    get pageSizeOptions(): number[] {
        return this.config.pageSizeOptions;
    }

    /**
     * Get cache timeout in milliseconds
     */
    get cacheTimeout(): number {
        return this.config.cacheTimeout;
    }

    /**
     * Build full API endpoint URL
     * @param endpoint - API endpoint path (e.g., '/users', 'auth/login')
     * @returns Full URL string
     */
    buildUrl(endpoint: string): string {
        // Remove leading slash if present to avoid double slashes
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
        // Ensure apiUrl doesn't end with slash
        const cleanApiUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
        return `${cleanApiUrl}/${cleanEndpoint}`;
    }

    /**
     * Check if file type is allowed
     * @param fileName - File name or extension
     * @returns True if file type is allowed
     */
    isFileTypeAllowed(fileName: string): boolean {
        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        return this.allowedFileTypes.includes(extension);
    }

    /**
     * Check if file size is within limit
     * @param fileSize - File size in bytes
     * @returns True if file size is within limit
     */
    isFileSizeValid(fileSize: number): boolean {
        return fileSize <= this.maxFileSize;
    }

    /**
     * Get files that exceed the configured upload size limit
     * @param files - Files or file-like objects
     * @returns Files that are larger than the configured limit
     */
    getOversizedFiles<T extends { size: number }>(files: T[]): T[] {
        return files.filter(file => !this.isFileSizeValid(file.size));
    }

    /**
     * Build a consistent upload size validation message for UI alerts
     * @param files - Files or file-like objects that exceed the configured limit
     * @returns Alert message
     */
    getFileSizeExceededMessage(files: { name: string; size: number } | Array<{ name: string; size: number }>): string {
        const fileList = Array.isArray(files) ? files : [files];
        const maxSize = this.formatFileSize(this.maxFileSize);

        if (fileList.length === 1) {
            const file = fileList[0];
            return `${file.name} is ${this.formatFileSize(file.size)}. Maximum allowed file size is ${maxSize}.`;
        }

        return `${fileList.length} files exceed the maximum allowed file size of ${maxSize}. Please select smaller files.`;
    }

    /**
     * Build a manual upload size validation message for UI alerts
     * @param file - File that exceeds the configured manual upload limit
     * @returns Alert message
     */
    getManualFileSizeExceededMessage(file: {
        name: string;
        size: number;
    }): string {
        const maxSize = this.formatFileSize(this.manualMaxFileSize);
        const fileSize = this.formatFileSize(file.size);

        return `${file.name} is ${fileSize}. Maximum allowed manual file size is ${maxSize}.`;
    }

    /**
     * Format file size for display
     * @param bytes - File size in bytes
     * @returns Formatted string (e.g., "10.5 MB")
     */
    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
}
