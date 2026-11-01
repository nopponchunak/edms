<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;

class UserExport implements FromArray, WithHeadings
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
            'ชื่อบัญชีผู้ใช้งาน',
            'รหัสผ่าน',
            'ชื่อเจ้าหน้าที่',
            'อีเมล์',
            'ประเภทเจ้าหน้าที่',
            'ชื่อสิทธิ์การใช้งาน',
            'รหัสกองบัญชาการ',
            'รหัสกองบังคับกร',
            'รหัสกองกำกับการ',
            'รหัสตำแหน่ง',
            'รหัสประเภทยศ',
            'รหัสยศ',

            'สถานะ',
            'สร้างโดย',
            'วันที่สร้าง',
            'วันที่แก้ไข',

        ];
    }
}
