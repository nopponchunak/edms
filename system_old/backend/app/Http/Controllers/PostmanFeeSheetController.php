<?php

namespace App\Http\Controllers;

use App\Models\PostmanFeeSheet;

class PostmanFeeSheetController extends JsonPayloadCrudController
{
    protected string $modelClass = PostmanFeeSheet::class;

    protected array $coreFieldMap = [
        'fee_sheet_type' => ['fee_sheet_type'],
        'project_id' => ['project_id', 'projectId'],
        'mt_project_no' => ['mt_project_no', 'project_no', 'projectNumber'],
        'project_name' => ['project_name', 'projectName'],
        'discipline_id' => ['discipline_id'],
        'director_in_charge_id' => ['director_in_charge_id'],
        'project_type_id' => ['project_type_id'],
        'client_name' => ['client_name'],
        'location' => ['location'],
        'contact_name' => ['contact_name'],
        'status' => ['status'],
    ];

    protected array $exactFilterMap = [
        'fee_sheet_type' => 'fee_sheet_type',
        'project_id' => 'project_id',
        'discipline_id' => 'discipline_id',
        'director_in_charge_id' => 'director_in_charge_id',
        'project_type_id' => 'project_type_id',
        'status' => 'status',
    ];

    protected array $likeFilterMap = [
        'mt_project_no' => 'mt_project_no',
        'project_name' => 'project_name',
        'client_name' => 'client_name',
        'contact_name' => 'contact_name',
        'location' => 'location',
    ];

    protected array $searchableColumns = [
        'fee_sheet_type',
        'project_id',
        'mt_project_no',
        'project_name',
        'client_name',
        'location',
        'contact_name',
        'status',
    ];

    protected array $orderColumns = [
        0 => 'id',
        1 => 'fee_sheet_type',
        2 => 'mt_project_no',
        3 => 'project_name',
        4 => 'client_name',
        5 => 'location',
        6 => 'status',
        7 => 'created_at',
    ];
}
