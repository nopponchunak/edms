<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SubConsultantEvaluation extends Model
{
    use HasFactory;
    use SoftDeletes;

    public function items()
    {
        return $this->hasMany(SubConsultantEvaluationItem::class,'sub_consultant_eva_id','id');
    }

    public function files()
    {
        return $this->hasMany(SubConsultantEvaluationFiles::class,'sub_consultant_eva_id','id');
    }
}
