<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ProposalContractReview extends Model
{
    use HasFactory;
    use SoftDeletes;

    public function feeSheets()
    {
        return $this->hasMany(FeeSheet::class, 'project_id');
    }

}
