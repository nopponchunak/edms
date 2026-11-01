<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProposalProjectReference extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table = 'proposal_project_references';

    protected $guarded = [];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function proposalContractReview()
    {
        return $this->belongsTo(PostmanProposalContractReview::class, 'proposal_contract_review_id');
    }

    public function proposalContractReviewProject()
    {
        return $this->belongsTo(PostmanProposalContractReviewProject::class, 'proposal_contract_review_project_id');
    }
}
