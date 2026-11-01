<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;

use Illuminate\Database\Eloquent\Model;

class FeeSheetRevision extends Model
{
    use HasFactory;
    use SoftDeletes;
    protected $fillable = [
        'fee_sheet_id',
        'rev_no',
        'is_latest',
        'fee_sheet_type',
        'project_id',
        'proposal_project_reference_id',
        'mt_project_no',
        'project_name',
        'discipline_id',
        'director_in_charge_id',
        'client_name',
        'location',
        'mtl_scope_detail',
        'contact_name',
        'comment',
        'status',
        'project_type_id',
        'form_filled_by_id',
        'form_filled_by_date',
        'approved_by_ch_id',
        'approved_by_ch_status',
        'approved_by_ch_date',
    ];

    protected $casts = [
        'rev_no' => 'integer',
        'is_latest' => 'boolean',
    ];

    public function feeSheet()
    {
        return $this->belongsTo(FeeSheet::class);
    }

    public function projectReference()
    {
        return $this->belongsTo(ProposalProjectReference::class, 'proposal_project_reference_id');
    }

    public function teamMembers()
    {
        return $this->hasMany(FeeSheetTeamMember::class, 'revision_id');
    }

    public function projectType()
    {
        return $this->belongsTo(ProjectType::class, 'project_type_id');
    }

    public function discipline()
    {
        return $this->belongsTo(Discipline::class, 'discipline_id');
    }

    public function directorInCharge()
    {
        return $this->belongsTo(User::class, 'director_in_charge_id');
    }

    public function feeAgreements()
    {
        return $this->hasMany(FeeAgreement::class, 'revision_id');
    }

    public function jobCostings()
    {
        return $this->hasMany(JobCosting::class, 'revision_id');
    }

    public function billingForecasts()
    {
        return $this->hasMany(BillingForecast::class, 'revision_id');
    }
}
