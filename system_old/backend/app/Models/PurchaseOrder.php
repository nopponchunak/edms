<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class PurchaseOrder extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $casts = [
        'attachments' => 'array',
        'discount' => 'float',
    ];

    public function getAttachmentsAttribute($value)
    {
        if (is_array($value)) {
            return $value;
        }

        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                if (is_array($decoded)) {
                    return $decoded;
                }
                if (is_string($decoded)) {
                    $decoded2 = json_decode($decoded, true);
                    if (json_last_error() === JSON_ERROR_NONE && is_array($decoded2)) {
                        return $decoded2;
                    }
                }
            } else {
                $trimmedQuotes = trim($value, "\"'");
                $decoded2 = json_decode($trimmedQuotes, true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($decoded2)) {
                    return $decoded2;
                }
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
        return $this->hasMany(PurchaseOrderItem::class, 'purchase_order_id');
    }

    public function purchaseRequisition()
    {
        return $this->belongsTo(PurchaseRequisitions::class, 'purchase_requisition_id');
    }
}
