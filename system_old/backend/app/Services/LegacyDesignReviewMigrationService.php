<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Http\Request;
use PDO;
use RuntimeException;
use Throwable;

class LegacyDesignReviewMigrationService
{
    private const STATUS_LABELS = [
        0 => 'Draft',
        1 => 'VVE to review',
        2 => 'TE to response',
        3 => 'VVE to approve',
        4 => 'TL to review',
        5 => 'DI to acknowledge',
        6 => 'Completed',
        7 => 'Closed',
    ];

    private const STAGES = [
        'peer-review' => ['label' => 'Peer Review', 'table' => 'tb_PeerReview', 'idColumn' => 'PeerReview_ID', 'webboardTable' => 'tb_Webboard_Peer', 'scoreCount' => 8],
        'design-criteria-report' => ['label' => 'Design Criteria Report', 'table' => 'tb_Brief', 'idColumn' => 'Brief_ID', 'webboardTable' => 'tb_Webboard_Brief', 'scoreCount' => 11],
        'submission' => ['label' => 'Submission', 'table' => 'tb_Submission', 'idColumn' => 'Submission_ID', 'webboardTable' => 'tb_Webboard_Sub', 'scoreCount' => 11],
        'tender-design-review' => ['label' => 'Tender Design Review', 'table' => 'tb_TenderDesignReview', 'idColumn' => 'TenderDes_ID', 'webboardTable' => 'tb_Webboard_TenderRev', 'scoreCount' => 11],
        'tender-design-verification' => ['label' => 'Tender Design Verification', 'table' => 'tb_TenderVerification', 'idColumn' => 'TenderVer_ID', 'webboardTable' => 'tb_Webboard_TenderVer', 'scoreCount' => 13],
        'construction' => ['label' => 'Construction', 'table' => 'tb_Construction', 'idColumn' => 'Construction_ID', 'webboardTable' => 'tb_Webboard_Constr', 'scoreCount' => 13],
        '23-mtea-01' => ['label' => '23-MTEA-01', 'table' => 'tb_23MTEA', 'idColumn' => 'mtea_ID', 'webboardTable' => 'tb_Webboard_23mtea01', 'scoreCount' => 9],
        '24-mtve-01' => ['label' => '24-MTVE-01', 'table' => 'tb_24MTVE', 'idColumn' => 'mtve_ID', 'webboardTable' => 'tb_Webboard_24mtve01', 'scoreCount' => 12],
    ];

    private const TARGET_RULES = [
        'DB_DesignReview:peer-review' => ['sourceSystem' => 'designreview_new', 'module' => 'schematic_design_review', 'table' => 'schematic_design_reviews', 'route' => '/schematic-design-review', 'formType' => 'mtdd02'],
        'DB_DesignReview:design-criteria-report' => ['sourceSystem' => 'designreview_new', 'module' => 'concept_design_review', 'table' => 'concept_design_reviews', 'route' => '/concept-design-review', 'formType' => 'mtdd01'],
        'DB_DesignReview:submission' => ['sourceSystem' => 'designreview_new', 'module' => 'submission_review', 'table' => 'submission_reviews', 'route' => '/submission-review', 'formType' => 'mtdd03'],
        'DB_DesignReview:tender-design-review' => ['sourceSystem' => 'designreview_new', 'module' => 'tender_csa_review', 'table' => 'tender_csa_reviews', 'route' => '/tender-csa-review', 'formType' => 'tender-csa-review'],
        'DB_DesignReview:tender-design-verification' => ['sourceSystem' => 'designreview_new', 'module' => 'tender_csa_verification', 'table' => 'tender_csa_verifications', 'route' => '/tender-csa-verification', 'formType' => 'tender-csa-verification'],
        'DB_DesignReview:construction' => ['sourceSystem' => 'designreview_new', 'module' => 'construction_validation', 'table' => 'construction_validations', 'route' => '/construction-validation', 'formType' => 'construction-validation'],
        'DB_DesignReview:23-mtea-01' => ['sourceSystem' => 'designreview_new', 'module' => 'engineering_audit_review', 'table' => 'engineering_audit_reviews', 'route' => '/engineering-audit-review', 'formType' => 'engineering-audit-review'],
        'DB_DesignReview:24-mtve-01' => ['sourceSystem' => 'designreview_new', 'module' => 'value_engineering_review', 'table' => 'value_engineering_reviews', 'route' => '/value-engineering', 'formType' => 'value-engineering-review'],
        'ReviewOnline:tender-design-review' => ['sourceSystem' => 'designreview', 'module' => 'tender_mep_review', 'table' => 'tender_mep_reviews', 'route' => '/tender-mep-review', 'formType' => 'tender-mep-review'],
        'ReviewOnline:tender-design-verification' => ['sourceSystem' => 'designreview', 'module' => 'tender_mep_verification', 'table' => 'tender_mep_verifications', 'route' => '/tender-mep-verification', 'formType' => 'tender-mep-verification'],
    ];

