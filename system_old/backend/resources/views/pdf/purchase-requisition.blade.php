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
            color: #1f1f1f;
            font-family: dejavusans, Arial, sans-serif;
            font-size: 9.2pt;
            line-height: 1.22;
        }

        .page {
            width: 100%;
        }

        .header-table,
        .field-table,
        .items-table,
        .signature-table,
        .footer-table {
            width: 100%;
            border-collapse: collapse;
        }

        .header-table td {
            vertical-align: top;
        }

        .company-name {
            padding-top: 4.2mm;
            font-weight: 700;
            font-size: 10pt;
        }

        .logo-cell {
            padding-top: 2mm;
            text-align: right;
            font-size: 7.6pt;
            font-weight: 700;
        }

        .logo {
            width: 32mm;
            height: auto;
        }

        .logo-text {
            font-size: 17pt;
            font-weight: 700;
            color: #234f8f;
            letter-spacing: .4px;
        }

        .logo-text .orange {
            color: #e36f23;
        }

        .form-code {
            margin-top: .6mm;
        }

        .title {
            margin: 6mm 0 6.4mm;
            text-align: center;
            color: #1e5596;
            font-weight: 700;
            font-size: 10.6pt;
        }

        .field-table {
            margin-bottom: 1.35mm;
        }

        .field-table td {
            vertical-align: bottom;
            padding: 0;
        }

        .field-spacer {
            width: 5mm;
        }

        .label {
            white-space: nowrap;
            padding-right: 1.2mm;
        }

        .line {
            border-bottom: .45pt solid #222;
            height: 4.6mm;
            padding: 0 .8mm .4mm;
            vertical-align: bottom;
            white-space: nowrap;
            overflow: hidden;
        }

        .suffix {
            white-space: nowrap;
            padding-left: 1.1mm;
        }

        .reason-table {
            width: 100%;
            border-collapse: collapse;
            margin: .8mm 0 3.1mm;
        }

        .reason-table td {
            padding: 0;
            vertical-align: top;
        }

        .reason-value {
            border-bottom: .45pt solid #222;
            min-height: 4.8mm;
            padding: 0 .8mm .4mm;
            line-height: 1.22;
            overflow: visible;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
            word-wrap: break-word;
        }

        .reason-line {
            border-bottom: .45pt solid #222;
            height: 5.9mm;
        }

        .items-table {
            table-layout: fixed;
            margin-bottom: 2.8mm;
        }

        .items-table th,
        .items-table td {
            border: .55pt solid #858585;
            padding: 1.1mm 1.3mm;
        }

        .items-table th {
            height: 10.5mm;
            text-align: center;
            vertical-align: top;
            font-weight: 700;
            font-size: 8.6pt;
        }

        .items-table .col-item {
            width: 13.3%;
        }

        .items-table .col-description {
            width: 39%;
        }

        .items-table .col-qty {
            width: 13.2%;
        }

        .items-table .col-price {
            width: 17%;
        }

        .items-table .col-amount {
            width: 17.5%;
        }

        .body-cell {
            vertical-align: top;
            font-size: 8.45pt;
        }

        .item-row {
            page-break-inside: avoid;
        }

        .item-row td {
            vertical-align: top;
            font-size: 8.15pt;
            line-height: 1.14;
            border-top: 0;
            border-bottom: 0;
        }

        .description-cell {
            line-height: 1.14;
        }

        .items-spacer td {
            height: 105mm;
            border-top: 0;
            border-bottom: .55pt solid #858585;
        }

        .center {
            text-align: center;
        }

        .right {
            text-align: right;
        }

        .total-label {
            font-size: 8.6pt;
            height: 5.4mm;
            vertical-align: middle;
            font-weight: 400;
        }

        .total-value {
            font-size: 8.6pt;
            height: 5.4mm;
            vertical-align: middle;
            text-align: right;
        }

        .notes {
            width: 100%;
            border-collapse: collapse;
            margin-top: .5mm;
            margin-bottom: 2.2mm;
            font-size: 8.15pt;
            line-height: 1.25;
        }

        .notes td {
            padding: 0 0 1.45mm;
        }

        .underline {
            text-decoration: underline;
        }

        .conditions-table {
            width: 100%;
            border-collapse: collapse;
            margin: 0 0 2mm;
        }

        .conditions-table td {
            padding: 0;
            vertical-align: bottom;
        }

        .quotation-note {
            font-size: 8.1pt;
            margin-bottom: 2.9mm;
        }

        .signature-table {
            font-size: 8.35pt;
            table-layout: fixed;
        }

        .signature-table td {
            padding: 0 0 2.05mm;
            vertical-align: bottom;
        }

        .signature-label {
            width: 25mm;
            white-space: nowrap;
            padding-right: 1.3mm;
        }

        .signature-line {
            border-bottom: .35pt solid #555;
            height: 5.5mm;
            padding: 0 .7mm .15mm;
            white-space: nowrap;
            overflow: visible;
            text-align: left;
        }

        .signature-print-block {
            display: block;
            width: 100%;
            text-align: center;
            line-height: 1;
            color: #174ea6;
        }

        .signature-name {
            display: block;
            font-family: testimonia, dejavusans, sans-serif;
            font-size: 16.5pt;
            line-height: .72;
            white-space: nowrap;
        }

        .signature-id {
            display: block;
            margin-top: -.25mm;
            font-family: dejavusans, Arial, sans-serif;
            font-size: 5.2pt;
            line-height: 1;
            white-space: nowrap;
        }

        .signature-caption {
            width: 47mm;
            padding-left: 2mm;
            white-space: nowrap;
        }

        .date-label {
            width: 9mm;
            padding-left: 1mm;
            padding-right: 1mm;
            white-space: nowrap;
        }

        .date-line {
            width: 37mm;
        }

        .checkbox-row td {
            padding-top: .2mm;
            padding-bottom: 2.2mm;
        }

        .asset-table {
            border-collapse: collapse;
            width: 105mm;
        }

        .asset-table td {
            padding: 0;
            vertical-align: middle;
        }

        .asset-question {
            width: 57mm;
            white-space: nowrap;
        }

        .asset-box {
            width: 4mm;
            height: 4mm;
            border: .55pt solid #666;
            text-align: center;
            font-size: 8pt;
            line-height: 3.2mm;
        }

        .asset-answer {
            width: 20mm;
            padding-left: 2.5mm;
            white-space: nowrap;
        }

    </style>
