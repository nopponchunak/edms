<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class AllowanceAfter10pmItem extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'allowance_after_10pm_items';

    public function allowance()
    {
        return $this->belongsTo(AllowanceAfter10pm::class, 'allowance_after_10pm_id', 'id');
    }
}
