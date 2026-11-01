<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class PurchaseOrderItem extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $casts = [
        'need_asset_code_registration' => 'boolean',
    ];
}
