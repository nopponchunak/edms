<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;

use Illuminate\Database\Eloquent\Model;

class FeeAgreement extends Model
{
    use HasFactory;
    use SoftDeletes;
    protected $fillable = [
        'revision_id',
        'revision_no',
        'revision_label',
        'revision_name',
        'gross_fee_excl_vat',
        'less_subconsultants_name',
        'less_subconsultants_number',
        'less_other_expenses_name',
        'less_other_expenses',
        'net_fee_excl_vat',
        'agreement_received',
    ];

    protected $casts = [
        'revision_no' => 'integer',
        'gross_fee_excl_vat' => 'float',
        'less_subconsultants_number' => 'float',
        'less_other_expenses' => 'float',
        'net_fee_excl_vat' => 'float',
    ];

    public function revision()
    {
        return $this->belongsTo(FeeSheetRevision::class);
    }

    public function lineItems()
    {
        return $this->hasMany(FeeAgreementLineItem::class)->orderBy('sort_order');
    }
}
