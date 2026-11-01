<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { padding: 20px; }
        .footer { margin-top: 20px; font-weight: bold; }
        ul { list-style-type: disc; padding-left: 20px; }
        li { margin-bottom: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <p>Dear {{ $data['approver_name'] ?? 'Approver' }},</p>
        
        <p>Please be informed that a new request requires your attention. The details are provided below:</p>
        
        <ul>
            <li><strong>Document Name:</strong> {{ $data['document_name'] ?? '-' }}</li>
            @if(!empty($data['document_subject']))
                <li><strong>Subject:</strong> {{ $data['document_subject'] }}</li>
            @endif
            <li><strong>Requested by:</strong> {{ $data['requested_by'] ?? '-' }}</li>
            <li><strong>Request Date:</strong> {{ $data['request_date'] ?? '-' }}</li>
        </ul>
        
        @php($actionLink = $data['link'] ?? 'https://edms.meinhardt.net')
        <p>Please click the link below to review and take action: <a href="{{ $actionLink }}">{{ $actionLink }}</a></p>
        
        <div class="footer">
            Regards,<br>
            MTL Notification<br>
            Meinhardt (Thailand) Ltd.
        </div>
    </div>
</body>
</html>
