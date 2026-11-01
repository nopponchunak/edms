<?php

return [
    'host' => env('LEGACY_DESIGN_REVIEW_HOST', '192.168.10.40'),
    'port' => env('LEGACY_DESIGN_REVIEW_PORT', '1433'),
    'database' => env('LEGACY_DESIGN_REVIEW_DATABASE', 'DB_DesignReview'),
    'username' => env('LEGACY_DESIGN_REVIEW_USERNAME', ''),
    'password' => env('LEGACY_DESIGN_REVIEW_PASSWORD', ''),
    'tds_version' => env('LEGACY_DESIGN_REVIEW_TDS_VERSION', '7.0'),
    'sources' => [
        'designreview_new' => [
            'database' => env('LEGACY_DESIGN_REVIEW_NEW_DATABASE', env('LEGACY_DESIGN_REVIEW_DATABASE', 'DB_DesignReview')),
            'label' => 'designreview_new',
        ],
        'designreview' => [
            'database' => env('LEGACY_DESIGN_REVIEW_OLD_DATABASE', 'ReviewOnline'),
            'label' => 'designreview',
        ],
    ],
];