    private const TARGET_MODULE_LABELS = [
        'concept_design_review' => 'Concept Design Review',
        'schematic_design_review' => 'Schematic Design Review',
        'submission_review' => 'Submission Review',
        'tender_csa_review' => 'Tender CSA Review',
        'tender_csa_verification' => 'Tender CSA Verification',
        'tender_mep_review' => 'Tender MEP Review',
        'tender_mep_verification' => 'Tender MEP Verification',
        'construction_validation' => 'Construction Validation',
        'engineering_audit_review' => 'Engineering Audit Review',
        'value_engineering_review' => 'Value Engineering Review',
    ];

    private array $connections = [];

    public function sync(array $options = []): array
    {
        $limit = max(1, min((int) ($options['limit'] ?? 500), 5000));
        $stageFilter = trim((string) ($options['stage'] ?? ''));
        $sourceFilter = trim((string) ($options['source_database'] ?? ''));
        $activeOnly = ($options['status'] ?? 'active') !== 'all';
        $created = 0;
        $updated = 0;
        $errors = [];

        foreach (self::TARGET_RULES as $ruleKey => $target) {
            [$sourceDatabase, $stageKey] = explode(':', $ruleKey, 2);
            if ($stageFilter !== '' && $stageFilter !== $stageKey) {
                continue;
            }
            if ($sourceFilter !== '' && $sourceFilter !== $sourceDatabase) {
                continue;
            }

            try {
                foreach ($this->stageRows($sourceDatabase, $stageKey, $limit, $activeOnly) as $row) {
                    $detail = $this->itemDetail($sourceDatabase, $stageKey, (int) $row['id']);
                    if (! $detail) {
                        continue;
                    }

                    $exists = DB::table('legacy_design_review_sync_records')
                        ->where('source_database', $sourceDatabase)
                        ->where('source_table', $detail['source']['table'])
                        ->where('source_id', (string) $detail['id'])
                        ->first();

                    $payload = [
                        'source_system' => $target['sourceSystem'],
                        'source_database' => $sourceDatabase,
                        'source_stage' => $stageKey,
                        'source_table' => $detail['source']['table'],
                        'source_id' => (string) $detail['id'],
                        'project_no' => $detail['project']['id'] ?? null,
                        'project_name' => $detail['project']['name'] ?? null,
                        'discipline' => $detail['discipline']['name'] ?? null,
                        'legacy_status_code' => $detail['status']['code'] ?? null,
                        'legacy_status_label' => $detail['status']['label'] ?? null,
                        'target_module' => $target['module'],
                        'target_table' => $target['table'],
                        'target_route' => $target['route'],
                        'sync_status' => 'synced',
                        'raw_payload' => json_encode($detail, JSON_UNESCAPED_UNICODE),
                        'synced_at' => now(),
                        'updated_at' => now(),
                    ];

                    if ($exists) {
                        DB::table('legacy_design_review_sync_records')->where('id', $exists->id)->update($payload);
                        $updated++;
                    } else {
                        $payload['created_at'] = now();
                        DB::table('legacy_design_review_sync_records')->insert($payload);
                        $created++;
                    }
                }
            } catch (Throwable $e) {
                $errors[] = "{$sourceDatabase}:{$stageKey} {$e->getMessage()}";
            }
        }

        return $this->summary(['created' => $created, 'updated' => $updated, 'errors' => $errors]);
    }

    public function mapUsers(array $options = []): array
    {
        $sourceFilter = trim((string) ($options['source_database'] ?? ''));
        $employeesByEmail = $this->employeesByNormalizedEmail();
        $usage = $this->legacyUserUsage();
        $created = 0;
        $updated = 0;
        $matched = 0;
        $unmatched = 0;
        $ambiguous = 0;

        foreach ($this->sourceDatabases() as $sourceDatabase) {
            if ($sourceFilter !== '' && $sourceFilter !== $sourceDatabase) {
                continue;
            }

            foreach ($this->legacyUsers($sourceDatabase) as $legacyUser) {
                $normalized = $this->normalizeEmail($legacyUser['EmailAddress'] ?? null);
                $matches = $normalized ? ($employeesByEmail[$normalized] ?? []) : [];
                $status = 'unmatched';
                $method = null;
                $employee = null;

                if (count($matches) === 1) {
                    $status = 'matched';
                    $method = 'normalized_email';
                    $employee = $matches[0];
                    $matched++;
                } elseif (count($matches) > 1) {
                    $status = 'ambiguous';
                    $method = 'normalized_email';
                    $ambiguous++;
                } else {
                    $unmatched++;
                }

                $key = $sourceDatabase . ':' . (int) $legacyUser['UserID'];
                $payload = [
                    'source_database' => $sourceDatabase,
                    'legacy_user_id' => (int) $legacyUser['UserID'],
                    'legacy_username' => $this->cleanText($legacyUser['User_Name'] ?? null),
                    'legacy_fullname' => $this->cleanText($legacyUser['FullName'] ?? null),
                    'legacy_email' => $this->cleanText($legacyUser['EmailAddress'] ?? null),
                    'normalized_email' => $normalized,
                    'employee_id' => $employee ? (int) $employee->id : null,
                    'employee_code' => $employee->code ?? null,
                    'employee_name' => $employee ? trim(($employee->firstname ?? '') . ' ' . ($employee->lastname ?? '')) : null,
                    'employee_email' => $employee->email ?? null,
                    'mapping_status' => $status,
                    'match_method' => $method,
                    'match_count' => count($matches),
                    'usage_count' => $usage[$key] ?? 0,
                    'verified_at' => $status === 'matched' ? now() : null,
                    'updated_at' => now(),
                ];

                $exists = DB::table('legacy_design_review_user_mappings')
                    ->where('source_database', $sourceDatabase)
                    ->where('legacy_user_id', (int) $legacyUser['UserID'])
                    ->first();

                if ($exists) {
                    DB::table('legacy_design_review_user_mappings')->where('id', $exists->id)->update($payload);
                    $updated++;
                } else {
                    $payload['created_at'] = now();
                    DB::table('legacy_design_review_user_mappings')->insert($payload);
                    $created++;
                }
            }
        }

        $this->refreshSyncUserMappingStatus();

        return $this->summary(compact('created', 'updated', 'matched', 'unmatched', 'ambiguous'));
    }

