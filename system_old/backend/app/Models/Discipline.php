<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Discipline extends Model
{
    use HasFactory;
    use SoftDeletes;
    protected $table = 'disciplines';

    protected $fillable = [
        'code',
        'name',
        'detail',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'integer',
    ];

    public function feeSheets()
    {
        return $this->hasMany(FeeSheet::class, 'discipline_id');
    }

}
