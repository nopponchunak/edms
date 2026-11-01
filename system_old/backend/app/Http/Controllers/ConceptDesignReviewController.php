<?php

namespace App\Http\Controllers;

use App\Models\ConceptDesignReview;

class ConceptDesignReviewController extends JsonPayloadCrudController
{
    protected string $modelClass = ConceptDesignReview::class;

    protected array $coreFieldMap = [
        'form_type' => ['formType', 'form_type'],
        'project_id' => ['projectId', 'project_id'],
        'project_name' => ['projectName', 'project_name'],
        'project_number' => ['projectNumber', 'project_number', 'project_no'],
        'stage' => ['stage'],
        'prepared_by' => ['preparedBy', 'prepared_by'],
        'discipline' => ['discipline'],
        'document_location' => ['documentLocation', 'document_location'],
        'review_method' => ['reviewMethod', 'review_method'],
        'reviewed_by' => ['reviewedBy', 'reviewed_by'],
        'reviewed_by_date' => ['reviewedByDate', 'reviewed_by_date'],
        'reviewed_by_status' => ['reviewedByStatus', 'reviewed_by_status'],
        'responded_by' => ['respondedBy', 'responded_by'],
        'responded_by_date' => ['respondedByDate', 'responded_by_date'],
        'responded_by_status' => ['respondedByStatus', 'responded_by_status'],
        'signed_by_tl' => ['signedByTL', 'signed_by_tl'],
        'signed_by_tl_date' => ['signedByTLDate', 'signed_by_tl_date'],
        'signed_by_tl_status' => ['signedByTLStatus', 'signed_by_tl_status'],
        'signed_by_tl2' => ['signedByTL2', 'signed_by_tl2'],
        'signed_by_tl2_date' => ['signedByTL2Date', 'signed_by_tl2_date'],
        'signed_by_tl2_status' => ['signedByTL2Status', 'signed_by_tl2_status'],
        'acknowledged_by' => ['acknowledgedBy', 'acknowledged_by'],
        'acknowledged_by_date' => ['acknowledgedByDate', 'acknowledged_by_date'],
        'acknowledged_by_status' => ['acknowledgedByStatus', 'acknowledged_by_status'],
        'status' => ['status'],
    ];

    protected array $exactFilterMap = [
        'form_type' => 'form_type',
        'discipline' => 'discipline',
        'review_method' => 'review_method',
        'reviewed_by' => 'reviewed_by',
        'reviewed_by_status' => 'reviewed_by_status',
        'responded_by' => 'responded_by',
        'responded_by_status' => 'responded_by_status',
        'signed_by_tl' => 'signed_by_tl',
        'signed_by_tl_status' => 'signed_by_tl_status',
        'signed_by_tl2' => 'signed_by_tl2',
        'signed_by_tl2_status' => 'signed_by_tl2_status',
        'acknowledged_by' => 'acknowledged_by',
        'acknowledged_by_status' => 'acknowledged_by_status',
        'status' => 'status',
    ];

    protected array $likeFilterMap = [
        'project_name' => 'project_name',
        'project_number' => 'project_number',
        'stage' => 'stage',
        'prepared_by' => 'prepared_by',
    ];

    protected array $searchableColumns = [
        'form_type',
        'project_name',
        'project_number',
        'stage',
        'prepared_by',
        'discipline',
        'reviewed_by',
        'reviewed_by_status',
        'responded_by',
        'responded_by_status',
        'signed_by_tl',
        'signed_by_tl_status',
        'signed_by_tl2',
        'signed_by_tl2_status',
        'acknowledged_by',
        'acknowledged_by_status',
        'status',
    ];

    protected array $orderColumns = [
        0 => 'project_number',
        1 => 'project_name',
        2 => 'discipline',
        3 => 'created_at',
        4 => 'responded_by',
        5 => 'reviewed_by',
        6 => 'signed_by_tl2',
        7 => 'acknowledged_by',
        8 => 'status',
    ];
}
