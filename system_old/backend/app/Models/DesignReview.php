<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DesignReview extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'project_no',
        'project_name',
        'discipline_id',
        'prepare_by',
        'document_location',
        'comments',

        'first_signed_by',
        'first_signed_status',
        'first_signed_date',

        'responded_by',
        'responded_status',
        'recommended_action',
        'recommended_note',
        'responded_date',

        'second_signed_by',
        'second_signed_status',
        'second_signed_date',

        'tl_mep_signed_by',
        'tl_mep_signed_status',
        'tl_mep_signed_date',

        'tl_signed_by',
        'tl_signed_status',
        'tl_signed_date',

        'acknowledged_by',
        'acknowledged_status',
        'acknowledged_date',

        'create_by',
        'update_by',
    ];

    public function discipline()
    {
        return $this->belongsTo(Discipline::class);
    }
    
    public function documents()
    {
        return $this->hasMany(DesignReviewDocument::class);
    }

    public function answers()
    {
        return $this->hasMany(DesignReviewAnswer::class);
    }

    public function assignment()
    {
        return $this->hasOne(DesignReviewAssignment::class);
    }

    public function signatures()
    {
        return $this->hasMany(DesignReviewSignature::class);
    }

}
