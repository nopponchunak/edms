<?php

namespace App\Services;

use App\Models\PostmanProposalContractReview;
use App\Models\PostmanProposalContractReviewProject;
use App\Models\ProposalProjectReference;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;

class CurrentProjectImportService
{
    private const PROPOSALS_SHEET = 'proposals';
    private const PROJECTS_SHEET = 'projects';
    private const REFERENCES_SHEET = 'proposal_project_refs';

    public function previewOrImport(UploadedFile $file, bool $commit, string $actorId): array
    {
        $workbook = IOFactory::load($file->getRealPath());
        $proposals = $this->sheetRows($workbook, self::PROPOSALS_SHEET);
        $projects = $this->sheetRows($workbook, self::PROJECTS_SHEET);
        $references = $this->sheetRows($workbook, self::REFERENCES_SHEET, false);

        $validation = $this->validateRows($proposals, $projects, $references);
        if (! empty($validation['errors'])) {
            return [
                'commit' => false,
                'imported' => false,
                'summary' => $validation['summary'],
                'errors' => $validation['errors'],
                'warnings' => $validation['warnings'],
                'created' => [],
            ];
        }

        $created = [];
        if ($commit) {
            $created = $this->commitRows($proposals, $projects, $actorId);
        }

        return [
            'commit' => $commit,
            'imported' => $commit,
            'summary' => $validation['summary'],
            'errors' => [],
            'warnings' => $validation['warnings'],
            'created' => $created,
        ];
    }

    private function sheetRows(Spreadsheet $workbook, string $sheetName, bool $required = true): array
    {
        $sheet = $workbook->getSheetByName($sheetName);
        if (! $sheet) {
            if ($required) {
                throw new \InvalidArgumentException("ไม่พบ sheet {$sheetName}");
            }

            return [];
        }

        $highestRow = $sheet->getHighestDataRow();
        $highestColumn = $sheet->getHighestDataColumn();
        $highestColumnIndex = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::columnIndexFromString($highestColumn);

        $headers = [];
        for ($column = 1; $column <= $highestColumnIndex; $column++) {
            $header = $this->normalizeHeader($this->cellValue($sheet->getCellByColumnAndRow($column, 1)->getValue()));
            $headers[$column] = $header;
        }

        $rows = [];
        for ($rowNumber = 2; $rowNumber <= $highestRow; $rowNumber++) {
            $row = ['_row' => $rowNumber];
            $hasValue = false;

            for ($column = 1; $column <= $highestColumnIndex; $column++) {
                $header = $headers[$column] ?? '';
                if ($header === '') {
                    continue;
                }

                $value = $this->cellValue($sheet->getCellByColumnAndRow($column, $rowNumber)->getValue());
                if ($value !== '') {
                    $hasValue = true;
                }
                $row[$header] = $value;
            }

            if ($hasValue) {
                $rows[] = $row;
            }
        }

        return $rows;
    }

