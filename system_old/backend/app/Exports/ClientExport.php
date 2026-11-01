<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;

class ClientExport implements FromArray, WithHeadings
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
            'ลำดับ',
            'วันที่',
            'ชื่อ',
            'เบอร์โทร',
            'สายไหนเหมาะกับคุณ',
            'รุ่นที่คุณเลือก',
        ];
    }
}
