<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ExpensesClaimItems extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'expenses_claim_items';

    public function claim()
    {
        return $this->belongsTo(ExpensesClaims::class, 'expenses_claim_id', 'id');
    }
}
