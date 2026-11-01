<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SignatureSetting extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table = 'signature_settings';

    protected $fillable = [
        'employee_code',
        'is_active',
        'create_by',
        'update_by',
    ];

    protected $casts = [
        'is_active' => 'integer',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_code', 'code');
    }
}
