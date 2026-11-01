/**
 * Development Environment Configuration
 * This file is used for local development
 */
export const environment = {
    production: false,

    // API Configuration
    //apiUrl: 'https://meinhard-eform.dev-asha9.com/public',
    apiUrl: 'http://127.0.0.1:8001',
    //apiUrl: 'https://api-edms.meinhardt.net',
    //apiUrl: 'http://localhost/efrom-mh-api/public/', // Production API URL - Update this with your actual API URL
    legacyDesignReviewApiUrl: 'http://127.0.0.1:8001',
    //legacyDesignReviewApiUrl: 'http://localhost/efrom-mh-api/public',
    // Laravel API URL (default port 8000)
    apiTimeout: 30000, // 30 seconds
    apiRetryAttempts: 3,

    // Feature Flags
    mockApi: true, // Set to false when real API is available
    enableLogging: true,
    enableDebug: true,

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