    private function validateRows(array $proposals, array $projects, array $references): array
    {
        $errors = [];
        $warnings = [];

        if (count($proposals) === 0) {
            $errors[] = 'sheet proposals ไม่มีข้อมูล';
        }
        if (count($projects) === 0) {
            $errors[] = 'sheet projects ไม่มีข้อมูล';
        }

        $proposalNumbers = [];
        foreach ($proposals as $row) {
            $proposalNumber = $this->requiredValue($row, 'proposal_number');
            if ($proposalNumber === '') {
                $errors[] = "proposals row {$row['_row']}: proposal_number ว่าง";
                continue;
            }

            if (isset($proposalNumbers[$proposalNumber])) {
                $errors[] = "proposals row {$row['_row']}: proposal_number {$proposalNumber} ซ้ำในไฟล์";
            }
            $proposalNumbers[$proposalNumber] = true;

            if ($this->requiredValue($row, 'project_name') === '') {
                $warnings[] = "proposals row {$row['_row']}: project_name ว่าง";
            }

            $missingApiFields = $this->requiredValue($row, 'api_required_missing');
            if ($missingApiFields !== '') {
                $warnings[] = "proposals {$proposalNumber}: ขาดข้อมูลสำหรับ API ปกติ ({$missingApiFields}) แต่ import ตรง DB ได้";
            }
        }

        $projectNumbers = [];
        $projectRowsByProposal = [];
        foreach ($projects as $row) {
            $proposalNumber = $this->requiredValue($row, 'proposal_number') ?: $this->requiredValue($row, 'proposal_lookup_key');
            $mtProjectNo = $this->requiredValue($row, 'mt_project_no');

            if ($proposalNumber === '') {
                $errors[] = "projects row {$row['_row']}: proposal_number/proposal_lookup_key ว่าง";
            } elseif (! isset($proposalNumbers[$proposalNumber])) {
                $errors[] = "projects row {$row['_row']}: proposal_number {$proposalNumber} ไม่พบใน sheet proposals";
            } else {
                $projectRowsByProposal[$proposalNumber] = ($projectRowsByProposal[$proposalNumber] ?? 0) + 1;
            }

            if ($mtProjectNo === '') {
                $errors[] = "projects row {$row['_row']}: mt_project_no ว่าง";
            } elseif (isset($projectNumbers[$mtProjectNo])) {
                $errors[] = "projects row {$row['_row']}: mt_project_no {$mtProjectNo} ซ้ำในไฟล์";
            }
            $projectNumbers[$mtProjectNo] = true;

            if ($this->requiredValue($row, 'project_name') === '') {
                $warnings[] = "projects {$mtProjectNo}: project_name ว่าง";
            }

            if ($this->requiredValue($row, 'unmapped_initials') !== '') {
                $warnings[] = "projects {$mtProjectNo}: ยัง map ตัวย่อไม่ได้ ({$this->requiredValue($row, 'unmapped_initials')})";
            }
        }

        if (count($references) > 0 && count($references) !== count($projects)) {
            $warnings[] = 'จำนวน rows ใน proposal_project_refs ไม่เท่ากับ projects; ระบบจะสร้าง reference จาก projects ตอน commit';
        }

        $existingProposalNumbers = PostmanProposalContractReview::query()
            ->whereNull('deleted_at')
            ->whereIn('proposal_number', array_keys($proposalNumbers))
            ->pluck('proposal_number')
            ->all();
        foreach ($existingProposalNumbers as $proposalNumber) {
            $errors[] = "proposal_number {$proposalNumber} มีอยู่ใน DB แล้ว";
        }

        $existingProjectNumbers = PostmanProposalContractReviewProject::query()
            ->whereNull('deleted_at')
            ->whereIn('mt_project_no', array_keys($projectNumbers))
            ->pluck('mt_project_no')
            ->all();
        foreach ($existingProjectNumbers as $projectNumber) {
            $errors[] = "mt_project_no {$projectNumber} มีอยู่ใน DB แล้ว";
        }

        $existingReferenceProjectNumbers = ProposalProjectReference::query()
            ->whereNull('deleted_at')
            ->whereIn('project_number', array_keys($projectNumbers))
            ->pluck('project_number')
            ->all();
        foreach ($existingReferenceProjectNumbers as $projectNumber) {
            $errors[] = "proposal_project_references.project_number {$projectNumber} มีอยู่ใน DB แล้ว";
        }

        return [
            'errors' => $errors,
            'warnings' => array_values(array_unique($warnings)),
            'summary' => [
                'proposal_rows' => count($proposals),
                'project_rows' => count($projects),
                'reference_rows_in_file' => count($references),
                'proposal_numbers' => count($proposalNumbers),
                'mt_project_numbers' => count($projectNumbers),
                'proposals_with_projects' => count($projectRowsByProposal),
                'existing_proposal_numbers' => $existingProposalNumbers,
                'existing_mt_project_numbers' => $existingProjectNumbers,
                'existing_reference_project_numbers' => $existingReferenceProjectNumbers,
            ],
        ];
    }

    private function commitRows(array $proposals, array $projects, string $actorId): array
    {
        $created = [
            'proposal_contract_review_ids' => [],
            'proposal_contract_review_project_ids' => [],
            'proposal_project_reference_ids' => [],
        ];

        DB::transaction(function () use ($proposals, $projects, $actorId, &$created) {
            $now = Carbon::now();
            $reviewsByProposalNumber = [];

            foreach ($proposals as $row) {
                $review = $this->createReview($row, $actorId, $now);
                $reviewsByProposalNumber[$review->proposal_number] = $review;
                $created['proposal_contract_review_ids'][] = $review->id;
            }

            foreach ($projects as $row) {
                $proposalNumber = $this->requiredValue($row, 'proposal_number') ?: $this->requiredValue($row, 'proposal_lookup_key');
                $review = $reviewsByProposalNumber[$proposalNumber] ?? null;
                if (! $review) {
                    throw new \RuntimeException("ไม่พบ proposal {$proposalNumber} ระหว่าง import projects");
                }

                $project = $this->createProject($review, $row, $actorId, $now);
                $reference = $this->createReference($review, $project, $row, $now);

                $created['proposal_contract_review_project_ids'][] = $project->id;
                $created['proposal_project_reference_ids'][] = $reference->id;
            }
        });

        return $created;
    }

