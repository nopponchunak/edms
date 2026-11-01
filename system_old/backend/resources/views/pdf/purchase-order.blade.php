<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            color: #111;
            font-family: dejavusans, Arial, sans-serif;
            font-size: 8.8pt;
            line-height: 1.08;
        }

        .page {
            width: 100%;
        }

        .header-table,
        .field-table,
        .items-table,
        .signature-table,
        .check-table,
        .footer-note-table {
            width: 100%;
            border-collapse: collapse;
        }

        .header-table td {
            vertical-align: top;
        }

        .company-name {
            font-size: 10.4pt;
            font-weight: 700;
            line-height: 1.05;
        }

        .head-office {
            font-weight: 700;
            margin-top: .3mm;
        }

        .address-block {
            line-height: 1.1;
        }

        .contact-table {
            border-collapse: collapse;
            margin-top: 14mm;
            margin-left: auto;
            font-size: 8.4pt;
            line-height: 1.15;
        }

        .contact-table td {
            padding: 0 .5mm;
        }

        .logo-cell {
            text-align: right;
        }

        .logo {
            width: 34mm;
            height: auto;
        }

        .logo-text {
            font-size: 17pt;
            font-weight: 700;
            color: #234f8f;
        }

        .logo-text .orange {
            color: #e36f23;
        }

        .form-code {
            margin-top: .2mm;
            font-size: 7.5pt;
            font-weight: 700;
        }

        .title {
            margin: 3mm 0 4.4mm;
            text-align: center;
            color: #06488b;
            font-weight: 700;
            font-size: 11.5pt;
        }

        .field-table {
            margin-bottom: 1.45mm;
        }

        .field-table td {
            vertical-align: bottom;
            padding: 0;
        }

        .label {
            white-space: nowrap;
            padding-right: .6mm;
        }

        .line {
            border-bottom: .5pt solid #222;
            height: 4.2mm;
            padding: 0 .8mm .3mm;
            vertical-align: bottom;
            overflow: hidden;
        }

        .field-spacer {
            width: 3mm;
        }

        .items-table {
            table-layout: fixed;
            margin-top: 1.1mm;
            margin-bottom: 3.8mm;
        }

        .items-table th,
        .items-table td {
            border: .55pt solid #404040;
            padding: 1mm 1.2mm;
        }

        .items-table th {
            height: 8.4mm;
            text-align: center;
            vertical-align: middle;
            font-weight: 700;
            font-size: 8.7pt;
            line-height: 1.05;
        }

        .col-item {
            width: 15.3%;
        }

        .col-description {
            width: 34%;
        }

        .col-qty {
            width: 15.3%;
        }

        .col-price {
            width: 15.2%;
        }

        .col-amount {
            width: 20.2%;
        }

        .item-row {
            page-break-inside: avoid;
        }

        .item-row td {
            vertical-align: top;
            font-size: 8.1pt;
            line-height: 1.15;
        }

        .items-spacer td {
            height: 25mm;
        }

        .center {
            text-align: center;
        }

        .right {
            text-align: right;
        }

        .total-label,
        .total-value {
            height: 5mm;
            font-size: 9.2pt;
            font-weight: 700;
            vertical-align: middle;
        }

        .total-label {
            text-align: left;
        }

        .total-value {
            text-align: right;
            font-weight: 400;
        }

        .form-row {
            margin-bottom: 1.45mm;
        }

        .single-field {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 1.45mm;
        }

        .single-field td {
            padding: 0;
            vertical-align: bottom;
        }

        .payment-line {
            min-height: 6.8mm;
            line-height: 1.14;
        }

        .signature-table {
            margin-top: .4mm;
            font-size: 8.35pt;
        }

        .signature-table td {
            padding: 0 0 1mm;
            vertical-align: bottom;
        }

        .signature-label {
            width: 31mm;
            white-space: nowrap;
            padding-right: .7mm;
        }

        .signature-line {
            border-bottom: .5pt solid #222;
            height: 5.8mm;
            padding: 0 .7mm .1mm;
            overflow: visible;
            white-space: nowrap;
        }

        .signature-print-block {
            display: block;
            width: 100%;
            text-align: center;
            color: #174ea6;
            line-height: 1;
        }

        .signature-name {
            display: block;
            font-family: testimonia, dejavusans, sans-serif;
            font-size: 14.2pt;
            line-height: .72;
            white-space: nowrap;
        }

        .signature-id {
            display: block;
            margin-top: -.15mm;
            font-family: dejavusans, Arial, sans-serif;
            font-size: 4.8pt;
            line-height: 1;
            white-space: nowrap;
        }

        .role-caption {
            width: 37mm;
            white-space: nowrap;
            padding-left: .8mm;
            text-align: right;
        }

        .date-label {
            width: 9mm;
            white-space: nowrap;
            padding-left: 1.2mm;
            padding-right: .8mm;
        }

        .date-line {
            width: 46mm;
        }

        .check-table {
            margin: 2mm 0 1.4mm;
            font-size: 8.45pt;
        }

        .check-table td {
            padding: 0 0 1.1mm;
            vertical-align: middle;
        }

        .box {
            display: inline-block;
            width: 3.7mm;
            height: 3.7mm;
            border: .6pt solid #222;
            text-align: center;
            line-height: 3.1mm;
            font-size: 8pt;
            margin: 0 1.8mm 0 3.6mm;
        }

        .comments-row {
            margin-bottom: 1.5mm;
        }

        .policy-wrap {
            position: relative;
            margin-top: 1mm;
            padding-left: 4.8mm;
        }

        .revision-mark {
            position: absolute;
            left: 0;
            top: -2mm;
            font-weight: 700;
            font-size: 9.5pt;
        }

        .policy-box {
            border: 1.6pt solid #000;
            padding: 2mm 2.4mm;
            font-size: 7.2pt;
            line-height: 1.25;
        }

        .policy-email {
            color: #004cff;
            font-weight: 700;
        }
    </style>
