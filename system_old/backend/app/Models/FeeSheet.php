<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FeeSheet extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'fee_sheet_type',
        'project_id',
        'proposal_project_reference_id',
        'mt_project_no',
        'current_revision_id'
    ];

    public function project()
    {
        return $this->belongsTo(ProposalContractReview::class, 'project_id');
    }

    public function projectReference()
    {
        return $this->belongsTo(ProposalProjectReference::class, 'proposal_project_reference_id');
    }

    public function revisions()
    {
        return $this->hasMany(FeeSheetRevision::class);
    }

    public function currentRevision()
    {
        return $this->belongsTo(FeeSheetRevision::class, 'current_revision_id');
    }

}
