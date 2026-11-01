<?php

namespace App\Http\Controllers;

use App\Models\ProposalProjectReference;
use Illuminate\Http\Request;

class ProposalProjectReferenceController extends Controller
{
    public function index(Request $request)
    {
        $query = ProposalProjectReference::query()
            ->whereNull('deleted_at');

        if ($request->filled('id')) {
            $query->whereKey($request->input('id'));
        }

        if ($request->boolean('has_project_number')) {
            $query->whereNotNull('project_number')
                ->where('project_number', '!=', '');
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        if ($search = trim((string) $request->input('search', $request->input('q', '')))) {
            $query->where(function ($q) use ($search) {
                $q->where('proposal_number', 'like', "%{$search}%")
                    ->orWhere('project_number', 'like', "%{$search}%")
                    ->orWhere('project_name', 'like', "%{$search}%");
            });
        }

        $perPage = (int) $request->input('per_page', $request->input('perPage', 100));
        $perPage = max(1, min($perPage, 500));

        $items = $query
            ->orderBy('project_name')
            ->orderBy('project_number')
            ->paginate($perPage);

        return response()->json([
            'status' => true,
            'data' => $items->getCollection()->map(function (ProposalProjectReference $item) {
                return $this->transform($item);
            })->values(),
            'items' => $items->getCollection()->map(function (ProposalProjectReference $item) {
                return $this->transform($item);
            })->values(),
            'total' => $items->total(),
            'page' => $items->currentPage(),
            'perPage' => $items->perPage(),
            'lastPage' => $items->lastPage(),
        ]);
    }

    private function transform(ProposalProjectReference $item): array
    {
        return [
            'id' => $item->id,
            'proposal_contract_review_id' => $item->proposal_contract_review_id,
            'proposalContractReviewId' => $item->proposal_contract_review_id,
            'proposal_contract_review_project_id' => $item->proposal_contract_review_project_id,
            'proposalContractReviewProjectId' => $item->proposal_contract_review_project_id,
            'proposal_number' => $item->proposal_number,
            'proposalNumber' => $item->proposal_number,
            'project_number' => $item->project_number,
            'projectNumber' => $item->project_number,
            'project_no' => $item->project_number,
            'projectNo' => $item->project_number,
            'project_name' => $item->project_name,
            'projectName' => $item->project_name,
            'status' => $item->status,
            'metadata' => $item->metadata,
            'created_at' => $item->created_at,
            'updated_at' => $item->updated_at,
        ];
    }
}