</head>
<body>
<div class="page">
    <table class="header-table">
        <tr>
            <td style="width: 50%;">
                <div class="company-name">Meinhardt (Thailand) Ltd.</div>
                <div class="head-office">Head Office</div>
                <div class="address-block">
                    6<sup>th</sup>, 15<sup>th</sup>, 16<sup>th</sup> Floor, Thanapoom Tower<br>
                    1550 New Petchburi Road<br>
                    Makkasan, Ratchtevee<br>
                    Bangkok 10400<br>
                    Thailand<br>
                    Tax ID. No. 0105534077670
                </div>
            </td>
            <td class="logo-cell" style="width: 50%;">
                @if($logoPath)
                    <img class="logo" src="{{ $logoPath }}" alt="Meinhardt">
                @else
                    <div class="logo-text">MEIN<span class="orange">HARDT</span></div>
                @endif
                <div class="form-code">27 -FORM MTPC-03</div>
                <table class="contact-table">
                    <tr><td class="right">Office:</td><td>+66 (0) 2207-0568</td></tr>
                    <tr><td class="right">Fax:</td><td>+66 (0) 2207-0574</td></tr>
                    <tr><td class="right">e-mail:</td><td>thai@meinhardt.net</td></tr>
                    <tr><td class="right">Web site:</td><td>www.meinhardt.net</td></tr>
                </table>
            </td>
        </tr>
    </table>

    <div class="title">PURCHASE ORDER</div>

    <table class="field-table">
        <tr>
            <td class="label" style="width: 8mm;">To:</td>
            <td class="line" style="width: 92mm;">{{ $header['to'] }}</td>
            <td class="field-spacer"></td>
            <td class="label" style="width: 17mm;">PO. No.:</td>
            <td class="line">{{ $header['poNo'] }}</td>
        </tr>
    </table>
    <table class="field-table">
        <tr>
            <td class="label" style="width: 17mm;">Company:</td>
            <td class="line" style="width: 83mm;">{{ $header['company'] }}</td>
            <td class="field-spacer"></td>
            <td class="label" style="width: 18mm;">PO. Date:</td>
            <td class="line">{{ $header['poDate'] }}</td>
        </tr>
    </table>
    <table class="field-table">
        <tr>
            <td class="label" style="width: 14mm;">Fax No.:</td>
            <td class="line" style="width: 86mm;">{{ $header['fax'] }}</td>
            <td class="field-spacer"></td>
            <td class="label" style="width: 31mm;">Requisition Date:</td>
            <td class="line">{{ $header['requisitionDate'] }}</td>
        </tr>
    </table>
    <table class="field-table">
        <tr>
            <td class="label" style="width: 11mm;">From:</td>
            <td class="line" style="width: 89mm;">{{ $header['from'] }}</td>
            <td class="field-spacer"></td>
            <td class="label" style="width: 12mm;">Page:</td>
            <td class="line" style="width: 31mm;">{{ $header['page'] }}</td>
            <td class="label center" style="width: 5mm;">of</td>
            <td class="line">{{ $header['totalPage'] }}</td>
        </tr>
    </table>
    <table class="field-table">
        <tr>
            <td class="label" style="width: 6mm;">cc:</td>
            <td class="line" style="width: 94mm;">{{ $header['cc'] }}</td>
            <td class="field-spacer"></td>
            <td class="label" style="width: 11mm;">Circ:</td>
            <td class="line">{{ $header['circ'] }}</td>
            <td class="label" style="width: 18mm; padding-left: .8mm;">/File T6PC</td>
        </tr>
    </table>

    @php
        $showDiscount = $totals['discountValue'] > 0;
        $totalRows = $showDiscount ? 4 : 3;
    @endphp
    <table class="items-table">
        <thead>
        <tr>
            <th class="col-item">Item(s)</th>
            <th class="col-description">Description</th>
            <th class="col-qty">Quantity</th>
            <th class="col-price">Unit Price<br>({{ $currencyLabel }})</th>
            <th class="col-amount">Amount<br>({{ $currencyLabel }})</th>
        </tr>
        </thead>
        <tbody>
        @foreach($items as $item)
            <tr class="item-row">
                <td class="center">{{ $item['item'] }}</td>
                <td>{{ $item['description'] }}</td>
                <td class="center">{{ $item['quantity'] }}</td>
                <td class="right">{{ $item['unitPrice'] }}</td>
                <td class="right">{{ $item['amount'] }}</td>
            </tr>
        @endforeach
        @if(count($items) <= 4)
            <tr class="items-spacer">
                <td colspan="5">&nbsp;</td>
            </tr>
        @endif
        @if($showDiscount)
            <tr>
                <td colspan="2" rowspan="{{ $totalRows }}"></td>
                <td colspan="2" class="total-label">Discount</td>
                <td class="total-value">{{ $totals['discount'] }}</td>
            </tr>
            <tr>
                <td colspan="2" class="total-label">Sub Total</td>
                <td class="total-value">{{ $totals['subTotal'] }}</td>
            </tr>
        @else
            <tr>
                <td colspan="2" rowspan="{{ $totalRows }}"></td>
                <td colspan="2" class="total-label">Sub Total</td>
                <td class="total-value">{{ $totals['subTotal'] }}</td>
            </tr>
        @endif
        <tr>
            <td colspan="2" class="total-label">VAT 7%</td>
            <td class="total-value">{{ $totals['vat'] }}</td>
        </tr>
        <tr>
            <td colspan="2" class="total-label">Grand Total</td>
            <td class="total-value">{{ $totals['grandTotal'] }}</td>
        </tr>
        </tbody>
    </table>

    <table class="field-table form-row">
        <tr>
            <td class="label" style="width: 28mm;">Quotation No.:</td>
            <td class="line">{{ $general['quotationNo'] }}</td>
            <td class="field-spacer"></td>
            <td class="label" style="width: 10mm;">Date:</td>
            <td class="line" style="width: 46mm;">{{ $general['quotationDate'] }}</td>
        </tr>
    </table>

    <table class="single-field">
        <tr>
            <td class="label" style="width: 27mm;">Delivery Date:</td>
            <td class="line" style="width: 52mm;">{{ $general['deliveryDate'] }}</td>
            <td></td>
        </tr>
    </table>

    <table class="single-field">
        <tr>
            <td class="label" style="width: 31mm;">Payment Term:</td>
            <td class="line payment-line">{{ $general['paymentTerm'] }}</td>
        </tr>
    </table>

    <table class="single-field">
        <tr>
            <td class="label" style="width: 42mm;">Other conditions (if any):</td>
            <td class="line">{{ $general['otherConditions'] }}</td>
        </tr>
    </table>

    <table class="signature-table">
        <colgroup>
            <col style="width: 31mm;">
            <col>
            <col style="width: 37mm;">
            <col style="width: 9mm;">
            <col style="width: 46mm;">
        </colgroup>
        <tr>
            <td class="signature-label">Purchase Request by:</td>
            <td class="signature-line">{!! $approval['purchaseRequestBy'] !!}</td>
            <td class="role-caption">(Staff)</td>
            <td class="date-label">&nbsp;Date:</td>
            <td class="signature-line date-line">{{ $approval['purchaseRequestByDate'] }}</td>
        </tr>
        <tr>
            <td class="signature-label">Spare Part case: Verified by:</td>
            <td class="signature-line">{!! $approval['verifiedBy'] !!}</td>
            <td class="role-caption">(MD/DI/AD/TL)</td>
            <td class="date-label">&nbsp;Date:</td>
            <td class="signature-line date-line">{{ $approval['verifiedByDate'] }}</td>
        </tr>
        <tr>
            <td class="signature-label">Approved By:</td>
            <td class="signature-line">{!! $approval['approvedBy'] !!}</td>
            <td class="role-caption">(MD/DI)</td>
            <td class="date-label">&nbsp;Date:</td>
            <td class="signature-line date-line">{{ $approval['approvedByDate'] }}</td>
        </tr>
    </table>

    <table class="check-table">
        <tr>
            <td style="width: 31mm;">Delivery on time?</td>
            <td style="width: 28mm;"><span class="box">{!! $checklist['deliveryOnTime'] === true ? '&#10003;' : '' !!}</span>&nbsp;Yes</td>
            <td style="width: 35mm;"><span class="box">{!! $checklist['deliveryOnTime'] === false ? '&#10003;' : '' !!}</span>&nbsp;No</td>
            <td style="width: 46mm;">Meet quality requirement?</td>
            <td style="width: 28mm;"><span class="box">{!! $checklist['meetQualityRequirement'] === true ? '&#10003;' : '' !!}</span>&nbsp;Yes</td>
            <td><span class="box">{!! $checklist['meetQualityRequirement'] === false ? '&#10003;' : '' !!}</span>&nbsp;No</td>
        </tr>
        <tr>
            <td colspan="3">Meet guidelines for equipment purchasing?</td>
            <td><span class="box">{!! $checklist['meetEquipmentGuidelines'] === true ? '&#10003;' : '' !!}</span>&nbsp;Yes</td>
            <td colspan="2"><span class="box">{!! $checklist['meetEquipmentGuidelines'] === false ? '&#10003;' : '' !!}</span>&nbsp;No</td>
        </tr>
    </table>

    <table class="single-field comments-row">
        <tr>
            <td class="label" style="width: 21mm;">Comments:</td>
            <td class="line">{{ $general['comments'] }}</td>
        </tr>
    </table>

    <table class="signature-table">
        <colgroup>
            <col style="width: 18mm;">
            <col>
            <col style="width: 55mm;">
            <col style="width: 9mm;">
            <col style="width: 46mm;">
        </colgroup>
        <tr>
            <td class="signature-label">Signed by:</td>
            <td class="signature-line">{!! $approval['signedBy'] !!}</td>
            <td class="role-caption">(Requester/Inspector)</td>
            <td class="date-label">&nbsp;Date:</td>
            <td class="signature-line date-line">{{ $approval['signedByDate'] }}</td>
        </tr>
        <tr>
            <td class="signature-label">Acknowledged by:</td>
            <td class="signature-line">{!! $approval['acknowledgedBy'] !!}</td>
            <td class="role-caption">(ADM)</td>
            <td class="date-label">&nbsp;Date:</td>
            <td class="signature-line date-line">{{ $approval['acknowledgedByDate'] }}</td>
        </tr>
    </table>

    <div class="policy-wrap">
        <div class="revision-mark">B</div>
        <div class="policy-box">
            Meinhardt (Thailand) Ltd. operates a strict zero tolerance Policy to bribery, fraud and other serious misconduct such as corruption and theft.
            &nbsp; Please notify us at <span class="policy-email">acsc@meinhardt.net</span> to raise any concerns with respect to non-compliance with this Policy in confidence.
        </div>
    </div>
</div>
</body>
</html>