</head>
<body>
<div class="page">
    <table class="header-table">
        <tr>
            <td class="company-name">Meinhardt (Thailand) Ltd.</td>
            <td class="logo-cell">
                @if($logoPath)
                    <img class="logo" src="{{ $logoPath }}" alt="Meinhardt">
                @else
                    <div class="logo-text">MEIN<span class="orange">HARDT</span></div>
                @endif
                <div class="form-code">27 - FORM MTPC-02</div>
            </td>
        </tr>
    </table>

    <div class="title">PURCHASE REQUISITION FORM</div>

    <table class="field-table">
        <tr>
            <td class="label" style="width: 15mm;">PR No:</td>
            <td class="line" style="width: 73mm;">{{ $header['prNo'] }}</td>
            <td class="field-spacer"></td>
            <td class="label" style="width: 10mm;">Date:</td>
            <td class="line">{{ $header['date'] }}</td>
        </tr>
    </table>

    <table class="field-table">
        <tr>
            <td class="label" style="width: 8mm;">To:</td>
            <td class="line">{{ $header['to'] }}</td>
        </tr>
    </table>

    <table class="field-table">
        <tr>
            <td class="label" style="width: 25mm;">Requested By</td>
            <td class="line" style="width: 63mm;">{{ $header['requestedBy'] }}</td>
            <td class="field-spacer"></td>
            <td class="label" style="width: 29mm;">Recommended By:</td>
            <td class="line">{{ $header['recommendedBy'] }}</td>
            <td class="suffix">(if any)</td>
        </tr>
    </table>

    <table class="field-table">
        <tr>
            <td class="label" style="width: 18mm;">Deadline:</td>
            <td class="line" style="width: 70mm;">{{ $header['deadline'] }}</td>
            <td class="suffix">(if any)</td>
            <td class="field-spacer"></td>
            <td class="label" style="width: 28mm;">Received From:</td>
            <td class="line">{{ $header['receivedFrom'] }}</td>
            <td class="suffix">(if any)</td>
        </tr>
    </table>

    <table class="reason-table">
        <tr>
            <td class="label" style="width: 32mm;">Reasons for Purchase:</td>
            <td class="reason-value">&nbsp;{{ $header['reasonsForPurchase'] }}</td>
        </tr>
        <tr><td colspan="2" class="reason-line"></td></tr>
        <tr><td colspan="2" class="reason-line"></td></tr>
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
            <th class="col-price">*Unit Price<br>({{ $currencyLabel }})</th>
            <th class="col-amount">*Amount ({{ $currencyLabel }})</th>
        </tr>
        </thead>
        <tbody>
        @foreach($items as $item)
            <tr class="item-row">
                <td class="body-cell center">{{ $item['item'] }}</td>
                <td class="body-cell description-cell">{{ $item['description'] }}</td>
                <td class="body-cell center">{{ $item['quantity'] }}</td>
                <td class="body-cell right">{{ $item['unitPrice'] }}</td>
                <td class="body-cell right">{{ $item['amount'] }}</td>
            </tr>
        @endforeach
        @if(count($items) <= 4)
            <tr class="items-spacer">
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
            </tr>
        @endif
        @if($showDiscount)
            <tr>
                <td colspan="2" rowspan="{{ $totalRows }}"></td>
                <td colspan="2" class="total-label">Discount</td>
                <td class="total-value">{{ $totals['discount'] }}</td>
            </tr>
        @else
            <tr>
                <td colspan="2" rowspan="{{ $totalRows }}"></td>
                <td colspan="2" class="total-label">Sub Total</td>
                <td class="total-value">{{ $totals['subTotal'] }}</td>
            </tr>
        @endif
        @if($showDiscount)
            <tr>
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

    <table class="notes">
        <tr>
            <td style="width: 24mm; vertical-align: top;"><span class="underline">Note:</span></td>
            <td>In case of purchasing software and/or IT equipment, this request must be verified by IT department to confirm our existing hardware is adequate and doesn't need any further upgrading.</td>
        </tr>
        <tr>
            <td style="width: 24mm; vertical-align: top;">Payment Term:</td>
            <td>{{ $terms['paymentTerm'] }}</td>
        </tr>
    </table>

    <table class="conditions-table">
        <tr>
            <td class="label" style="width: 40mm;">Other conditions (if any):</td>
            <td class="line">&nbsp;{{ $terms['otherConditions'] }}</td>
        </tr>
    </table>

    <div class="quotation-note">*Please fill in the price and attach quotation (if any)</div>

    <table class="signature-table">
        <colgroup>
            <col style="width: 25mm;">
            <col>
            <col style="width: 44mm;">
            <col style="width: 9mm;">
            <col style="width: 36mm;">
        </colgroup>
        <tr>
            <td class="signature-label">Requested By:</td>
            <td class="signature-line">{!! $approval['requestedBy'] !!}</td>
            <td class="signature-caption"></td>
            <td class="date-label">Date:</td>
            <td class="signature-line date-line">{{ $approval['requestedDate'] }}</td>
        </tr>
        <tr>
            <td class="signature-label">Verified By:</td>
            <td class="signature-line">{!! $approval['verifiedByIS'] !!}</td>
            <td class="signature-caption">(IS for all IT equipment only.)</td>
            <td class="date-label">Date:</td>
            <td class="signature-line date-line">{{ $approval['verifiedByISDate'] }}</td>
        </tr>
        <tr>
            <td class="signature-label">Verified By:</td>
            <td class="signature-line">{!! $approval['verifiedBy'] !!}</td>
            <td class="signature-caption">(MD/DI/AD/TL)</td>
            <td class="date-label">Date:</td>
            <td class="signature-line date-line">{{ $approval['verifiedByDate'] }}</td>
        </tr>
        <tr>
            <td class="signature-label">Approved By:</td>
            <td class="signature-line">{!! $approval['approvedBy'] !!}</td>
            <td class="signature-caption">(MD/DI)</td>
            <td class="date-label">Date:</td>
            <td class="signature-line date-line">{{ $approval['approvedByDate'] }}</td>
        </tr>
        @if($approval['showApprovedBy2'])
            <tr>
                <td class="signature-label">Approved By 2:</td>
                <td class="signature-line">{!! $approval['approvedBy2'] !!}</td>
                <td class="signature-caption">(Grand total over 50,000)</td>
                <td class="date-label">Date:</td>
                <td class="signature-line date-line">{{ $approval['approvedBy2Date'] }}</td>
            </tr>
        @endif
        <tr>
            <td class="signature-label">Acknowledged:</td>
            <td class="signature-line">{!! $approval['acknowledgedBy'] !!}</td>
            <td class="signature-caption">(CA)</td>
            <td class="date-label">Date:</td>
            <td class="signature-line date-line">{{ $approval['acknowledgedDate'] }}</td>
        </tr>
        <tr class="checkbox-row">
            <td colspan="5">
                <table class="asset-table">
                    <tr>
                        <td class="asset-question">Need asset code registration?</td>
                        <td class="asset-box">{{ $approval['needAssetCodeRegistration'] === 'yes' ? '✓' : '' }}</td>
                        <td class="asset-answer">&nbsp;&nbsp;Yes</td>
                        <td class="asset-box">{{ $approval['needAssetCodeRegistration'] === 'no' ? '✓' : '' }}</td>
                        <td class="asset-answer">&nbsp;&nbsp;No</td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td class="signature-label">Action by:</td>
            <td class="signature-line">{!! $approval['actionByAdmin'] !!}</td>
            <td class="signature-caption">(ADM)</td>
            <td class="date-label">Date:</td>
            <td class="signature-line date-line">{{ $approval['actionByAdminDate'] }}</td>
        </tr>
    </table>
</div>
</body>
</html>
