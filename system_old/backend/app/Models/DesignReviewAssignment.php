<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DesignReviewAssignment extends Model
{
    use HasFactory;
    use SoftDeletes;
    protected $fillable = [
        'design_review_id',
        'reviewer_for_action',
        'teamlead_for_action',
        'director_for_action',
    ];

    public function designReview()
    {
        return $this->belongsTo(DesignReview::class);
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function teamLead()
    {
        return $this->belongsTo(User::class, 'team_lead_id');
    }

    public function director()
    {
        return $this->belongsTo(User::class, 'director_id');
    }
}
