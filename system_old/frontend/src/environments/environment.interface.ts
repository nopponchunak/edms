/**
 * Environment Interface
 * Defines the structure of environment configuration
 */
export interface Environment {
  production: boolean;

  // API Configuration
  apiUrl: string;
  legacyDesignReviewApiUrl?: string;
  apiTimeout: number;
  apiRetryAttempts: number;

  // Feature Flags
  mockApi: boolean;
  enableLogging: boolean;
  enableDebug: boolean;

  // Application Info
  appName: string;
  version: string;

  // File Upload Configuration
  maxFileSize: number;
  allowedFileTypes: string[];
  manualMaxFileSize?: number;
  manualAllowedFileTypes?: string[];

  // Pagination
  defaultPageSize: number;
  pageSizeOptions: number[];

  // Cache Configuration
  cacheTimeout: number;
}
