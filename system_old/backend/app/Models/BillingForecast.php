<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;

use Illuminate\Database\Eloquent\Model;

class BillingForecast extends Model
{
    use HasFactory;
    use SoftDeletes;
    protected $fillable = [
        'revision_id',
        'revision_no',
        'revision_label',
        'month',
        'amount',
    ];

    protected $casts = [
        'revision_no' => 'integer',
        'amount' => 'float',
    ];

    public function revision()
    {
        return $this->belongsTo(FeeSheetRevision::class);
    }
}
