<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ExpensesClaims extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'expenses_claims';

    protected $casts = [
        'attachments' => 'array',
        'draft_payload' => 'array',
    ];

    public function getAttachmentsAttribute($value)
    {
        if (is_array($value)) {
            return $value;
        }

        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return $decoded;
            }

            $trimmed = trim($value);
            if ($trimmed !== '') {
                return [$trimmed];
            }
        }

        return [];
    }

    public function items()
    {
        return $this->hasMany(ExpensesClaimItems::class, 'expenses_claim_id', 'id');
    }
}
