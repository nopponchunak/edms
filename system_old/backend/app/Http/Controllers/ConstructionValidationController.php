<?php

namespace App\Http\Controllers;

use App\Models\ConstructionValidation;

class ConstructionValidationController extends JsonPayloadCrudController
{
    protected string $modelClass = ConstructionValidation::class;

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
        'completed_by' => ['completedBy', 'completed_by'],
        'completed_by_date' => ['completedByDate', 'completed_by_date'],
        'completed_by_status' => ['completedByStatus', 'completed_by_status'],
        'responded_by' => ['respondedBy', 'responded_by'],
        'responded_by_date' => ['respondedByDate', 'responded_by_date'],
        'responded_by_status' => ['respondedByStatus', 'responded_by_status'],
        'signed_by_tl' => ['signedByTL', 'signed_by_tl', 'signed_by_t_l'],
        'signed_by_tl_date' => ['signedByTLDate', 'signed_by_tl_date', 'signed_by_t_l_date'],
        'signed_by_tl_status' => ['signedByTLStatus', 'signed_by_tl_status', 'signed_by_t_l_status'],
        'acknowledged_by_tl' => ['acknowledgedByTL', 'acknowledged_by_tl', 'acknowledged_by_t_l'],
        'acknowledged_by_tl_date' => ['acknowledgedByTLDate', 'acknowledged_by_tl_date', 'acknowledged_by_t_l_date'],
        'acknowledged_by_tl_status' => ['acknowledgedByTLStatus', 'acknowledged_by_tl_status', 'acknowledged_by_t_l_status'],
        'acknowledged_by_di' => ['acknowledgedByDI', 'acknowledged_by_di', 'acknowledged_by_d_i'],
        'acknowledged_by_di_date' => ['acknowledgedByDIDate', 'acknowledged_by_di_date', 'acknowledged_by_d_i_date', 'acknowledgedByDate', 'acknowledged_by_date'],
        'acknowledged_by_di_status' => ['acknowledgedByDIStatus', 'acknowledged_by_di_status', 'acknowledged_by_d_i_status', 'acknowledgedByStatus', 'acknowledged_by_status'],
        'status' => ['status'],
    ];

    protected array $exactFilterMap = [
        'form_type' => 'form_type',
        'discipline' => 'discipline',
        'completed_by' => 'completed_by',
        'completed_by_status' => 'completed_by_status',
        'responded_by' => 'responded_by',
        'responded_by_status' => 'responded_by_status',
        'signed_by_tl' => 'signed_by_tl',
        'signed_by_tl_status' => 'signed_by_tl_status',
        'acknowledged_by_tl' => 'acknowledged_by_tl',
        'acknowledged_by_tl_status' => 'acknowledged_by_tl_status',
        'acknowledged_by_di' => 'acknowledged_by_di',
        'acknowledged_by_di_status' => 'acknowledged_by_di_status',
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
        'completed_by',
        'completed_by_status',
        'responded_by',
        'responded_by_status',
        'signed_by_tl',
        'signed_by_tl_status',
        'acknowledged_by_tl',
        'acknowledged_by_tl_status',
        'acknowledged_by_di',
        'acknowledged_by_di_status',
        'status',
    ];

    protected array $orderColumns = [
        0 => 'project_number',
        1 => 'project_name',
        2 => 'discipline',
        3 => 'created_at',
        4 => 'responded_by',
        5 => 'completed_by',
        6 => 'acknowledged_by_tl',
        7 => 'acknowledged_by_di',
        8 => 'status',
    ];
}
