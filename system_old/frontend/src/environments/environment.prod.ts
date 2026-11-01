/**
 * Production Environment Configuration
 * This file is used for production builds
 */
export const environment = {
  production: true,

  // API Configuration
  apiUrl: 'https://api-edms.meinhardt.net',
  legacyDesignReviewApiUrl: 'https://api-edms.meinhardt.net',
//   apiUrl: 'http://localhost/efrom-mh-api/public', // Production API URL - Update this with your actual API URL
  // Production API URL - Update this with your actual API URL
  apiTimeout: 30000, // 30 seconds
  apiRetryAttempts: 3,

  // Feature Flags
  mockApi: false, // Set to false for production
  enableLogging: false,
  enableDebug: false,

  // Application Info
  appName: 'MH E-Form',
  version: '1.0.0',

  // File Upload Configuration
  maxFileSize: 10 * 1024 * 1024, // 10MB in bytes
  allowedFileTypes: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'],
  manualMaxFileSize: 200 * 1024 * 1024, // 200MB in bytes
  manualAllowedFileTypes: ['pdf', 'jpg', 'jpeg', 'png', 'mp4', 'webm', 'mov'],

  // Pagination
  defaultPageSize: 10,
  pageSizeOptions: [10, 25, 50, 100],

  // Cache Configuration
  cacheTimeout: 5 * 60 * 1000, // 5 minutes in milliseconds
};
