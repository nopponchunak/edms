<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class PostmanProposalContractReview extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table = 'postman_proposal_contract_reviews';

    protected $guarded = [];

    protected $casts = [
        'estimated_total_fees' => 'float',
        'win_probability' => 'float',
        'revision_no' => 'integer',
        'is_latest_revision' => 'boolean',
        'submitted_at' => 'datetime',
        'proposal_reviewed_at' => 'datetime',
        'contract_reviewed_at' => 'datetime',
        'completed_at' => 'datetime',
        'locked_at' => 'datetime',
    ];

    public function approvals()
    {
        return $this->hasMany(ProposalContractReviewApproval::class, 'proposal_contract_review_id')
            ->orderBy('id');
    }

    public function projects()
    {
        return $this->hasMany(PostmanProposalContractReviewProject::class, 'proposal_contract_review_id')
            ->orderBy('sequence_no')
            ->orderBy('id');
    }

    public function projectReferences()
    {
        return $this->hasMany(ProposalProjectReference::class, 'proposal_contract_review_id');
    }

    public function rootReview()
    {
        return $this->belongsTo(self::class, 'root_review_id');
    }

    public function revisedFrom()
    {
        return $this->belongsTo(self::class, 'revised_from_id');
    }

    public function revisions()
    {
        return $this->hasMany(self::class, 'root_review_id')
            ->orderBy('revision_no');
    }
}
