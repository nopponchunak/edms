<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SubConsultantAssessmentFiles extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table = 'sub_consultant_assessment_files';

    public function assessment()
    {
        return $this->belongsTo(SubConsultantAssessments::class, 'assessment_id', 'id');
    }
}
