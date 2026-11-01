<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;

class PurchaseOrderExport implements FromArray, WithHeadings
{
    protected $data;

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
            'PO No.',
            'Subject',
            'Company',
            'To',
            'PO Date',
            'Requisition Date',
            'Workflow Status',
            'Currency',
            'Sub Total',
            'VAT',
            'Discount',
            'Grand Total',
            'Purchase Request By',
            'Spare Part Verified By',
            'Approved By',
            'CIRC',
            'Signed By',
            'Acknowledged By',
            'Created By',
            'Created At',
        ];
    }
}