    public function generate(array $options = []): array
    {
        $limit = max(1, min((int) ($options['limit'] ?? 200), 1000));
        $stageFilter = trim((string) ($options['stage'] ?? ''));
        $sourceFilter = trim((string) ($options['source_database'] ?? ''));
        $generated = 0;
        $skipped = 0;
        $errors = [];

        $query = DB::table('legacy_design_review_sync_records')
            ->whereNull('generated_id')
            ->where('user_mapping_status', 'matched')
            ->orderBy('id')
            ->limit($limit);

        if ($stageFilter !== '') {
            $query->where('source_stage', $stageFilter);
        }
        if ($sourceFilter !== '') {
            $query->where('source_database', $sourceFilter);
        }

        foreach ($query->get() as $record) {
            try {
                $raw = json_decode($record->raw_payload ?? '{}', true);
                if (! is_array($raw) || empty($record->target_table) || ! Schema::hasTable($record->target_table)) {
                    $skipped++;
                    continue;
                }

                $payload = $this->buildTargetPayload($record, $raw);
                $columns = array_flip(Schema::getColumnListing($record->target_table));
                $insert = [];

                foreach ($payload as $key => $value) {
                    if (isset($columns[$key])) {
                        $insert[$key] = is_array($value) ? json_encode($value, JSON_UNESCAPED_UNICODE) : $value;
                    }
                }

                $insert['payload'] = json_encode($payload, JSON_UNESCAPED_UNICODE);
                $insert['create_by'] = 'legacy-sync';
                $insert['update_by'] = 'legacy-sync';
                $insert['created_at'] = now();
                $insert['updated_at'] = now();

                $generatedId = DB::table($record->target_table)->insertGetId($insert);
                DB::table('legacy_design_review_sync_records')->where('id', $record->id)->update([
                    'generate_status' => 'generated',
                    'generated_table' => $record->target_table,
                    'generated_id' => $generatedId,
                    'mapped_payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                    'generated_at' => now(),
                    'updated_at' => now(),
                ]);
                $generated++;
            } catch (Throwable $e) {
                DB::table('legacy_design_review_sync_records')->where('id', $record->id)->update([
                    'generate_status' => 'error',
                    'updated_at' => now(),
                ]);
                $errors[] = "sync {$record->id}: {$e->getMessage()}";
            }
        }

        return $this->summary(compact('generated', 'skipped', 'errors'));
    }

    public function summary(array $extra = []): array
    {
        if (! Schema::hasTable('legacy_design_review_sync_records') || ! Schema::hasTable('legacy_design_review_user_mappings')) {
            return array_merge([
                'sync' => [
                    'total' => 0,
                    'userMatched' => 0,
                    'generated' => 0,
                ],
                'users' => [
                    'total' => 0,
                    'matched' => 0,
                    'unmatched' => 0,
                    'ambiguous' => 0,
                ],
                'ready' => false,
            ], $extra);
        }

        $sync = DB::table('legacy_design_review_sync_records')
            ->selectRaw('COUNT(*) AS total')
            ->selectRaw("SUM(CASE WHEN generated_id IS NOT NULL THEN 1 ELSE 0 END) AS generated_count")
            ->selectRaw("SUM(CASE WHEN user_mapping_status = 'matched' THEN 1 ELSE 0 END) AS user_matched")
            ->first();

        $users = DB::table('legacy_design_review_user_mappings')
            ->selectRaw('COUNT(*) AS total')
            ->selectRaw("SUM(CASE WHEN mapping_status = 'matched' THEN 1 ELSE 0 END) AS matched")
            ->selectRaw("SUM(CASE WHEN mapping_status = 'unmatched' THEN 1 ELSE 0 END) AS unmatched")
            ->selectRaw("SUM(CASE WHEN mapping_status = 'ambiguous' THEN 1 ELSE 0 END) AS ambiguous")
            ->first();

        return array_merge([
            'sync' => [
                'total' => (int) ($sync->total ?? 0),
                'userMatched' => (int) ($sync->user_matched ?? 0),
                'generated' => (int) ($sync->generated_count ?? 0),
            ],
            'users' => [
                'total' => (int) ($users->total ?? 0),
                'matched' => (int) ($users->matched ?? 0),
                'unmatched' => (int) ($users->unmatched ?? 0),
                'ambiguous' => (int) ($users->ambiguous ?? 0),
            ],
            'ready' => true,
        ], $extra);
    }

