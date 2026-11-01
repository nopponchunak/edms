<?php

namespace App\Http\Controllers;

use App\Models\PostmanProjectQualityAssurancePlan;

class PostmanProjectQualityAssurancePlanController extends JsonPayloadCrudController
{
    protected string $modelClass = PostmanProjectQualityAssurancePlan::class;

    protected array $coreFieldMap = [
        'revision' => ['revision'],
        'plan_date' => ['date'],
        'project_name' => ['project_name', 'projectName'],
        'project_no' => ['project_no', 'projectNumber'],
        'prepared_by_tl' => ['prepared_by_tl'],
        'approved_by_di' => ['approved_by_di'],
        'acknowledged_by_vve' => ['acknowledged_by_vve'],
        'status' => ['status'],
    ];

    protected array $exactFilterMap = [
        'revision' => 'revision',
        'prepared_by_tl' => 'prepared_by_tl',
        'approved_by_di' => 'approved_by_di',
        'acknowledged_by_vve' => 'acknowledged_by_vve',
        'status' => 'status',
    ];

    protected array $likeFilterMap = [
        'project_name' => 'project_name',
        'project_no' => 'project_no',
    ];

    protected array $searchableColumns = [
        'revision',
        'project_name',
        'project_no',
        'prepared_by_tl',
        'approved_by_di',
        'acknowledged_by_vve',
        'status',
    ];

    protected array $orderColumns = [
        0 => 'id',
        1 => 'revision',
        2 => 'project_name',
        3 => 'project_no',
        4 => 'prepared_by_tl',
        5 => 'approved_by_di',
        6 => 'status',
        7 => 'created_at',
    ];
}
