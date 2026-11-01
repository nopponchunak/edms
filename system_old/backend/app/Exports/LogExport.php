<?php

namespace App\Exports;

use App\Log;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;

class LogExport implements FromArray , WithHeadings
{
    protected  $data;
    public function __construct(array $data)
   {
       $this->data = $data;

   }
    public function array(): array
   {
       return $this->data;
   }

   public function headings(): array
   {
       return [
           'รหัสเจ้าหน้าที่',
           'รายละเอียด',
           'ประเภท',
           'วันที่สร้าง',
           'วันที่แก้ไข',
       ];
   }
}