    public function completedRecordTypes(): array
    {
        if (! Schema::hasTable('legacy_design_review_sync_records')) {
            return [];
        }

        return DB::table('legacy_design_review_sync_records')
            ->select('target_module', 'source_stage')
            ->selectRaw('COUNT(*) AS total')
            ->where(function ($query) {
                $this->applyCompletedLegacyStatus($query);
            })
            ->groupBy('target_module', 'source_stage')
            ->orderBy('target_module')
            ->orderBy('source_stage')
            ->get()
            ->map(function ($row) {
                $value = $row->target_module ?: $row->source_stage;

                return [
                    'value' => $value,
                    'label' => $this->targetModuleLabel($value),
                    'sourceStage' => $row->source_stage,
                    'sourceStageLabel' => $this->stageLabel($row->source_stage),
                    'total' => (int) ($row->total ?? 0),
                ];
            })
            ->values()
            ->all();
    }

    public function completedRecordsPage(Request $request): array
    {
        $draw = max(1, (int) $request->input('draw', 1));

        if (! Schema::hasTable('legacy_design_review_sync_records')) {
            return [
                'draw' => $draw,
                'recordsTotal' => 0,
                'recordsFiltered' => 0,
                'data' => [],
            ];
        }

        $start = max(0, (int) $request->input('start', 0));
        $length = max(1, min((int) $request->input('length', 10), 100));
        $type = trim((string) $request->input('type', ''));
        $search = trim((string) $request->input('search.value', $request->input('search', '')));

        $query = DB::table('legacy_design_review_sync_records')
            ->where(function ($q) {
                $this->applyCompletedLegacyStatus($q);
            });

        $recordsTotal = (clone $query)->count();

        if ($type !== '') {
            $query->where(function ($q) use ($type) {
                $q->where('target_module', $type)
                    ->orWhere('source_stage', $type);
            });
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                foreach ([
                    'source_database',
                    'source_stage',
                    'source_table',
                    'source_id',
                    'project_no',
                    'project_name',
                    'discipline',
                    'legacy_status_label',
                    'target_module',
                    'target_table',
                    'sync_status',
                    'user_mapping_status',
                    'generate_status',
                    'generated_table',
                    'generated_id',
                ] as $column) {
                    $q->orWhere($column, 'like', '%' . $search . '%');
                }
            });
        }

        $recordsFiltered = (clone $query)->count();
        $this->applyCompletedRecordsOrdering($query, $request);

        $rows = $query
            ->skip($start)
            ->take($length)
            ->get()
            ->values()
            ->map(function ($record, $index) use ($start) {
                return $this->transformCompletedRecord($record, $start + $index + 1);
            })
            ->all();

        return [
            'draw' => $draw,
            'recordsTotal' => $recordsTotal,
            'recordsFiltered' => $recordsFiltered,
            'data' => $rows,
        ];
    }

    private function buildTargetPayload($record, array $raw): array
    {
        $people = $raw['people'] ?? [];
        $reviewer = $this->mappedEmployee($record->source_database, $people['reviewer']['id'] ?? null);
        $respondedBy = $this->mappedEmployee($record->source_database, $people['respondedBy']['id'] ?? null);
        $teamlead = $this->mappedEmployee($record->source_database, $people['teamlead']['id'] ?? null);
        $director = $this->mappedEmployee($record->source_database, $people['director']['id'] ?? null);
        $dates = $raw['dates'] ?? [];
        $statusCode = (int) ($raw['status']['code'] ?? -1);
        $checklist = $this->checklistResponses($raw);
        $legacyPath = "/legacy-design-review/{$record->source_stage}/{$record->source_id}";

        $payload = [
            'form_type' => $this->targetRule($record->source_database, $record->source_stage)['formType'] ?? null,
            'project_id' => null,
            'project_name' => $raw['project']['name'] ?? $record->project_name,
            'project_number' => $raw['project']['id'] ?? $record->project_no,
            'stage' => $raw['stage'] ?? self::STAGES[$record->source_stage]['label'] ?? $record->source_stage,
            'prepared_by' => $respondedBy,
            'discipline' => $raw['discipline']['name'] ?? $record->discipline,
            'document_types' => $raw['documents'] ?? [],
            'document_types_other' => $raw['documentOther'] ?? null,
            'document_location' => $raw['fileLocation'] ?? null,
            'reviewed_by' => $reviewer,
            'reviewed_by_date' => $this->dateTime($dates['reviewed'] ?? null),
            'reviewed_by_status' => $this->stepStatus($statusCode, 1, $dates['reviewed'] ?? null),
            'responded_by' => $respondedBy,
            'responded_by_date' => $this->dateTime($dates['responded'] ?? null),
            'responded_by_status' => $this->stepStatus($statusCode, 2, $dates['responded'] ?? null),
            'signed_by' => $reviewer,
            'signed_by_date' => $this->dateTime($dates['approved'] ?? null),
            'signed_by_status' => $this->stepStatus($statusCode, 3, $dates['approved'] ?? null),
            'signed_by_vve' => $reviewer,
            'signed_by_vve_date' => $this->dateTime($dates['approved'] ?? null),
            'signed_by_vve_status' => $this->stepStatus($statusCode, 3, $dates['approved'] ?? null),
            'signed_by_tl' => $record->target_table === 'concept_design_reviews' || $record->target_table === 'schematic_design_reviews' || $record->target_table === 'submission_reviews' ? $reviewer : $teamlead,
            'signed_by_tl_date' => $this->dateTime(($record->target_table === 'concept_design_reviews' || $record->target_table === 'schematic_design_reviews' || $record->target_table === 'submission_reviews') ? ($dates['approved'] ?? null) : ($dates['teamleadReviewed'] ?? null)),
            'signed_by_tl_status' => $this->stepStatus($statusCode, ($record->target_table === 'concept_design_reviews' || $record->target_table === 'schematic_design_reviews' || $record->target_table === 'submission_reviews') ? 3 : 4, ($record->target_table === 'concept_design_reviews' || $record->target_table === 'schematic_design_reviews' || $record->target_table === 'submission_reviews') ? ($dates['approved'] ?? null) : ($dates['teamleadReviewed'] ?? null)),
            'signed_by_tl2' => $teamlead,
            'signed_by_tl2_date' => $this->dateTime($dates['teamleadReviewed'] ?? null),
            'signed_by_tl2_status' => $this->stepStatus($statusCode, 4, $dates['teamleadReviewed'] ?? null),
            'acknowledged_by' => $director,
            'acknowledged_by_date' => $this->dateTime($dates['acknowledged'] ?? null),
            'acknowledged_by_status' => $this->stepStatus($statusCode, 5, $dates['acknowledged'] ?? null),
            'acknowledged_by_tl' => $teamlead,
            'acknowledged_by_tl_date' => $this->dateTime($dates['teamleadReviewed'] ?? null),
            'acknowledged_by_tl_status' => $this->stepStatus($statusCode, 4, $dates['teamleadReviewed'] ?? null),
            'acknowledged_by_di' => $director,
            'acknowledged_by_di_date' => $this->dateTime($dates['acknowledged'] ?? null),
            'acknowledged_by_di_status' => $this->stepStatus($statusCode, 5, $dates['acknowledged'] ?? null),
            'checklist_responses' => $checklist,
            'comments' => $raw['comment'] ?? null,
            'recommended_actions_satisfactorily_taken' => (int) ($raw['satisfactorily'] ?? 0) === 1,
            'note' => $raw['recommend'] ?? ($raw['note'] ?? null),
            'attachments' => [],
            'drive_paths' => [],
            'status' => $this->newStatus($statusCode),
            'legacy_source' => [
                'is_legacy' => true,
                'source_database' => $record->source_database,
                'source_system' => $record->source_system,
                'source_stage' => $record->source_stage,
                'source_table' => $record->source_table,
                'source_id' => $record->source_id,
                'legacy_status_code' => $record->legacy_status_code,
                'legacy_status_label' => $record->legacy_status_label,
                'legacy_view_path' => $legacyPath,
                'verification_status' => 'needs_review',
            ],
            'is_legacy' => true,
            'legacy_status_label' => $record->legacy_status_label,
            'legacy_view_path' => $legacyPath,
            'verification_status' => 'needs_review',
        ];

        $payload['signed_by_t_l'] = $payload['signed_by_tl'];
        $payload['signed_by_t_l_date'] = $payload['signed_by_tl_date'];
        $payload['signed_by_t_l_status'] = $payload['signed_by_tl_status'];
        $payload['signed_by_t_l2'] = $payload['signed_by_tl2'];
        $payload['signed_by_t_l2_date'] = $payload['signed_by_tl2_date'];
        $payload['signed_by_t_l2_status'] = $payload['signed_by_tl2_status'];

        return $payload;
    }

    private function stageRows(string $sourceDatabase, string $stageKey, int $limit, bool $activeOnly): array
    {
        $stage = $this->stageConfig($stageKey);
        $where = $activeOnly ? 'WHERE main.Status NOT IN (0, 6)' : '';

        return $this->fetchAll($sourceDatabase, "
            SELECT TOP {$limit}
                main.{$stage['idColumn']} AS id
            FROM dbo.{$stage['table']} main
            {$where}
            ORDER BY main.Create_Date ASC, main.{$stage['idColumn']} ASC
        ");
    }

    private function itemDetail(string $sourceDatabase, string $stageKey, int $id): ?array
    {
        $stage = $this->stageConfig($stageKey);
        $row = $this->fetchOne($sourceDatabase, "
            SELECT
                main.*,
                p.Project_Name AS Project_Name,
                d.Discipline_Name AS Discipline_Name,
                te.FullName AS PreparedBy,
                rv.FullName AS Reviewer,
                tl.FullName AS Teamlead,
                dir.FullName AS Director
            FROM dbo.{$stage['table']} main
            LEFT JOIN dbo.tb_Project p ON p.ProjectID = main.ProjectID
            LEFT JOIN dbo.tb_Discipline d ON d.Discipline_ID = main.Discipline_ID
            LEFT JOIN dbo.tb_User te ON te.UserID = main.UserID
            LEFT JOIN dbo.tb_User rv ON rv.UserID = main.Reviewer_ID
            LEFT JOIN dbo.tb_User tl ON tl.UserID = main.Teamlead_ID
            LEFT JOIN dbo.tb_User dir ON dir.UserID = main.Director_ID
            WHERE main.{$stage['idColumn']} = ?
        ", [$id]);

        if (! $row) {
            return null;
        }

        return [
            'id' => (int) $row[$stage['idColumn']],
            'stageKey' => $stageKey,
            'stage' => $stage['label'],
            'source' => ['database' => $sourceDatabase, 'table' => $stage['table'], 'idColumn' => $stage['idColumn']],
            'project' => ['id' => $row['ProjectID'] ?? null, 'name' => $row['Project_Name'] ?? null],
            'preparedBy' => $this->cleanText($row['PreparedBy'] ?? null),
            'fileLocation' => $row['File_Location'] ?? null,
            'discipline' => ['id' => isset($row['Discipline_ID']) ? (int) $row['Discipline_ID'] : null, 'name' => $row['Discipline_Name'] ?? null, 'other' => $row['Discipline_Other'] ?? null],
            'documents' => $this->splitLegacyList($row['Documents'] ?? null),
            'documentOther' => $row['Document_Other'] ?? null,
            'scores' => $this->scores($row, (int) $stage['scoreCount']),
            'comment' => $row['Comment'] ?? null,
            'recommend' => $row['Recommend'] ?? null,
            'note' => $row['Note'] ?? null,
            'satisfactorily' => $row['Satisfactorily'] ?? null,
            'people' => [
                'reviewer' => $this->personPayload($row['Reviewer_ID'] ?? null, $row['Reviewer'] ?? null, $row['Review_Date'] ?? null),
                'respondedBy' => $this->personPayload($row['UserID'] ?? null, $row['PreparedBy'] ?? null, $row['Response_Date'] ?? null),
                'teamlead' => $this->personPayload($row['Teamlead_ID'] ?? null, $row['Teamlead'] ?? null, $row['TL_Review_Date'] ?? null),
                'director' => $this->personPayload($row['Director_ID'] ?? null, $row['Director'] ?? null, $row['Acknow_Date'] ?? null),
            ],
            'dates' => [
                'created' => $this->dateOnly($row['Create_Date'] ?? null),
                'reviewed' => $this->dateOnly($row['Review_Date'] ?? null),
                'responded' => $this->dateOnly($row['Response_Date'] ?? null),
                'approved' => $this->dateOnly($row['App_Date'] ?? null),
                'teamleadReviewed' => $this->dateOnly($row['TL_Review_Date'] ?? null),
                'acknowledged' => $this->dateOnly($row['Acknow_Date'] ?? null),
            ],
            'status' => $this->statusPayload($row['Status'] ?? null),
        ];
    }

    private function legacyUsers(string $sourceDatabase): array
    {
        return $this->fetchAll($sourceDatabase, "
            SELECT UserID, User_Name, FullName, EmailAddress, User_Status
            FROM dbo.tb_User
            ORDER BY UserID ASC
        ");
    }

    private function refreshSyncUserMappingStatus(): void
    {
        foreach (DB::table('legacy_design_review_sync_records')->get(['id', 'source_database', 'raw_payload']) as $record) {
            $raw = json_decode($record->raw_payload ?? '{}', true);
            $ids = array_filter([
                $raw['people']['reviewer']['id'] ?? null,
                $raw['people']['respondedBy']['id'] ?? null,
                $raw['people']['teamlead']['id'] ?? null,
                $raw['people']['director']['id'] ?? null,
            ], fn ($id) => $id !== null && $id !== '');

            $matched = 0;
            foreach ($ids as $id) {
                $matched += DB::table('legacy_design_review_user_mappings')
                    ->where('source_database', $record->source_database)
                    ->where('legacy_user_id', (int) $id)
                    ->where('mapping_status', 'matched')
                    ->count();
            }

            DB::table('legacy_design_review_sync_records')->where('id', $record->id)->update([
                'user_mapping_status' => count($ids) > 0 && $matched === count($ids) ? 'matched' : 'needs_review',
                'updated_at' => now(),
            ]);
        }
    }

    private function legacyUserUsage(): array
    {
        $usage = [];
        foreach (DB::table('legacy_design_review_sync_records')->get(['source_database', 'raw_payload']) as $record) {
            $raw = json_decode($record->raw_payload ?? '{}', true);
            foreach (['reviewer', 'respondedBy', 'teamlead', 'director'] as $role) {
                $id = $raw['people'][$role]['id'] ?? null;
                if ($id !== null && $id !== '') {
                    $key = $record->source_database . ':' . (int) $id;
                    $usage[$key] = ($usage[$key] ?? 0) + 1;
                }
            }
        }
        return $usage;
    }

    private function mappedEmployee(string $sourceDatabase, $legacyUserId): ?string
    {
        if ($legacyUserId === null || $legacyUserId === '') {
            return null;
        }

        return DB::table('legacy_design_review_user_mappings')
            ->where('source_database', $sourceDatabase)
            ->where('legacy_user_id', (int) $legacyUserId)
            ->where('mapping_status', 'matched')
            ->value('employee_code');
    }

    private function employeesByNormalizedEmail(): array
    {
        $groups = [];
        foreach (DB::table('employees')->whereNull('deleted_at')->get(['id', 'code', 'firstname', 'lastname', 'email', 'active']) as $employee) {
            $normalized = $this->normalizeEmail($employee->email ?? null);
            if ($normalized) {
                $groups[$normalized][] = $employee;
            }
        }
        return $groups;
    }

    private function sourceDatabases(): array
    {
        return array_values(array_unique(array_map(fn ($rule) => explode(':', $rule, 2)[0], array_keys(self::TARGET_RULES))));
    }

    private function targetRule(string $sourceDatabase, string $stageKey): array
    {
        return self::TARGET_RULES["{$sourceDatabase}:{$stageKey}"] ?? [];
    }

    private function stageConfig(string $stageKey): array
    {
        if (! isset(self::STAGES[$stageKey])) {
            throw new RuntimeException("Unsupported legacy stage {$stageKey}");
        }
        return self::STAGES[$stageKey];
    }

    private function pdo(string $database): PDO
    {
        if (isset($this->connections[$database])) {
            return $this->connections[$database];
        }

        $host = config('legacy_design_review.host');
        $port = config('legacy_design_review.port');
        $username = config('legacy_design_review.username');
        $password = config('legacy_design_review.password');
        $tdsVersion = config('legacy_design_review.tds_version', '7.0');

        putenv('TDSVER=' . $tdsVersion);
        $dsn = "dblib:host={$host}:{$port};dbname={$database};charset=UTF-8";

        return $this->connections[$database] = new PDO($dsn, $username, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }

    private function fetchAll(string $database, string $sql, array $params = []): array
    {
        $statement = $this->pdo($database)->prepare($sql);
        $statement->execute($params);
        return $statement->fetchAll();
    }

    private function fetchOne(string $database, string $sql, array $params = []): ?array
    {
        $statement = $this->pdo($database)->prepare($sql);
        $statement->execute($params);
        $row = $statement->fetch();
        return $row ?: null;
    }

    private function checklistResponses(array $raw): array
    {
        $responses = [];
        foreach (($raw['scores'] ?? []) as $key => $value) {
            $number = preg_replace('/\D+/', '', (string) $key);
            $responses[] = [
                'id' => $number ?: (string) (count($responses) + 1),
                'question' => "Legacy checklist {$number}",
                'response' => $value === null ? '' : ($value ? 'yes' : 'no'),
            ];
        }
        return $responses;
    }

    private function stepStatus(int $statusCode, int $step, ?string $date): string
    {
        if ($date || $statusCode > $step || $statusCode === 6) {
            return 'approve';
        }
        return 'pending';
    }

    private function newStatus(int $statusCode): string
    {
        if ($statusCode >= 6) {
            return 'completed';
        }
        if ($statusCode >= 4) {
            return 'signed';
        }
        if ($statusCode >= 3) {
            return 'responded';
        }
        if ($statusCode >= 1) {
            return 'in_review';
        }
        return 'draft';
    }

    private function applyCompletedLegacyStatus($query): void
    {
        $query->where('legacy_status_code', 6)
            ->orWhereRaw("LOWER(COALESCE(legacy_status_label, '')) = ?", ['completed']);
    }

    private function applyCompletedRecordsOrdering($query, Request $request): void
    {
        $columns = [
            0 => 'id',
            1 => 'target_module',
            2 => 'project_no',
            3 => 'project_name',
            4 => 'discipline',
            5 => 'source_database',
            6 => 'source_id',
            7 => 'legacy_status_label',
            8 => 'synced_at',
            9 => 'generated_at',
        ];

        $columnIndex = (int) $request->input('order.0.column', 8);
        $direction = strtolower((string) $request->input('order.0.dir', 'desc')) === 'asc' ? 'asc' : 'desc';
        $column = $columns[$columnIndex] ?? 'synced_at';

        $query->orderBy($column, $direction)->orderBy('id', 'desc');
    }

    private function transformCompletedRecord($record, int $no): array
    {
        $raw = json_decode($record->raw_payload ?? '{}', true);
        $raw = is_array($raw) ? $raw : [];
        $people = $raw['people'] ?? [];
        $dates = $raw['dates'] ?? [];

        return [
            'No' => $no,
            'id' => (int) $record->id,
            'sourceSystem' => $record->source_system,
            'sourceDatabase' => $record->source_database,
            'sourceStage' => $record->source_stage,
            'sourceStageLabel' => $this->stageLabel($record->source_stage),
            'sourceTable' => $record->source_table,
            'sourceId' => $record->source_id,
            'projectNo' => $record->project_no ?: ($raw['project']['id'] ?? null),
            'projectName' => $record->project_name ?: ($raw['project']['name'] ?? null),
            'discipline' => $record->discipline ?: ($raw['discipline']['name'] ?? null),
            'legacyStatusCode' => $record->legacy_status_code,
            'legacyStatusLabel' => $record->legacy_status_label ?: ($raw['status']['label'] ?? null),
            'targetModule' => $record->target_module,
            'targetModuleLabel' => $this->targetModuleLabel($record->target_module ?: $record->source_stage),
            'targetTable' => $record->target_table,
            'targetRoute' => $record->target_route,
            'syncStatus' => $record->sync_status,
            'userMappingStatus' => $record->user_mapping_status,
            'generateStatus' => $record->generate_status,
            'generatedId' => $record->generated_id ? (int) $record->generated_id : null,
            'generatedTable' => $record->generated_table,
            'createdDate' => $dates['created'] ?? null,
            'reviewedDate' => $dates['reviewed'] ?? null,
            'respondedDate' => $dates['responded'] ?? null,
            'approvedDate' => $dates['approved'] ?? null,
            'teamleadReviewedDate' => $dates['teamleadReviewed'] ?? null,
            'acknowledgedDate' => $dates['acknowledged'] ?? null,
            'preparedBy' => $raw['preparedBy'] ?? ($people['respondedBy']['name'] ?? null),
            'reviewer' => $people['reviewer']['name'] ?? null,
            'teamlead' => $people['teamlead']['name'] ?? null,
            'director' => $people['director']['name'] ?? null,
            'syncedAt' => $record->synced_at,
            'generatedAt' => $record->generated_at,
            'createdAt' => $record->created_at,
            'updatedAt' => $record->updated_at,
        ];
    }

    private function targetModuleLabel(?string $value): string
    {
        if (! $value) {
            return '-';
        }

        if (isset(self::TARGET_MODULE_LABELS[$value])) {
            return self::TARGET_MODULE_LABELS[$value];
        }

        return ucwords(str_replace(['_', '-'], ' ', $value));
    }

    private function stageLabel(?string $stageKey): string
    {
        if (! $stageKey) {
            return '-';
        }

        return self::STAGES[$stageKey]['label'] ?? ucwords(str_replace('-', ' ', $stageKey));
    }

    private function statusPayload($code): array
    {
        $intCode = is_numeric($code) ? (int) $code : null;
        return ['code' => $intCode, 'label' => $intCode !== null ? (self::STATUS_LABELS[$intCode] ?? 'Unknown') : 'Unknown'];
    }

    private function personPayload($id, ?string $name, $date): array
    {
        return ['id' => is_numeric($id) ? (int) $id : null, 'name' => $this->cleanText($name), 'date' => $this->dateOnly($date)];
    }

    private function scores(array $row, int $count): array
    {
        $scores = [];
        for ($i = 1; $i <= $count; $i++) {
            $scores['score' . $i] = isset($row['Score' . $i]) ? (int) $row['Score' . $i] === 1 : null;
        }
        return $scores;
    }

    private function splitLegacyList(?string $value): array
    {
        if ($value === null || trim($value) === '') {
            return [];
        }
        return array_values(array_filter(array_map('trim', explode('|', $value)), fn ($item) => $item !== ''));
    }

    private function normalizeEmail(?string $email): ?string
    {
        if ($email === null || trim($email) === '') {
            return null;
        }
        $email = strtolower(preg_replace('/\s+/', '', trim($email)));
        return preg_replace('/(@meinhardt\.net)\d+$/', '$1', $email);
    }

    private function dateOnly($value): ?string
    {
        return $value === null || $value === '' ? null : substr((string) $value, 0, 10);
    }

    private function dateTime(?string $date): ?string
    {
        return $date ? "{$date} 00:00:00" : null;
    }

    private function cleanText(?string $value): ?string
    {
        return $value === null ? null : trim(preg_replace('/\s+/u', ' ', $value));
    }
}