    private function createReview(array $row, string $actorId, Carbon $now): PostmanProposalContractReview
    {
        $review = new PostmanProposalContractReview();
        $review->project_name = $this->nullableValue($row, 'project_name');
        $review->project_no = $this->nullableValue($row, 'project_no');
        $review->proposal_number = $this->requiredValue($row, 'proposal_number');
        $review->client_name = $this->nullableValue($row, 'client_name');
        $review->city = $this->nullableValue($row, 'city');
        $review->country = $this->nullableValue($row, 'country');
        $review->filled_in_by = $this->nullableValue($row, 'filled_in_by');
        $review->proposal_to_be_submitted = $this->nullableValue($row, 'proposal_to_be_submitted') ?: 'Yes';
        $review->contract_agreed_to_proceed = $this->nullableValue($row, 'contract_agreed_to_proceed') ?: 'Yes';
        $review->status = $this->nullableValue($row, 'status') ?: 'contract_approved';
        $review->payload = $this->payloadJson($row, 'proposal');
        $review->create_by = $actorId;
        $review->update_by = $actorId;
        $review->created_at = $now;
        $review->updated_at = $now;

        $this->setIfColumn($review, 'primary_discipline', $this->nullableValue($row, 'primary_discipline') ?: 'general');
        $this->setIfColumn($review, 'mt_project_no', $this->nullableValue($row, 'mt_project_no'));
        $this->setIfColumn($review, 'project_type', $this->nullableValue($row, 'project_type'));
        $this->setIfColumn($review, 'currency', $this->nullableValue($row, 'currency'));
        $this->setIfColumn($review, 'estimated_total_fees', $this->decimalValue($row, 'estimated_total_fees'));
        $this->setIfColumn($review, 'proposal_decision', $this->nullableValue($row, 'proposal_decision') ?: 'submitted');
        $this->setIfColumn($review, 'win_probability', $this->decimalValue($row, 'win_probability'));
        $this->setIfColumn($review, 'contract_decision', $this->nullableValue($row, 'contract_decision') ?: 'proceed');
        $this->setIfColumn($review, 'need_quality_plan_pqp', $this->nullableValue($row, 'need_quality_plan_pqp'));
        $this->setIfColumn($review, 'submitted_at', $now);
        $this->setIfColumn($review, 'proposal_reviewed_at', $now);
        $this->setIfColumn($review, 'contract_reviewed_at', $now);
        $this->setIfColumn($review, 'completed_at', $now);
        $this->setIfColumn($review, 'revision_no', 0);
        $this->setIfColumn($review, 'revision_label', 'Rev.0');
        $this->setIfColumn($review, 'is_latest_revision', true);
        $this->setIfColumn($review, 'lead_tl', $this->nullableValue($row, 'lead_tl') ?: $this->nullableValue($row, 'mapped_employee_codes'));
        $this->setIfColumn($review, 'tl_name', $this->nullableValue($row, 'tl_name') ?: $this->nullableValue($row, 'mapped_employee_names'));

        $review->save();

        if (Schema::hasColumn($review->getTable(), 'root_review_id')) {
            $review->root_review_id = $review->id;
            $review->save();
        }

        return $review;
    }

    private function createProject(PostmanProposalContractReview $review, array $row, string $actorId, Carbon $now): PostmanProposalContractReviewProject
    {
        $project = new PostmanProposalContractReviewProject();
        $project->proposal_contract_review_id = $review->id;
        $project->proposal_number = $review->proposal_number;
        $project->mt_project_no = $this->requiredValue($row, 'mt_project_no');
        $project->project_no = $this->nullableValue($row, 'project_no') ?: $project->mt_project_no;
        $project->project_name = $this->nullableValue($row, 'project_name') ?: $review->project_name;
        $project->primary_discipline = $this->nullableValue($row, 'primary_discipline') ?: $review->primary_discipline ?: 'general';
        $project->project_type = $this->nullableValue($row, 'project_type') ?: $review->project_type;
        $project->currency = $this->nullableValue($row, 'currency') ?: $review->currency;
        $project->estimated_total_fees = $this->decimalValue($row, 'estimated_total_fees') ?? $review->estimated_total_fees;
        $project->sequence_no = (int) ($this->nullableValue($row, 'sequence_no') ?: 1);
        $project->status = $this->nullableValue($row, 'status') ?: 'active';
        $project->converted_at = $this->dateValue($row, 'converted_at') ?: $now;
        $project->metadata = $this->metadataArray($row);
        $project->create_by = $actorId;
        $project->update_by = $actorId;
        $project->created_at = $now;
        $project->updated_at = $now;
        $project->save();

        return $project;
    }

