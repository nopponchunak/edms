<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'hrm_employee' => [
        'url' => env('HRM_EMPLOYEE_URL'),
        'updated_param' => env('HRM_EMPLOYEE_UPDATED_PARAM', 'updatedAt'),
        'verify_ssl' => env('HRM_EMPLOYEE_VERIFY_SSL', true),
    ],

    'ldap' => [
        'url' => env('LDAP_URL'),
        'base_dn' => env('LDAP_BASE_DN'),
        'bind_dn' => env('LDAP_BIND_DN'),
        'bind_password' => env('LDAP_BIND_PASSWORD'),
        'user_attribute' => env('LDAP_USER_ATTRIBUTE', 'sAMAccountName'),
        'user_dn_template' => env('LDAP_USER_DN_TEMPLATE'),
        'start_tls' => env('LDAP_START_TLS', false),
        'timeout' => env('LDAP_TIMEOUT', 5),
    ],

    'frontend_print' => [
        'base_url' => env('FRONTEND_PRINT_BASE_URL', env('FRONTEND_URL', env('PCR_NOTIFICATION_APP_URL'))),
        'chrome_binary' => env('CHROME_BINARY'),
        'chrome_runtime_dir' => env('FRONTEND_PRINT_CHROME_RUNTIME_DIR', '/tmp'),
        'render_wait_ms' => env('FRONTEND_PRINT_RENDER_WAIT_MS', 8000),
    ],


    'zoom' => [
        'key' => env('ZOOM_API_KEY'),
        'secret' => env('ZOOM_API_SECRET'),
    ],
];
