<?php
namespace App\Http\Controllers;

use App\Models\FeeSheet;
use App\Models\FeeSheetRevision;
use App\Models\FeeAgreement;
use App\Models\ProposalProjectReference;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class FeeSheetController extends Controller
{

    public function store(Request $request)
    {
        return DB::transaction(function () use ($request) {
            $projectReference = $this->resolveProposalProjectReference($request);
            if ($projectReference['response']) {
                return $projectReference['response'];
            }
            $projectReferenceId = $projectReference['id'];

            $feeSheet = FeeSheet::create([
                'mt_project_no'                   => $request->mt_project_no,
                'project_id'                      => $request->project_id,
                'proposal_project_reference_id'   => $projectReferenceId,
            ]);

            $revision = $feeSheet->revisions()->create(
                $this->revisionPayload($request, null, $projectReferenceId, $request->mt_project_no, 0, true)
            );

            $this->replaceRevisionChildren($revision, $request);

            // 5️⃣ Update current_revision_id
            $feeSheet->update([
                'current_revision_id' => $revision->id,
            ]);

            $this->logDocumentCreateAudit($request, $feeSheet);

            return response()->json([
                'fee_sheet_id' => $feeSheet->id,
                'revision_id'  => $revision->id,
                'revision_no'  => 0,
                'message'      => 'Fee Sheet created successfully',
            ]);
        });
    }

    public function update(Request $request, $id)
    {
        if (! is_numeric($id) || $id <= 0) {
            return response()->json([
                'status'  => false,
                'message' => 'Invalid ID provided',
            ], 400);
        }
        $request->validate([
            'mode' => 'required|in:edit_current,new_version',
        ]);

        return DB::transaction(function () use ($request, $id) {
            $feeSheet = FeeSheet::with([
                'currentRevision.teamMembers',
                'currentRevision.feeAgreements.lineItems',
                'currentRevision.jobCostings',
                'currentRevision.billingForecasts',
            ])->find($id);

            if (! $feeSheet) {
                return response()->json([
                    'status'  => false,
                    'message' => "Fee Sheet with ID {$id} not exist",
                ], 404);
            }

            $currentRevision = $feeSheet->currentRevision;
            $oldActionValues = $currentRevision ? $this->feeSheetActionValues($currentRevision) : [];
            $projectReference = $this->resolveProposalProjectReference(
                $request,
                $feeSheet->proposal_project_reference_id,
                $feeSheet->mt_project_no,
                $currentRevision->project_name ?? null
            );
            if ($projectReference['response']) {
                return $projectReference['response'];
            }
            $projectReferenceId = $projectReference['id'];

            if ($request->mode === 'edit_current') {

                $feeSheet->update([
                    'mt_project_no'                 => $request->mt_project_no ?? $feeSheet->mt_project_no,
                    'project_id'                    => $request->project_id ?? $feeSheet->project_id,
                    'proposal_project_reference_id' => $projectReferenceId ?? $feeSheet->proposal_project_reference_id,
                ]);

                $currentRevisionPayload = $this->revisionPayload(
                    $request,
                    $currentRevision,
                    $projectReferenceId ?? $currentRevision->proposal_project_reference_id,
                    $request->mt_project_no ?? $feeSheet->mt_project_no,
                    $currentRevision->rev_no,
                    true
                );
                $currentRevision->update($currentRevisionPayload);
                $revision = $currentRevision;
            } else {
                $currentRevision->update([
                    'is_latest' => false,
                ]);

                $revision = $feeSheet->revisions()->create(
                    $this->revisionPayload(
                        $request,
                        $currentRevision,
                        $projectReferenceId ?? $currentRevision->proposal_project_reference_id,
                        $request->mt_project_no ?? $feeSheet->mt_project_no,
                        $currentRevision->rev_no + 1,
                        true
                    )
                );

                $feeSheet->update([
                    'current_revision_id' => $revision->id,
                    'mt_project_no' => $request->mt_project_no ?? $feeSheet->mt_project_no,
                    'project_id' => $request->project_id ?? $feeSheet->project_id,
                    'proposal_project_reference_id' => $projectReferenceId ?? $feeSheet->proposal_project_reference_id,
                ]);
            }
            $this->replaceRevisionChildren(
                $revision,
                $request,
                $revision->is($currentRevision) ? null : $currentRevision
            );

            if ($revision && $request->mode === 'edit_current') {
                $this->logFeeSheetActionChanges($request, $feeSheet->id, $revision, $oldActionValues);
            }

            return response()->json([
                'fee_sheet_id' => $feeSheet->id,
                'revision_id'  => $revision->id,
                'revision_no'  => $revision->rev_no,
                'mode'         => $request->mode,
                'message'      => 'Fee Sheet updated successfully',
            ]);
        });
    }

    private function feeSheetActionColumns(): array
    {
        return [
            'approved_by_ch_status',
            'status',
        ];
    }

    private function feeSheetActionValues(FeeSheetRevision $revision): array
    {
        $values = [];
        foreach ($this->feeSheetActionColumns() as $column) {
            $values[$column] = $revision->{$column} ?? null;
        }

        return $values;
    }

    private function logFeeSheetActionChanges(Request $request, $feeSheetId, FeeSheetRevision $revision, array $oldValues): void
    {
        $changes = [];
        foreach ($this->feeSheetActionColumns() as $column) {
            $oldValue = $oldValues[$column] ?? null;
            $newValue = $revision->{$column} ?? null;

            if (strtolower(trim((string) $oldValue)) === strtolower(trim((string) $newValue))) {
                continue;
            }

            $changes[$column] = [
                'old' => $oldValue,
                'new' => $newValue,
            ];
        }

        if (empty($changes)) {
            return;
        }

        $changesToLog = isset($changes['approved_by_ch_status'])
            ? ['approved_by_ch_status' => $changes['approved_by_ch_status']]
            : $changes;

        foreach ($changesToLog as $column => $change) {
            $this->logActionRequestAudit(
                $request,
                'fee_sheets',
                $feeSheetId,
                $column,
                $change['old'],
                $change['new'],
                $request->input('comments') ?? $request->input('comment') ?? null
            );
        }
    }

    public function index(Request $request)
    {
        $request->validate([
            'fee_sheet_type'        => 'nullable|string|in:project,facade,lighting,transportation',
            'discipline_id'         => 'nullable|integer|exists:disciplines,id',
            'project_type_id'       => 'nullable|integer|exists:project_types,id',
            'director_in_charge_id' => 'nullable|integer|exists:users,id',
            'search'                => 'nullable|string|max:100',
            'date_from'             => 'nullable|date',
            'date_to'               => 'nullable|date|after_or_equal:date_from',
            'sort_by'               => 'nullable|string|in:created_at,updated_at,proposal_number,mt_project_no,project_name,project_number,project_type,client_name,discipline,nett_fee,status,filled_in_by',
            'sort_direction'        => 'nullable|string|in:asc,desc',
            'per_page'              => 'nullable|integer|in:10,25,50,100',
        ]);

        $query = FeeSheet::with([
            'currentRevision.projectType',
            'currentRevision.discipline',
            'currentRevision.directorInCharge',
            'currentRevision.projectReference',
            'currentRevision.feeAgreements.lineItems',
            'project',
            'projectReference',
        ]);

        $query->when($request->fee_sheet_type, function ($q) use ($request) {
            $q->whereHas('currentRevision', function ($qr) use ($request) {
                $qr->where('fee_sheet_type', $request->fee_sheet_type);
            });
        });

        $query->when($request->discipline_id, function ($q) use ($request) {
            $q->whereHas('currentRevision', function ($qr) use ($request) {
                $qr->where('discipline_id', $request->discipline_id);
            });
        });

        $query->when($request->project_type_id, function ($q) use ($request) {
            $q->whereHas('currentRevision', function ($qr) use ($request) {
                $qr->where('project_type_id', $request->project_type_id);
            });
        });

        $query->when($request->director_in_charge_id, function ($q) use ($request) {
            $q->whereHas('currentRevision', function ($qr) use ($request) {
                $qr->where('director_in_charge_id', $request->director_in_charge_id);
            });
        });

        $query->when($request->date_from, fn($q) =>
            $q->whereDate('created_at', '>=', $request->date_from)
        );

        $query->when($request->date_to, fn($q) =>
            $q->whereDate('created_at', '<=', $request->date_to)
        );

        $query->when($request->search, function ($q) use ($request) {
            $term = '%' . $request->search . '%';

            $q->where(function ($q) use ($term) {
                $q->where('mt_project_no', 'like', $term)
                    ->orWhereHas('currentRevision', function ($qr) use ($term) {
                        $qr->where('project_name', 'like', $term)
                            ->orWhere('client_name', 'like', $term)
                            ->orWhere('contact_name', 'like', $term)
                            ->orWhere('location', 'like', $term);
                    });
            });
        });

        $sortBy = $request->input('sort_by', 'created_at');
        $sortDirection = $request->input('sort_direction', 'desc');
        $this->applyIndexOrdering($query, $sortBy, $sortDirection);

        $perPage   = $request->input('per_page', 25);
        $feeSheets = $query->paginate($perPage)->withQueryString();

        return response()->json([
            'data'  => $feeSheets->items(),
            'meta'  => [
                'current_page' => $feeSheets->currentPage(),
                'per_page'     => $feeSheets->perPage(),
                'total'        => $feeSheets->total(),
                'last_page'    => $feeSheets->lastPage(),
                'from'         => $feeSheets->firstItem(),
                'to'           => $feeSheets->lastItem(),
            ],
            'links' => [
                'first' => $feeSheets->url(1),
                'last'  => $feeSheets->url($feeSheets->lastPage()),
                'prev'  => $feeSheets->previousPageUrl(),
                'next'  => $feeSheets->nextPageUrl(),
            ],
        ]);
    }

    private function applyIndexOrdering($query, string $sortBy, string $direction): void
    {
        $direction = strtolower($direction) === 'asc' ? 'asc' : 'desc';
        $revisionColumns = [
            'project_name' => 'project_name',
            'project_number' => 'mt_project_no',
            'client_name' => 'client_name',
            'status' => 'status',
            'filled_in_by' => 'form_filled_by_id',
            'updated_at' => 'updated_at',
        ];

        if (isset($revisionColumns[$sortBy])) {
            $column = $revisionColumns[$sortBy];
            $query->orderBy(
                FeeSheetRevision::select($column)
                    ->whereColumn('fee_sheet_revisions.id', 'fee_sheets.current_revision_id')
                    ->limit(1),
                $direction
            );
        } elseif ($sortBy === 'proposal_number') {
            $query->orderBy(
                ProposalProjectReference::select('proposal_number')
                    ->whereColumn('proposal_project_references.id', 'fee_sheets.proposal_project_reference_id')
                    ->limit(1),
                $direction
            );
        } elseif (in_array($sortBy, ['project_type', 'discipline'], true)) {
            $relationTable = $sortBy === 'project_type' ? 'project_types' : 'disciplines';
            $foreignKey = $sortBy === 'project_type' ? 'project_type_id' : 'discipline_id';
            $query->orderBy(
                DB::table('fee_sheet_revisions')
                    ->select("{$relationTable}.name")
                    ->leftJoin($relationTable, "{$relationTable}.id", '=', "fee_sheet_revisions.{$foreignKey}")
                    ->whereColumn('fee_sheet_revisions.id', 'fee_sheets.current_revision_id')
                    ->limit(1),
                $direction
            );
        } elseif ($sortBy === 'nett_fee') {
            $query->orderBy(
                FeeAgreement::select('net_fee_excl_vat')
                    ->whereColumn('fee_agreements.revision_id', 'fee_sheets.current_revision_id')
                    ->orderBy('fee_agreements.id')
                    ->limit(1),
                $direction
            );
        } elseif ($sortBy === 'mt_project_no') {
            $query->orderBy('fee_sheets.mt_project_no', $direction);
        } else {
            $query->orderBy('fee_sheets.created_at', $direction);
        }

        $query->orderBy('fee_sheets.id', 'desc');
    }

    public function page(Request $request)
    {
        $request->validate([
            'fee_sheet_type'        => 'nullable|string|in:project,facade,lighting,transportation',
            'discipline_id'         => 'nullable|integer|exists:disciplines,id',
            'project_type_id'       => 'nullable|integer|exists:project_types,id',
            'director_in_charge_id' => 'nullable|integer|exists:users,id',
            'search'                => 'nullable|string|max:100',
            'date_from'             => 'nullable|date',
            'date_to'               => 'nullable|date|after_or_equal:date_from',
            'sort_by'               => 'nullable|string|in:created_at,updated_at,project_name,mt_project_no,client_name',
            'sort_dir'              => 'nullable|string|in:asc,desc',
            'per_page'              => 'nullable|integer|in:10,25,50,100',
        ]);

        $query = FeeSheet::with('currentRevision');

        $query->when($request->fee_sheet_type, function ($q) use ($request) {
            $q->whereHas('currentRevision', function ($sub) use ($request) {
                $sub->where('fee_sheet_type', $request->fee_sheet_type);
            });
        });

        $query->when($request->discipline_id, function ($q) use ($request) {
            $q->whereHas('currentRevision', function ($sub) use ($request) {
                $sub->where('discipline_id', $request->discipline_id);
            });
        });

        $query->when($request->project_type_id, function ($q) use ($request) {
            $q->whereHas('currentRevision', function ($sub) use ($request) {
                $sub->where('project_type_id', $request->project_type_id);
            });
        });

        $query->when($request->director_in_charge_id, function ($q) use ($request) {
            $q->whereHas('currentRevision', function ($sub) use ($request) {
                $sub->where('director_in_charge_id', $request->director_in_charge_id);
            });
        });

        $query->when($request->date_from, fn($q) =>
            $q->whereDate('created_at', '>=', $request->date_from)
        );

        $query->when($request->date_to, fn($q) =>
            $q->whereDate('created_at', '<=', $request->date_to)
        );

        $query->when($request->search, function ($q) use ($request) {

            $term = '%' . $request->search . '%';

            $q->where(function ($main) use ($term) {

                // Search in FeeSheet table
                $main->where('mt_project_no', 'like', $term)

                // OR search in current revision table
                    ->orWhereHas('currentRevision', function ($sub) use ($term) {
                        $sub->where('project_name', 'like', $term)
                            ->orWhere('client_name', 'like', $term)
                            ->orWhere('contact_name', 'like', $term)
                            ->orWhere('location', 'like', $term);
                    });

            });
        });

        $query->orderBy(
            $request->input('sort_by', 'created_at'),
            $request->input('sort_dir', 'desc')
        );

        $data = $query
            ->with([
                'currentRevision.discipline',
                'currentRevision.projectType',
                'currentRevision.directorInCharge',
                'currentRevision.projectReference',
                'currentRevision.feeAgreements.lineItems',
                'projectReference',
            ])
            ->paginate($request->input('per_page', 10))
            ->withQueryString();

        return response()->json([
            'data'  => $data->items(),
            'meta'  => [
                'current_page' => $data->currentPage(),
                'per_page'     => $data->perPage(),
                'total'        => $data->total(),
                'last_page'    => $data->lastPage(),
                'from'         => $data->firstItem(),
                'to'           => $data->lastItem(),
            ],
            'links' => [
                'first' => $data->url(1),
                'last'  => $data->url($data->lastPage()),
                'prev'  => $data->previousPageUrl(),
                'next'  => $data->nextPageUrl(),
            ],
        ]);
    }

    public function show($id)
    {
        if (! is_numeric($id) || $id <= 0) {
            return response()->json([
                'message' => 'Invalid ID provided.',
            ], 400);
        }

        $feeSheet = FeeSheet::with([
            'project',
            'projectReference',
            'currentRevision.projectType',
            'currentRevision.discipline',
            'currentRevision.directorInCharge',
            'currentRevision.projectReference',
            'currentRevision.teamMembers.employee',
            'currentRevision.feeAgreements.lineItems',
            'currentRevision.jobCostings',
            'currentRevision.billingForecasts',
            'revisions.projectType',
            'revisions.discipline',
            'revisions.directorInCharge',
            'revisions.projectReference',
            'revisions.teamMembers.employee',
            'revisions.feeAgreements.lineItems',
            'revisions.jobCostings',
            'revisions.billingForecasts',
        ])->find($id);

        if (! $feeSheet) {
            return response()->json([
                'message' => "Fee sheet with ID {$id} not found.",
            ], 404);
        }

        return response()->json([
            'data' => $this->serializeFeeSheet($feeSheet),
        ]);
    }

    public function destroy($id)
    {
        if (! is_numeric($id) || $id <= 0) {
            return response()->json([
                'message' => 'Invalid ID provided.',
            ], 400);
        }

        $feeSheet = FeeSheet::with('revisions')->find($id);

        if (! $feeSheet) {
            return response()->json([
                'message' => "Fee sheet with ID {$id} not found.",
            ], 404);
        }

        DB::transaction(function () use ($feeSheet) {

            foreach ($feeSheet->revisions as $revision) {

                $revision->teamMembers()->delete();
                $this->deleteRevisionFeeAgreements($revision);
                $revision->jobCostings()->delete();
                $revision->billingForecasts()->delete();

                $revision->delete();
            }

            $feeSheet->delete();
        });

        return response()->json([
            'message' => "Fee sheet with ID {$id} has been deleted.",
            'deleted_at' => $feeSheet->deleted_at,
        ]);
    }

    public function createRevision(Request $request, $feeSheetId)
    {
        return DB::transaction(function () use ($request, $feeSheetId) {

            $feeSheet = FeeSheet::with([
                'currentRevision.teamMembers',
                'currentRevision.feeAgreements.lineItems',
                'currentRevision.jobCostings',
                'currentRevision.billingForecasts',
            ])->findOrFail($feeSheetId);

            $currentRevision = $feeSheet->currentRevision;
            $projectReference = $this->resolveProposalProjectReference(
                $request,
                $currentRevision->proposal_project_reference_id ?? $feeSheet->proposal_project_reference_id,
                $feeSheet->mt_project_no,
                $currentRevision->project_name ?? null
            );
            if ($projectReference['response']) {
                return $projectReference['response'];
            }
            $projectReferenceId = $projectReference['id'];

            $currentRevision->update([
                'is_latest' => false,
            ]);

            $newRevision = $feeSheet->revisions()->create(
                $this->revisionPayload(
                    $request,
                    $currentRevision,
                    $projectReferenceId ?? $currentRevision->proposal_project_reference_id,
                    $request->mt_project_no ?? $feeSheet->mt_project_no,
                    $currentRevision->rev_no + 1,
                    true
                )
            );

            $this->replaceRevisionChildren($newRevision, $request, $currentRevision);

            $feeSheet->update([
                'current_revision_id' => $newRevision->id,
                'mt_project_no' => $request->mt_project_no ?? $feeSheet->mt_project_no,
                'project_id' => $request->project_id ?? $feeSheet->project_id,
                'proposal_project_reference_id' => $projectReferenceId ?? $feeSheet->proposal_project_reference_id,
            ]);

            return response()->json([
                'fee_sheet_id'  => $feeSheet->id,
                'mt_project_no' => $feeSheet->mt_project_no,
                'revision_no'   => $newRevision->rev_no,
                'revision_id'   => $newRevision->id,
                'message'       => 'Revision created successfully',
            ]);
        });
    }

    public function revisions($feeSheetId)
    {
        if (! is_numeric($feeSheetId) || $feeSheetId <= 0) {
            return response()->json([
                'message' => 'Invalid Fee Sheet ID provided.',
            ], 400);
        }

        $feeSheet = FeeSheet::find($feeSheetId);

        if (! $feeSheet) {
            return response()->json([
                'message' => "Fee sheet with ID {$feeSheetId} not found.",
            ], 404);
        }

        $revisions = FeeSheetRevision::with([
            'projectType',
            'discipline',
            'directorInCharge',
            'projectReference',
            'teamMembers.employee',
            'feeAgreements.lineItems',
            'jobCostings',
            'billingForecasts',
        ])
            ->where('fee_sheet_id', $feeSheetId)
            ->orderBy('rev_no')
            ->get()
            ->map(function ($revision) use ($feeSheet) {
                return $this->serializeRevision($revision, $feeSheet);
            });

        return response()->json([
            'data' => $revisions,
        ]);
    }

    public function getRevision($feeSheetId, $revisionNo)
    {
        $revision = FeeSheetRevision::with([
            'projectType',
            'discipline',
            'projectReference',
            'teamMembers.employee',
            'feeAgreements.lineItems',
            'jobCostings',
            'billingForecasts',
            'directorInCharge',
        ])
            ->where('fee_sheet_id', $feeSheetId)
            ->where('rev_no', $revisionNo)
            ->firstOrFail();

        return response()->json([
            'data' => $this->serializeRevision($revision, $revision->feeSheet),
        ]);
    }

    private function revisionPayload(
        Request $request,
        ?FeeSheetRevision $fallback,
        $projectReferenceId,
        $mtProjectNo,
        int $revNo,
        bool $isLatest
    ): array {
        $isNewRevision = ! $fallback || (int) $fallback->rev_no !== $revNo;
        $statusDefault = $isNewRevision ? 'draft' : ($fallback->status ?? 'draft');

        return [
            'rev_no'                        => $revNo,
            'is_latest'                     => $isLatest,
            'fee_sheet_type'                => $this->inputOrFallback($request, 'fee_sheet_type', $fallback->fee_sheet_type ?? 'project'),
            'project_id'                    => $this->inputOrFallback($request, 'project_id', $fallback->project_id ?? null),
            'proposal_project_reference_id' => $projectReferenceId ?? $this->inputOrFallback($request, 'proposal_project_reference_id', $fallback->proposal_project_reference_id ?? null),
            'mt_project_no'                 => $mtProjectNo ?? $this->inputOrFallback($request, 'mt_project_no', $fallback->mt_project_no ?? null),
            'project_name'                  => $this->inputOrFallback($request, 'project_name', $fallback->project_name ?? null),
            'discipline_id'                 => $this->inputOrFallback($request, 'discipline_id', $fallback->discipline_id ?? null),
            'director_in_charge_id'         => $this->inputOrFallback($request, 'director_in_charge_id', $fallback->director_in_charge_id ?? null),
            'client_name'                   => $this->inputOrFallback($request, 'client_name', $fallback->client_name ?? null),
            'location'                      => $this->inputOrFallback($request, 'location', $fallback->location ?? null),
            'mtl_scope_detail'              => $this->inputOrFallback($request, 'mtl_scope_detail', $fallback->mtl_scope_detail ?? null),
            'contact_name'                  => $this->inputOrFallback($request, 'contact_name', $fallback->contact_name ?? null),
            'comment'                       => $this->inputOrFallback($request, 'comment', $fallback->comment ?? null),
            'status'                        => $this->inputOrFallback($request, 'status', $statusDefault),
            'project_type_id'               => $this->inputOrFallback($request, 'project_type_id', $fallback->project_type_id ?? null),
            'form_filled_by_id'             => $this->inputOrFallback($request, 'form_filled_by_id', $fallback->form_filled_by_id ?? null),
            'form_filled_by_date'           => $this->inputOrFallback($request, 'form_filled_by_date', $fallback->form_filled_by_date ?? null),
            'approved_by_ch_id'             => $this->inputOrFallback($request, 'approved_by_ch_id', $fallback->approved_by_ch_id ?? null),
            'approved_by_ch_status'         => $this->inputOrFallback($request, 'approved_by_ch_status', $fallback->approved_by_ch_status ?? null),
            'approved_by_ch_date'           => $this->inputOrFallback($request, 'approved_by_ch_date', $fallback->approved_by_ch_date ?? null),
        ];
    }

    private function inputOrFallback(Request $request, string $key, $fallback = null)
    {
        return $request->exists($key) ? $request->input($key) : $fallback;
    }

    private function replaceRevisionChildren(
        FeeSheetRevision $revision,
        Request $request,
        ?FeeSheetRevision $fallback = null
    ): void {
        $fullPageRevision = $this->usesFullPageRevision($revision->fee_sheet_type);

        if ($request->exists('team')) {
            $revision->teamMembers()->delete();
            foreach ($this->normalizeTeamPayload($request->input('team')) as $employeeCode) {
                $revision->teamMembers()->create(['employee_code' => $employeeCode]);
            }
        } elseif ($fallback) {
            $revision->teamMembers()->delete();
            foreach ($fallback->teamMembers as $member) {
                if ($member->employee_code) {
                    $revision->teamMembers()->create(['employee_code' => $member->employee_code]);
                }
            }
        }

        if ($this->requestExistsAny($request, ['fee_agreements'])) {
            $this->replaceFeeAgreements(
                $revision,
                $this->normalizeFeeAgreementRows($request->input('fee_agreements', []), $fullPageRevision)
            );
        } elseif ($fallback) {
            $this->replaceFeeAgreements(
                $revision,
                $this->normalizeFeeAgreementRows($fallback->feeAgreements->toArray(), $fullPageRevision)
            );
        }

        if ($this->requestExistsAny($request, ['job_costing', 'job_costings'])) {
            $revision->jobCostings()->delete();
            $revision->jobCostings()->createMany(
                $this->normalizeJobCostingRows(
                    $this->requestInputAny($request, ['job_costing', 'job_costings'], []),
                    $fullPageRevision
                )
            );
        } elseif ($fallback) {
            $revision->jobCostings()->delete();
            $revision->jobCostings()->createMany(
                $this->normalizeJobCostingRows($fallback->jobCostings->toArray(), $fullPageRevision)
            );
        }

        if ($this->requestExistsAny($request, ['billing_forecast', 'billing_forecasts'])) {
            $revision->billingForecasts()->delete();
            $revision->billingForecasts()->createMany(
                $this->normalizeBillingForecastRows(
                    $this->requestInputAny($request, ['billing_forecast', 'billing_forecasts'], []),
                    $fullPageRevision
                )
            );
        } elseif ($fallback) {
            $revision->billingForecasts()->delete();
            $revision->billingForecasts()->createMany(
                $this->normalizeBillingForecastRows($fallback->billingForecasts->toArray(), $fullPageRevision)
            );
        }
    }

    private function replaceFeeAgreements(FeeSheetRevision $revision, array $rows): void
    {
        $this->deleteRevisionFeeAgreements($revision);

        foreach ($rows as $row) {
            $subconsultantItems = $row['less_subconsultants_items'] ?? [];
            $otherExpenseItems = $row['less_other_expenses_items'] ?? [];

            unset($row['less_subconsultants_items'], $row['less_other_expenses_items']);

            $agreement = $revision->feeAgreements()->create($row);
            $this->createFeeAgreementLineItems($agreement, 'subconsultant', $subconsultantItems);
            $this->createFeeAgreementLineItems($agreement, 'other_expense', $otherExpenseItems);
        }
    }

    private function deleteRevisionFeeAgreements(FeeSheetRevision $revision): void
    {
        $revision->feeAgreements()
            ->with('lineItems')
            ->get()
            ->each(function (FeeAgreement $agreement) {
                $agreement->lineItems()->delete();
                $agreement->delete();
            });
    }

    private function createFeeAgreementLineItems(FeeAgreement $agreement, string $category, array $items): void
    {
        $rows = collect($items)
            ->values()
            ->map(function ($item, $index) use ($category) {
                return [
                    'category' => $category,
                    'name' => $item['name'] ?? null,
                    'amount' => $item['amount'] ?? 0,
                    'sort_order' => $index,
                ];
            })
            ->all();

        if ($rows) {
            $agreement->lineItems()->createMany($rows);
        }
    }

    private function normalizeTeamPayload($team): array
    {
        if (is_string($team)) {
            $team = explode(',', $team);
        }

        if (! is_array($team)) {
            return [];
        }

        return collect($team)
            ->map(function ($member) {
                if (is_array($member)) {
                    return $member['employee_code'] ?? ($member['code'] ?? null);
                }

                return trim((string) $member);
            })
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    private function requestExistsAny(Request $request, array $keys): bool
    {
        foreach ($keys as $key) {
            if ($request->exists($key)) {
                return true;
            }
        }

        return false;
    }

    private function requestInputAny(Request $request, array $keys, $default = null)
    {
        foreach ($keys as $key) {
            if ($request->exists($key)) {
                return $request->input($key);
            }
        }

        return $default;
    }

    private function usesFullPageRevision($feeSheetType): bool
    {
        return ($feeSheetType ?: 'project') === 'project';
    }

    private function latestSectionRows($rows): array
    {
        $rows = collect($rows ?? [])->values();
        if ($rows->isEmpty()) {
            return [];
        }

        $latestRevisionNo = $rows->max(function ($row) {
            return (int) ($row['revision_no'] ?? 0);
        });

        return $rows
            ->filter(function ($row) use ($latestRevisionNo) {
                return (int) ($row['revision_no'] ?? 0) === (int) $latestRevisionNo;
            })
            ->values()
            ->all();
    }

    private function normalizeFeeAgreementRows($rows, bool $fullPageRevision): array
    {
        $sourceRows = $fullPageRevision ? $this->latestSectionRows($rows) : collect($rows ?? [])->values()->all();

        return collect($sourceRows)
            ->map(function ($row, $index) use ($fullPageRevision) {
                $revisionNo = $fullPageRevision ? 0 : (int) ($row['revision_no'] ?? $index);
                $revisionLabel = $fullPageRevision
                    ? 'Original'
                    : ($row['revision_label'] ?? ($revisionNo === 0 ? 'Original' : "Rev {$revisionNo}"));
                $subconsultantItems = $this->feeAgreementItemsFromRow(
                    $row,
                    'subconsultant',
                    'less_subconsultants_items',
                    'less_subconsultants_name',
                    'less_subconsultants_number'
                );
                $otherExpenseItems = $this->feeAgreementItemsFromRow(
                    $row,
                    'other_expense',
                    'less_other_expenses_items',
                    'less_other_expenses_name',
                    'less_other_expenses'
                );
                $subconsultantTotal = $this->sumFeeAgreementItems($subconsultantItems);
                $otherExpenseTotal = $this->sumFeeAgreementItems($otherExpenseItems);
                $grossFee = $this->normalizeMoney($row['gross_fee_excl_vat'] ?? 0);
                $netFee = array_key_exists('net_fee_excl_vat', $row)
                    ? $this->normalizeMoney($row['net_fee_excl_vat'])
                    : $grossFee - $subconsultantTotal - $otherExpenseTotal;

                return [
                    'revision_no'                => $revisionNo,
                    'revision_label'             => $revisionLabel,
                    'revision_name'              => $fullPageRevision ? 'Original' : ($row['revision_name'] ?? $revisionLabel),
                    'gross_fee_excl_vat'         => $grossFee,
                    'less_subconsultants_name'   => $this->joinFeeAgreementItemNames($subconsultantItems),
                    'less_subconsultants_number' => $subconsultantTotal,
                    'less_other_expenses_name'   => $this->joinFeeAgreementItemNames($otherExpenseItems),
                    'less_other_expenses'        => $otherExpenseTotal,
                    'net_fee_excl_vat'           => $netFee,
                    'agreement_received'         => $row['agreement_received'] ?? null,
                    'less_subconsultants_items'  => $subconsultantItems,
                    'less_other_expenses_items'  => $otherExpenseItems,
                ];
            })
            ->values()
            ->all();
    }

    private function feeAgreementItemsFromRow(
        array $row,
        string $category,
        string $arrayKey,
        string $legacyNameKey,
        string $legacyAmountKey
    ): array {
        if (array_key_exists($arrayKey, $row) && is_array($row[$arrayKey])) {
            return $this->normalizeFeeAgreementItems($row[$arrayKey], true);
        }

        $lineItems = collect($row['line_items'] ?? [])
            ->filter(function ($item) use ($category) {
                return ($item['category'] ?? null) === $category;
            })
            ->sortBy(function ($item) {
                return (int) ($item['sort_order'] ?? 0);
            })
            ->values()
            ->all();

        if ($lineItems) {
            return $this->normalizeFeeAgreementItems($lineItems, false);
        }

        return $this->normalizeFeeAgreementItems([
            [
                'name' => $row[$legacyNameKey] ?? null,
                'amount' => $row[$legacyAmountKey] ?? 0,
            ],
        ], false);
    }

    private function normalizeFeeAgreementItems($items, bool $strictNames): array
    {
        return collect(is_array($items) ? $items : [])
            ->map(function ($item) use ($strictNames) {
                $name = trim((string) ($item['name'] ?? ''));
                $amount = $this->normalizeMoney($item['amount'] ?? 0);

                if ($strictNames && $amount > 0 && $name === '') {
                    throw ValidationException::withMessages([
                        'fee_agreements' => 'Each fee agreement item with amount must have a name.',
                    ]);
                }

                return [
                    'name' => $name,
                    'amount' => $amount,
                ];
            })
            ->filter(function ($item) {
                return $item['name'] !== '' || (float) $item['amount'] !== 0.0;
            })
            ->values()
            ->all();
    }

    private function normalizeMoney($value): float
    {
        return is_numeric($value) ? (float) $value : 0.0;
    }

    private function sumFeeAgreementItems(array $items): float
    {
        return (float) collect($items)->sum(function ($item) {
            return $this->normalizeMoney($item['amount'] ?? 0);
        });
    }

    private function joinFeeAgreementItemNames(array $items): ?string
    {
        $names = collect($items)
            ->pluck('name')
            ->map(fn($name) => trim((string) $name))
            ->filter()
            ->values()
            ->all();

        return $names ? implode(', ', $names) : null;
    }

    private function normalizeJobCostingRows($rows, bool $fullPageRevision): array
    {
        $sourceRows = $fullPageRevision ? $this->latestSectionRows($rows) : collect($rows ?? [])->values()->all();

        return collect($sourceRows)
            ->map(function ($row, $index) use ($fullPageRevision) {
                $revisionNo = $fullPageRevision ? 0 : (int) ($row['revision_no'] ?? 0);

                return [
                    'revision_no'    => $revisionNo,
                    'revision_label' => $fullPageRevision
                        ? 'Original'
                        : ($row['revision_label'] ?? ($index === 0 ? 'Original' : "Rev {$revisionNo}")),
                    'phase'          => $row['phase'] ?? null,
                    'percent'        => $row['percent'] ?? ($row['percentage'] ?? 0),
                    'start_date'     => $row['start_date'] ?? null,
                    'end_date'       => $row['end_date'] ?? null,
                ];
            })
            ->filter(function ($row) {
                return ! empty($row['phase']);
            })
            ->values()
            ->all();
    }

    private function normalizeBillingForecastRows($rows, bool $fullPageRevision): array
    {
        $sourceRows = $fullPageRevision ? $this->latestSectionRows($rows) : collect($rows ?? [])->values()->all();

        return collect($sourceRows)
            ->map(function ($row, $index) use ($fullPageRevision) {
                $revisionNo = $fullPageRevision ? 0 : (int) ($row['revision_no'] ?? 0);

                return [
                    'revision_no'    => $revisionNo,
                    'revision_label' => $fullPageRevision
                        ? 'Original'
                        : ($row['revision_label'] ?? ($index === 0 ? 'Original' : "Rev {$revisionNo}")),
                    'month'          => $row['month'] ?? null,
                    'amount'         => $row['amount'] ?? 0,
                ];
            })
            ->filter(function ($row) {
                return ! empty($row['month']);
            })
            ->values()
            ->all();
    }

    private function serializeFeeSheet(FeeSheet $feeSheet): array
    {
        $data = $feeSheet->toArray();

        $revisions = $feeSheet->revisions
            ->sortBy('rev_no')
            ->values()
            ->map(function ($revision) use ($feeSheet) {
                return $this->serializeRevision($revision, $feeSheet);
            })
            ->values();

        $currentRevision = $feeSheet->currentRevision
            ? $this->serializeRevision($feeSheet->currentRevision, $feeSheet)
            : ($revisions->last() ?: null);

        $data['current_revision'] = $currentRevision;
        $data['revision'] = $currentRevision;
        $data['revisions'] = $revisions->all();

        return $data;
    }

    private function serializeRevision(FeeSheetRevision $revision, ?FeeSheet $feeSheet = null): array
    {
        $fullPageRevision = $this->usesFullPageRevision($revision->fee_sheet_type);
        $data = $revision->toArray();

        $feeAgreements = $this->normalizeFeeAgreementRows(
            $revision->feeAgreements->toArray(),
            $fullPageRevision
        );
        $jobCostings = $this->normalizeJobCostingRows(
            $revision->jobCostings->toArray(),
            $fullPageRevision
        );
        $billingForecasts = $this->normalizeBillingForecastRows(
            $revision->billingForecasts->toArray(),
            $fullPageRevision
        );

        $teamMembers = $revision->teamMembers
            ->map(function ($member) {
                return [
                    'id'            => $member->id,
                    'employee_code' => $member->employee_code,
                    'full_name'     => $member->employee->name ?? ($member->employee->full_name ?? null),
                ];
            })
            ->values()
            ->all();

        $data['revision_id'] = $revision->id;
        $data['revision_no'] = $revision->rev_no;
        $data['mt_project_no'] = $revision->mt_project_no ?? ($feeSheet->mt_project_no ?? null);
        $data['team_members'] = $teamMembers;
        $data['team'] = collect($teamMembers)->pluck('employee_code')->filter()->implode(', ');
        $data['fee_agreements'] = $feeAgreements;
        $data['job_costings'] = $jobCostings;
        $data['job_costing'] = $jobCostings;
        $data['billing_forecasts'] = $billingForecasts;
        $data['billing_forecast'] = $billingForecasts;

        return $data;
    }

    private function resolveProposalProjectReference(
        Request $request,
        $fallbackReferenceId = null,
        $fallbackProjectNumber = null,
        $fallbackProjectName = null
    ): array {
        $referenceId = $request->input('proposal_project_reference_id') ?? $fallbackReferenceId;
        $projectNumber = trim((string) ($request->input('mt_project_no') ?? $fallbackProjectNumber ?? ''));
        $projectName = trim((string) ($request->input('project_name') ?? $fallbackProjectName ?? ''));

        if (! $referenceId || $projectNumber === '') {
            return [
                'id' => $referenceId ?: null,
                'response' => null,
            ];
        }

        $baseReference = ProposalProjectReference::find($referenceId);
        if (! $baseReference) {
            return [
                'id' => $referenceId,
                'response' => null,
            ];
        }

        if ($this->normalizeProjectNumber($baseReference->project_number) === $this->normalizeProjectNumber($projectNumber)) {
            return [
                'id' => $baseReference->id,
                'response' => null,
            ];
        }

        $existingReference = ProposalProjectReference::withTrashed()
            ->whereRaw('LOWER(TRIM(project_number)) = ?', [$this->normalizeProjectNumber($projectNumber)])
            ->first();

        if ($existingReference) {
            return [
                'id' => null,
                'response' => $this->duplicateProposalProjectReferenceResponse($projectNumber, $existingReference),
            ];
        }

        try {
            $createdReference = ProposalProjectReference::create([
                'proposal_contract_review_id' => $baseReference->proposal_contract_review_id,
                'proposal_contract_review_project_id' => null,
                'proposal_number' => $baseReference->proposal_number,
                'project_number' => $projectNumber,
                'project_name' => $projectName !== '' ? $projectName : $baseReference->project_name,
                'status' => $baseReference->status ?: 'active',
                'metadata' => array_merge($baseReference->metadata ?? [], [
                    'source' => 'fee_sheet_manual_project_number',
                    'base_proposal_project_reference_id' => $baseReference->id,
                    'base_project_number' => $baseReference->project_number,
                ]),
            ]);
        } catch (QueryException $exception) {
            if ((string) $exception->getCode() !== '23000') {
                throw $exception;
            }

            return [
                'id' => null,
                'response' => $this->duplicateProposalProjectReferenceResponse($projectNumber),
            ];
        }

        return [
            'id' => $createdReference->id,
            'response' => null,
        ];
    }

    private function normalizeProjectNumber($projectNumber): string
    {
        return strtolower(trim((string) $projectNumber));
    }

    private function duplicateProposalProjectReferenceResponse(string $projectNumber, ?ProposalProjectReference $existingReference = null)
    {
        return response()->json([
            'status' => false,
            'code' => 'DUPLICATE_PROPOSAL_PROJECT_REFERENCE',
            'message' => "MT Project No. {$projectNumber} already exists in proposal project references.",
            'data' => [
                'project_number' => $projectNumber,
                'existing_reference_id' => $existingReference->id ?? null,
                'existing_project_name' => $existingReference->project_name ?? null,
                'is_deleted_reference' => $existingReference ? (bool) $existingReference->deleted_at : false,
            ],
        ], 422);
    }

}
