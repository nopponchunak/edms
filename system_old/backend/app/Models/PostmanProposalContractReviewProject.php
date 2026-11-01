<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class PostmanProposalContractReviewProject extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table = 'postman_proposal_contract_review_projects';

    protected $guarded = [];

    protected $casts = [
        'sequence_no' => 'integer',
        'estimated_total_fees' => 'float',
        'metadata' => 'array',
        'converted_at' => 'datetime',
    ];

    public function proposalContractReview()
    {
        return $this->belongsTo(PostmanProposalContractReview::class, 'proposal_contract_review_id');
    }

    public function projectReference()
    {
        return $this->hasOne(ProposalProjectReference::class, 'proposal_contract_review_project_id');
    }
}
