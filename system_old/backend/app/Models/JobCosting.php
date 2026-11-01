<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;


class JobCosting extends Model
{
    use HasFactory;
    use SoftDeletes;
    protected $fillable = [
        'revision_id',
        'revision_no',
        'revision_label',
        'phase',
        'percent',
        'start_date',
        'end_date',
    ];

    protected $casts = [
        'revision_no' => 'integer',
        'percent' => 'float',
    ];

    public function revision()
    {
        return $this->belongsTo(FeeSheetRevision::class);
    }
}
