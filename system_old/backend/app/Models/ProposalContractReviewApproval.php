<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProposalContractReviewApproval extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $guarded = [];

    protected $casts = [
        'win_probability' => 'float',
        'acted_at' => 'datetime',
    ];

    public function review()
    {
        return $this->belongsTo(PostmanProposalContractReview::class, 'proposal_contract_review_id');
    }
}
