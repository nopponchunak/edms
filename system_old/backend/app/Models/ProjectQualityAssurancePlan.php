<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProjectQualityAssurancePlan extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $guarded = [];

    protected $casts = [
        'scope_cs' => 'boolean',
        'scope_me' => 'boolean',
        'scope_leed_esd' => 'boolean',
        'scope_facade' => 'boolean',
        'scope_lighting' => 'boolean',
        'scope_pm' => 'boolean',
        'scope_cm' => 'boolean',
        'scope_transport' => 'boolean',
        'scope_geotechnical' => 'boolean',
        'scope_qs' => 'boolean',
        'scope_engineering_audit' => 'boolean',
        'scope_others_flag' => 'boolean',
        'validation_before_docs_issued' => 'boolean',
        'validation_within_14days_after_docs' => 'boolean',
    ];

    public function quality_plan_schedule()
    {
        return $this->hasMany(ProjectQualityAssurancePlanSchedule::class, 'project_quality_assurance_plan_id');
    }

    public function documents_required()
    {
        return $this->hasMany(ProjectQualityAssurancePlanDocument::class, 'project_quality_assurance_plan_id');
    }

    public function proposal_contract_review()
    {
        return $this->belongsTo(PostmanProposalContractReview::class, 'proposal_contract_review_id');
    }
}
