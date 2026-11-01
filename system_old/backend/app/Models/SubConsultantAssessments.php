<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SubConsultantAssessments extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table = 'sub_consultant_assessments';

    public function references()
    {
        return $this->hasMany(SubConsultantAssessmentReferences::class, 'assessment_id', 'id');
    }

    public function files()
    {
        return $this->hasMany(SubConsultantAssessmentFiles::class, 'assessment_id', 'id');
    }
}
