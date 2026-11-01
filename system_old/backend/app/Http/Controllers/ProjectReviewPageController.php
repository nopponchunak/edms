<?php

namespace App\Http\Controllers;

use App\Models\ConceptDesignReview;
use App\Models\ConstructionValidation;
use App\Models\EngineeringAuditReview;
use App\Models\LeedReview;
use App\Models\SchematicDesignReview;
use App\Models\SubmissionReview;
use App\Models\TenderCsaReview;
use App\Models\TenderCsaVerification;
use App\Models\TenderMepReview;
use App\Models\TenderMepVerification;
use App\Models\TenderReview;
use App\Models\ValueEngineeringReview;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ProjectReviewPageController extends JsonPayloadCrudController
{
    private const TYPE_CONFIG = [
        'concept_design_review' => [
            'hasStage' => true,
            'modelClass' => ConceptDesignReview::class,
            'coreFieldMap' => [
                'form_type' => ['formType', 'form_type'],
                'project_id' => ['projectId', 'project_id'],
                'project_name' => ['projectName', 'project_name'],
                'project_number' => ['projectNumber', 'project_number', 'project_no'],
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
            ],
            'exactFilterMap' => [
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
            ],
            'likeFilterMap' => [
                'project_name' => 'project_name',
                'project_number' => 'project_number',
                'prepared_by' => 'prepared_by',
            ],
            'searchableColumns' => [
                'form_type',
                'project_name',
                'project_number',
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
            ],
            'orderColumns' => [
                0 => 'id',
                1 => 'form_type',
                2 => 'project_name',
                3 => 'project_number',
                4 => 'prepared_by',
                5 => 'discipline',
                6 => 'reviewed_by',
                7 => 'responded_by',
                8 => 'status',
                9 => 'created_at',
            ],
        ],
        'schematic_design_review' => [
            'hasStage' => true,
            'modelClass' => SchematicDesignReview::class,
        ],
        'submission_review' => [
            'hasStage' => true,
            'modelClass' => SubmissionReview::class,
            'coreFieldMap' => [
                'form_type' => ['formType', 'form_type'],
                'project_id' => ['projectId', 'project_id'],
                'project_name' => ['projectName', 'project_name'],
                'project_number' => ['projectNumber', 'project_number', 'project_no'],
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
            ],
            'exactFilterMap' => [
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
            ],
            'likeFilterMap' => [
                'project_name' => 'project_name',
                'project_number' => 'project_number',
                'prepared_by' => 'prepared_by',
            ],
            'searchableColumns' => [
                'form_type',
                'project_name',
                'project_number',
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
            ],
            'orderColumns' => [
                0 => 'id',
                1 => 'form_type',
                2 => 'project_name',
                3 => 'project_number',
                4 => 'prepared_by',
                5 => 'discipline',
                6 => 'reviewed_by',
                7 => 'responded_by',
                8 => 'status',
                9 => 'created_at',
            ],
        ],
        'tender_review' => [
            'modelClass' => TenderReview::class,
            'coreFieldMap' => [
                'form_type' => ['formType', 'form_type'],
                'project_id' => ['projectId', 'project_id'],
                'project_name' => ['projectName', 'project_name'],
                'project_number' => ['projectNumber', 'project_number', 'project_no'],
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
                'signed_by_vve' => ['signedByVVE', 'signed_by_vve'],
                'signed_by_vve_date' => ['signedByVVEDate', 'signed_by_vve_date'],
                'signed_by_vve_status' => ['signedByVVEStatus', 'signed_by_vve_status'],
                'signed_by_tl' => ['signedByTL', 'signed_by_tl'],
                'signed_by_tl_date' => ['signedByTLDate', 'signed_by_tl_date'],
                'signed_by_tl_status' => ['signedByTLStatus', 'signed_by_tl_status'],
                'acknowledged_by' => ['acknowledgedBy', 'acknowledged_by'],
                'acknowledged_by_date' => ['acknowledgedByDate', 'acknowledged_by_date'],
                'acknowledged_by_status' => ['acknowledgedByStatus', 'acknowledged_by_status'],
                'status' => ['status'],
            ],
            'exactFilterMap' => [
                'form_type' => 'form_type',
                'discipline' => 'discipline',
                'review_method' => 'review_method',
                'reviewed_by' => 'reviewed_by',
                'reviewed_by_status' => 'reviewed_by_status',
                'responded_by' => 'responded_by',
                'responded_by_status' => 'responded_by_status',
                'signed_by_vve' => 'signed_by_vve',
                'signed_by_vve_status' => 'signed_by_vve_status',
                'signed_by_tl' => 'signed_by_tl',
                'signed_by_tl_status' => 'signed_by_tl_status',
                'acknowledged_by' => 'acknowledged_by',
                'acknowledged_by_status' => 'acknowledged_by_status',
                'status' => 'status',
            ],
            'likeFilterMap' => [
                'project_name' => 'project_name',
                'project_number' => 'project_number',
                'prepared_by' => 'prepared_by',
            ],
            'searchableColumns' => [
                'form_type',
                'project_name',
                'project_number',
                'prepared_by',
                'discipline',
                'reviewed_by',
                'reviewed_by_status',
                'responded_by',
                'responded_by_status',
                'signed_by_vve',
                'signed_by_vve_status',
                'signed_by_tl',
                'signed_by_tl_status',
                'acknowledged_by',
                'acknowledged_by_status',
                'status',
            ],
            'orderColumns' => [
                0 => 'id',
                1 => 'form_type',
                2 => 'project_name',
                3 => 'project_number',
                4 => 'prepared_by',
                5 => 'discipline',
                6 => 'reviewed_by',
                7 => 'responded_by',
                8 => 'status',
                9 => 'created_at',
            ],
        ],
        'tender_csa_review' => [
            'hasStage' => true,
            'modelClass' => TenderCsaReview::class,
        ],
        'tender_csa_verification' => [
            'hasStage' => true,
            'modelClass' => TenderCsaVerification::class,
        ],
        'tender_mep_review' => [
            'hasStage' => true,
            'modelClass' => TenderMepReview::class,
        ],
        'tender_mep_verification' => [
            'hasStage' => true,
            'modelClass' => TenderMepVerification::class,
        ],
        'construction_validation' => [
            'hasStage' => true,
            'modelClass' => ConstructionValidation::class,
            'coreFieldMap' => [
                'form_type' => ['formType', 'form_type'],
                'project_id' => ['projectId', 'project_id'],
                'project_name' => ['projectName', 'project_name'],
                'project_number' => ['projectNumber', 'project_number', 'project_no'],
                'prepared_by' => ['preparedBy', 'prepared_by'],
                'discipline' => ['discipline'],
                'document_location' => ['documentLocation', 'document_location'],
                'completed_by' => ['completedBy', 'completed_by'],
                'completed_by_date' => ['completedByDate', 'completed_by_date'],
                'completed_by_status' => ['completedByStatus', 'completed_by_status'],
                'responded_by' => ['respondedBy', 'responded_by'],
                'responded_by_date' => ['respondedByDate', 'responded_by_date'],
                'responded_by_status' => ['respondedByStatus', 'responded_by_status'],
                'signed_by_tl' => ['signedByTL', 'signed_by_tl'],
                'signed_by_tl_date' => ['signedByTLDate', 'signed_by_tl_date'],
                'signed_by_tl_status' => ['signedByTLStatus', 'signed_by_tl_status'],
                'acknowledged_by_tl' => ['acknowledgedByTL', 'acknowledged_by_tl'],
                'acknowledged_by_tl_date' => ['acknowledgedByTLDate', 'acknowledged_by_tl_date'],
                'acknowledged_by_tl_status' => ['acknowledgedByTLStatus', 'acknowledged_by_tl_status'],
                'acknowledged_by_di' => ['acknowledgedByDI', 'acknowledged_by_di'],
                'acknowledged_by_di_date' => ['acknowledgedByDIDate', 'acknowledged_by_di_date'],
                'acknowledged_by_di_status' => ['acknowledgedByDIStatus', 'acknowledged_by_di_status'],
                'status' => ['status'],
            ],
            'exactFilterMap' => [
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
            ],
            'likeFilterMap' => [
                'project_name' => 'project_name',
                'project_number' => 'project_number',
                'prepared_by' => 'prepared_by',
            ],
            'searchableColumns' => [
                'form_type',
                'project_name',
                'project_number',
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
            ],
            'orderColumns' => [
                0 => 'id',
                1 => 'form_type',
                2 => 'project_name',
                3 => 'project_number',
                4 => 'prepared_by',
                5 => 'discipline',
                6 => 'completed_by',
                7 => 'responded_by',
                8 => 'status',
                9 => 'created_at',
            ],
        ],
        'engineering_audit_review' => [
            'modelClass' => EngineeringAuditReview::class,
        ],
        'value_engineering_review' => [
            'modelClass' => ValueEngineeringReview::class,
        ],
        'leed_review' => [
            'modelClass' => LeedReview::class,
        ],
    ];

    public function getPage(Request $request)
    {
        $this->applyTypeConfig((string) $request->input('type', ''));

        return parent::getPage($request);
    }

    private function applyTypeConfig(string $type): void
    {
        $normalizedType = trim(strtolower($type));
        $config = self::TYPE_CONFIG[$normalizedType] ?? null;

        if (! $config) {
            throw new HttpException(422, 'Unsupported project review type');
        }

        $this->modelClass = $config['modelClass'];

        foreach (['coreFieldMap', 'exactFilterMap', 'likeFilterMap', 'searchableColumns', 'orderColumns'] as $property) {
            if (array_key_exists($property, $config)) {
                $this->{$property} = $config[$property];
            }
        }

        if (($config['hasStage'] ?? false) === true) {
            $this->enableStageField();
        }
    }

    private function enableStageField(): void
    {
        $this->coreFieldMap = $this->insertAssociativeAfter(
            $this->coreFieldMap,
            'project_number',
            'stage',
            ['stage']
        );
        $this->likeFilterMap = $this->insertAssociativeAfter(
            $this->likeFilterMap,
            'project_number',
            'stage',
            'stage'
        );
        $this->searchableColumns = $this->insertAfterValue(
            $this->searchableColumns,
            'project_number',
            'stage'
        );
    }

    private function insertAssociativeAfter(array $items, string $afterKey, string $newKey, $newValue): array
    {
        if (array_key_exists($newKey, $items)) {
            return $items;
        }

        $result = [];

        foreach ($items as $key => $value) {
            $result[$key] = $value;

            if ($key === $afterKey) {
                $result[$newKey] = $newValue;
            }
        }

        if (! array_key_exists($newKey, $result)) {
            $result[$newKey] = $newValue;
        }

        return $result;
    }

    private function insertAfterValue(array $items, string $afterValue, string $newValue): array
    {
        if (in_array($newValue, $items, true)) {
            return $items;
        }

        $result = [];

        foreach ($items as $value) {
            $result[] = $value;

            if ($value === $afterValue) {
                $result[] = $newValue;
            }
        }

        if (! in_array($newValue, $result, true)) {
            $result[] = $newValue;
        }

        return $result;
    }
}
