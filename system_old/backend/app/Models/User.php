<?php
namespace App\Models;

use DateTimeInterface;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class User extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $table      = 'users';
    protected $softDelete = true;

    protected $hidden = ['password', 'deleted_at'];

    //////////////////////////////////////// format //////////////////////////////////////

    public function getImageAttribute($value)
    {
        return ($value ? url($value) : null);
    }

    protected function serializeDate(DateTimeInterface $date)
    {
        return $date->format('d/m/Y H:i:s');
    }

    //////////////////////////////////////// relation //////////////////////////////////////

    public function permission()
    {
        return $this->belongsTo(Permission::class);
    }

    public function feeSheetsAsDirector()
    {
        return $this->hasMany(FeeSheet::class, 'director_in_charge_id');
    }

    public function recruitment_companies()
    {
        return $this->hasMany(RecruitmentCompany::class);
    }

    public function products()
    {
        return $this->hasMany(ProductServiceCompany::class);
    }

    public function scraps()
    {
        return $this->hasMany(ScrapCompany::class);
    }

    public function puchases()
    {
        return $this->hasMany(PuchaseCompany::class);
    }

    public function logistics()
    {
        return $this->hasMany(LogisticCompany::class);
    }

    public function searchs()
    {
        return $this->hasMany(SearchLogCompany::class);
    }

    public function orders()
    {
        return $this->hasMany(Orders::class, 'create_by');
    }

    public function user_zone_markets()
    {
        return $this->hasMany(UserZoneMarket::class, 'user_id');
    }

    public function zoneMarkets()
    {
        return $this->belongsToMany(ZoneMarket::class, 'user_zone_markets');
    }
}
