<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;

class ProductExport implements FromArray, WithHeadings
{
    protected $data;
    public function __construct(array $data)
    {
        $this->data = $data;

    }
    function array(): array
    {
        return $this->data;
    }

    public function headings(): array
    {
        return [
            'รหัสสินค้า',
            'ชื่อสินค้า',
            'ประเภทสินค้าหลัก',
            'ประเภทสินค้า',
            'คลังเก็บ',
            'ตู้เก็บ',
            'ชั้นเก็บ',
            'ช่องเก็บ',
            'จำนวนคงเหลือ',
            'สร้างโดย',
            'วันที่สร้าง',
            'วันที่แก้ไข',
        ];
    }
}
