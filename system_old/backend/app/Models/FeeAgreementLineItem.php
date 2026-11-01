<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FeeAgreementLineItem extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'fee_agreement_id',
        'category',
        'name',
        'amount',
        'sort_order',
    ];

    protected $casts = [
        'amount' => 'float',
        'sort_order' => 'integer',
    ];

    public function feeAgreement()
    {
        return $this->belongsTo(FeeAgreement::class);
    }
}