    private function createReference(PostmanProposalContractReview $review, PostmanProposalContractReviewProject $project, array $row, Carbon $now): ProposalProjectReference
    {
        $reference = new ProposalProjectReference();
        $reference->proposal_contract_review_id = $review->id;
        $reference->proposal_contract_review_project_id = $project->id;
        $reference->proposal_number = $project->proposal_number ?: $review->proposal_number;
        $reference->project_number = $project->project_no ?: $project->mt_project_no;
        $reference->project_name = $project->project_name ?: $review->project_name;
        $reference->status = $project->status ?: 'active';
        $reference->metadata = [
            'source' => 'current_projects_import_api',
            'project_metadata' => $project->metadata,
        ];
        $reference->created_at = $now;
        $reference->updated_at = $now;
        $reference->save();

        return $reference;
    }

    private function setIfColumn($model, string $column, $value): void
    {
        if (Schema::hasColumn($model->getTable(), $column)) {
            $model->{$column} = $value;
        }
    }

    private function payloadJson(array $row, string $kind): string
    {
        $payload = $this->jsonArray($this->nullableValue($row, 'payload')) ?: [];
        $payload['import_source'] = 'current_projects_import_api';
        $payload['import_kind'] = $kind;
        $payload['proposal_number'] = $this->requiredValue($row, 'proposal_number');
        $payload['project_name'] = $this->nullableValue($row, 'project_name');
        $payload['project_no'] = $this->nullableValue($row, 'project_no');
        $payload['mt_project_no'] = $this->nullableValue($row, 'mt_project_no');
        $payload['status'] = $this->nullableValue($row, 'status') ?: 'contract_approved';
        $payload['primary_discipline'] = $this->nullableValue($row, 'primary_discipline') ?: 'general';
        $payload['proposal_decision'] = $this->nullableValue($row, 'proposal_decision') ?: 'submitted';
        $payload['contract_decision'] = $this->nullableValue($row, 'contract_decision') ?: 'proceed';
        $payload['contract_agreed_to_proceed'] = $this->nullableValue($row, 'contract_agreed_to_proceed') ?: 'Yes';

        return json_encode($payload, JSON_UNESCAPED_UNICODE);
    }

    private function metadataArray(array $row): array
    {
        $metadata = $this->jsonArray($this->nullableValue($row, 'metadata')) ?: [];
        $metadata['import_source'] = 'current_projects_import_api';
        $metadata['source_dic_tl'] = $this->nullableValue($row, 'source_dic_tl');
        $metadata['mapped_employee_codes'] = $this->nullableValue($row, 'mapped_employee_codes');
        $metadata['mapped_employee_names'] = $this->nullableValue($row, 'mapped_employee_names');
        $metadata['mapped_user_codes'] = $this->nullableValue($row, 'mapped_user_codes');
        $metadata['unmapped_initials'] = $this->nullableValue($row, 'unmapped_initials');

        return $metadata;
    }

    private function jsonArray(?string $value): ?array
    {
        if ($value === null || trim($value) === '') {
            return null;
        }

        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : null;
    }

    private function dateValue(array $row, string $key): ?Carbon
    {
        $value = $this->nullableValue($row, $key);
        if ($value === null) {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function decimalValue(array $row, string $key): ?float
    {
        $value = $this->nullableValue($row, $key);
        if ($value === null) {
            return null;
        }

        $value = str_replace(',', '', $value);
        return is_numeric($value) ? (float) $value : null;
    }

    private function requiredValue(array $row, string $key): string
    {
        return trim((string) ($row[$key] ?? ''));
    }

    private function nullableValue(array $row, string $key): ?string
    {
        $value = $this->requiredValue($row, $key);
        return $value === '' ? null : $value;
    }

    private function normalizeHeader(?string $value): string
    {
        $value = strtolower(trim((string) $value));
        $value = preg_replace('/[^a-z0-9]+/', '_', $value);
        return trim((string) $value, '_');
    }

    private function cellValue($value): string
    {
        if ($value === null) {
            return '';
        }

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        if (is_scalar($value)) {
            return trim((string) $value);
        }

        return trim((string) json_encode($value, JSON_UNESCAPED_UNICODE));
    }
}
