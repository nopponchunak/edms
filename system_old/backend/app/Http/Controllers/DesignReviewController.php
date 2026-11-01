<?php
namespace App\Http\Controllers;

use App\Models\DesignReview;
use App\Models\DesignReviewAnswer;
use App\Models\DesignReviewAssignment;
use App\Models\DesignReviewDocument;
use App\Models\Discipline;
use App\Models\ProposalProjectReference;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DesignReviewController extends Controller
{
    /**
     * GET /pages/design_review_page
     * Get master data for create form
     */
    public function getPage()
    {
        $disciplines = Discipline::where('is_active', 1)->select('id', 'code', 'name')->orderBy('name')->get();
        $projects    = ProposalProjectReference::whereNull('deleted_at')
            ->whereNotNull('project_number')
            ->where('project_number', '!=', '')
            ->select('id', 'proposal_contract_review_id', 'proposal_number', 'project_name', 'project_number as project_no')
            ->orderBy('project_name')
            ->orderBy('project_number')
            ->get();
        $users       = User::where('status', 'Yes')
            ->whereNull('deleted_at')
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        return response()->json([
            'projects'    => $projects,
            'disciplines' => $disciplines,
            'users'       => $users,
        ]);
    }

    /**
     * POST /design_reviews
     * Store new design review
     */
    public function store(Request $request)
    {
        $loginBy = $request->login_by;
        DB::beginTransaction();

        try {

            $data = $request->validate([
                'project_no'                      => 'required|string',
                'project_name'                    => 'required|string',
                'prepare_by'                      => 'required|string',
                'discipline_id'                   => 'required|integer|exists:disciplines,id',

                'document_types'                  => 'nullable|array',
                'document_types.*'                => 'string',
                'document_location'               => 'nullable|string',

                'assignments.reviewer_for_action' => 'required|string',
                'assignments.teamlead_for_action' => 'required|string',
                'assignments.director_for_action' => 'required|string',

                'answers'                         => 'required|array|size:5',
                'answers.*.question_no'           => 'required|integer|min:1|max:5',
                'answers.*.answer'                => 'required|string|in:Yes,No,N/A',

                'comments'                        => 'nullable|string',

                'first_signed_by'                 => 'nullable|string',
                'first_signed_status'             => 'nullable|string',
                'first_signed_date'               => 'nullable|date',

                'responded_by'                    => 'nullable|string',
                'responded_status'                => 'nullable|string',
                'responded_date'                  => 'nullable|date',

                'recommended_action'              => 'nullable|in:Yes,No',
                'recommended_note'                => 'nullable|string',

                'second_signed_by'                => 'nullable|string',
                'second_signed_status'            => 'nullable|string',
                'second_signed_date'              => 'nullable|date',

                'tl_mep_signed_by'                => 'nullable|string',
                'tl_mep_signed_status'            => 'nullable|string',
                'tl_mep_signed_date'              => 'nullable|date',

                'tl_signed_by'                    => 'nullable|string',
                'tl_signed_status'                => 'nullable|string',
                'tl_signed_date'                  => 'nullable|date',

                'acknowledged_by'                 => 'nullable|string',
                'acknowledged_status'             => 'nullable|string',
                'acknowledged_date'               => 'nullable|date',
            ]);

            $designReview = DesignReview::create([
                'project_name'         => $data['project_name'],
                'project_no'           => $data['project_no'],
                'prepare_by'           => $data['prepare_by'],
                'discipline_id'        => $data['discipline_id'],

                'document_location'    => $data['document_location'],
                'comments'             => $data['comments'],

                'first_signed_by'      => $data['first_signed_by'],
                'first_signed_status'  => $data['first_signed_status'] ?? 'pending',
                'first_signed_date'    => $data['first_signed_date'] ?? null,

                'responded_by'         => $data['responded_by'],
                'responded_status'     => $data['responded_status'] ?? 'pending',
                'responded_date'       => $data['responded_date'],

                'recommended_action'   => $data['recommended_action'],
                'recommended_note'     => $data['recommended_note'],

                'second_signed_by'     => $data['second_signed_by'],
                'second_signed_status' => $data['second_signed_status'] ?? 'pending',
                'second_signed_date'   => $data['second_signed_date'] ?? null,

                'tl_mep_signed_by'     => $data['tl_mep_signed_by'],
                'tl_mep_signed_status' => $data['tl_mep_signed_status'] ?? 'pending',
                'tl_mep_signed_date'   => $data['tl_mep_signed_date'] ?? null,

                'tl_signed_by'         => $data['tl_signed_by'],
                'tl_signed_status'     => $data['tl_signed_status'] ?? 'pending',
                'tl_signed_date'       => $data['tl_signed_date'] ?? null,

                'acknowledged_by'      => $data['acknowledged_by'],
                'acknowledged_status'  => $data['acknowledged_status'],
                'acknowledged_date'    => $data['acknowledged_date'],

                'create_by'            => $loginBy->id ?? 'admin',
                'update_by'            => $loginBy->id ?? 'admin',
            ]);

            if (! empty($data['document_types'])) {
                foreach ($data['document_types'] as $docType) {
                    DesignReviewDocument::create([
                        'design_review_id' => $designReview->id,
                        'document_type'    => $docType,
                    ]);
                }
            }

            DesignReviewAssignment::create([
                'design_review_id'    => $designReview->id,
                'reviewer_for_action' => $data['assignments']['reviewer_for_action'],
                'teamlead_for_action' => $data['assignments']['teamlead_for_action'],
                'director_for_action' => $data['assignments']['director_for_action'],
            ]);

            foreach ($data['answers'] as $answer) {
                DesignReviewAnswer::create([
                    'design_review_id' => $designReview->id,
                    'question_no'      => $answer['question_no'],
                    'answer'           => $answer['answer'],
                ]);
            }

            $this->logDocumentCreateAudit($request, $designReview);

            DB::commit();

            return response()->json([
                'message' => 'Design Review created successfully',
                'data'    => $designReview,
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Failed to create a design review',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * PUT /design_reviews/{id}
     */
    public function update(Request $request, $id)
    {
        $loginBy = $request->login_by;

        DB::beginTransaction();

        try {

            $designReview = DesignReview::findOrFail($id);

            $data = $request->validate([
                'project_no'                      => 'required|string',
                'project_name'                    => 'required|string',
                'prepare_by'                      => 'required|string',
                'discipline_id'                   => 'required|integer|exists:disciplines,id',

                'document_types'                  => 'nullable|array',
                'document_types.*'                => 'string',
                'document_location'               => 'nullable|string',

                'assignments.reviewer_for_action' => 'required|string',
                'assignments.teamlead_for_action' => 'required|string',
                'assignments.director_for_action' => 'required|string',

                'answers'                         => 'required|array|size:5',
                'answers.*.question_no'           => 'required|integer|min:1|max:5',
                'answers.*.answer'                => 'required|string|in:Yes,No,N/A',

                'comments'                        => 'nullable|string',

                
                'first_signed_by'                 => 'nullable|string',
                'first_signed_status'             => 'nullable|string',
                'first_signed_date'               => 'nullable|date',

                'responded_by'                    => 'nullable|string',
                'responded_status'                => 'nullable|string',
                'responded_date'                  => 'nullable|date',

                'recommended_action'              => 'nullable|in:Yes,No',
                'recommended_note'                => 'nullable|string',

                'second_signed_by'                => 'nullable|string',
                'second_signed_status'            => 'nullable|string',
                'second_signed_date'              => 'nullable|date',

                'tl_mep_signed_by'                => 'nullable|string',
                'tl_mep_signed_status'            => 'nullable|string',
                'tl_mep_signed_date'              => 'nullable|date',

                'tl_signed_by'                    => 'nullable|string',
                'tl_signed_status'                => 'nullable|string',
                'tl_signed_date'                  => 'nullable|date',

                'acknowledged_by'                 => 'nullable|string',
                'acknowledged_status'             => 'nullable|string',
                'acknowledged_date'               => 'nullable|date',
            ]);

            $designReview->update([
                'project_name'         => $data['project_name'],
                'project_no'           => $data['project_no'],
                'prepare_by'           => $data['prepare_by'],
                'discipline_id'        => $data['discipline_id'],

                'document_location'    => $data['document_location'] ?? null,
                'comments'             => $data['comments'] ?? null,

                'first_signed_by'      => $data['first_signed_by'] ?? null,
                'first_signed_status'  => $data['first_signed_status'] ?? $designReview->first_signed_status,
                'first_signed_date'    => $data['first_signed_date'] ?? null,

                'responded_by'         => $data['responded_by'] ?? null,
                'responded_status'     => $data['responded_status'] ?? $designReview->responded_status,
                'responded_date'       => $data['responded_date'] ?? null,

                'recommended_action'   => $data['recommended_action'] ?? null,
                'recommended_note'     => $data['recommended_note'] ?? null,

                'second_signed_by'     => $data['second_signed_by'] ?? null,
                'second_signed_status' => $data['second_signed_status'] ?? $designReview->second_signed_status,
                'second_signed_date'   => $data['second_signed_date'] ?? null,

                'tl_mep_signed_by'     => $data['tl_mep_signed_by'] ?? null,
                'tl_mep_signed_status' => $data['tl_mep_signed_status'] ?? $designReview->tl_mep_signed_status,
                'tl_mep_signed_date'   => $data['tl_mep_signed_date'] ?? null,

                'tl_signed_by'         => $data['tl_signed_by'] ?? null,
                'tl_signed_status'     => $data['tl_signed_status'] ?? $designReview->tl_signed_status,
                'tl_signed_date'       => $data['tl_signed_date'] ?? null,

                'acknowledged_by'      => $data['acknowledged_by'] ?? null,
                'acknowledged_status'  => $data['acknowledged_status'] ?? $designReview->acknowledged_status,
                'acknowledged_date'    => $data['acknowledged_date'] ?? null,

                'update_by'            => $loginBy->id ?? 'admin',
            ]);

            $documentTypes = array_values(array_unique(array_filter(
                $data['document_types'] ?? [],
                fn ($docType) => trim((string) $docType) !== ''
            )));

            DesignReviewDocument::where('design_review_id', $designReview->id)
                ->when(! empty($documentTypes), fn ($query) => $query->whereNotIn('document_type', $documentTypes))
                ->delete();

            foreach ($documentTypes as $docType) {
                $document = DesignReviewDocument::withTrashed()->firstOrNew([
                    'design_review_id' => $designReview->id,
                    'document_type'    => $docType,
                ]);
                $document->deleted_at = null;
                $document->save();
            }

            $assignment = DesignReviewAssignment::withTrashed()->firstOrNew([
                'design_review_id' => $designReview->id,
            ]);
            $assignment->reviewer_for_action = $data['assignments']['reviewer_for_action'];
            $assignment->teamlead_for_action = $data['assignments']['teamlead_for_action'];
            $assignment->director_for_action = $data['assignments']['director_for_action'];
            $assignment->deleted_at = null;
            $assignment->save();

            $answers = $data['answers'] ?? [];
            $questionNumbers = array_values(array_unique(array_map(
                fn ($answer) => (int) ($answer['question_no'] ?? 0),
                $answers
            )));

            DesignReviewAnswer::where('design_review_id', $designReview->id)
                ->when(! empty($questionNumbers), fn ($query) => $query->whereNotIn('question_no', $questionNumbers))
                ->delete();

            foreach ($answers as $answer) {
                $answerRow = DesignReviewAnswer::withTrashed()->firstOrNew([
                    'design_review_id' => $designReview->id,
                    'question_no'      => $answer['question_no'],
                ]);
                $answerRow->answer = $answer['answer'];
                $answerRow->deleted_at = null;
                $answerRow->save();
            }

            DB::commit();

            return response()->json([
                'message' => 'Design Review updated successfully',
                'data'    => $designReview,
            ], 200);

        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'success' => false,
                'message' => 'Failed to update design review',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /design_reviews/{id}
     * Get review detail
     */
    public function getById($id)
    {
        $designReview = DesignReview::with([
            'discipline',
            'answers',
            'documents',
            'assignment',
        ])->find($id);

        if (! $designReview) {
            return response()->json([
                'message' => 'Design Review not found',
            ], 404);
        }

        return response()->json([
            'message' => 'Design Review retrieved successfully',
            'data'    => $designReview,
        ], 200);
    }

    /**
     * GET /design_reviews
     * List reviews with pagination & filters
     */
    public function getList(Request $request)
    {
        $draw   = intval($request->input('draw'));
        $start  = intval($request->input('start', 0));
        $length = intval($request->input('length', 10));
        $search = $request->input('search.value');

        $columns = [
            'id',
            'project_no',
            'project_name',
            'discipline_id',
            'first_signed_status',
            'created_at',
        ];

        $query = DesignReview::query()
            ->with(['discipline']);

        // Total records
        $recordsTotal = $query->count();

        // Global search
        if (! empty($search)) {
            $query->where(function ($q) use ($search) {
                $q->where('project_no', 'like', "%{$search}%")
                    ->orWhere('project_name', 'like', "%{$search}%")
                    ->orWhere('first_signed_status', 'like', "%{$search}%")
                    ->orWhereHas('discipline', function ($d) use ($search) {
                        $d->where('name', 'like', "%{$search}%");
                    });
            });
        }

        // Filtered count
        $recordsFiltered = $query->count();

        // Ordering
        if ($request->has('order.0.column')) {
            $columnIndex = $request->input('order.0.column');
            $direction   = $request->input('order.0.dir', 'desc');

            $orderColumn = $columns[$columnIndex] ?? 'created_at';
            $query->orderBy($orderColumn, $direction);
        } else {
            $query->orderBy('created_at', 'desc');
        }

        // Pagination
        $data = $query
            ->skip($start)
            ->take($length)
            ->get();

        // Format rows
        $rows = $data->map(function ($item) {

            // You can later improve this logic to compute overall status
            $status = $item->first_signed_status ?? 'draft';

            return [
                'id'           => $item->id,
                'project_no'   => $item->project_no,
                'project_name' => $item->project_name,
                'discipline'   => $item->discipline->name ?? '-',
                'status'       => $status,
                'created_at'   => $item->created_at->format('Y-m-d'),
            ];
        });

        return response()->json([
            'draw'            => $draw,
            'recordsTotal'    => $recordsTotal,
            'recordsFiltered' => $recordsFiltered,
            'data'            => $rows,
        ]);
    }

}
