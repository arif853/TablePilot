<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; color: #333; }
        .container { max-width: 600px; margin: 0 auto; background: #fff; }
        .header { background-color: #DD6B12; padding: 24px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 600; }
        .content { padding: 32px 24px; }
        .content p { line-height: 1.6; margin: 12px 0; font-size: 15px; }
        .btn { display: inline-block; background-color: #DD6B12; color: #ffffff !important; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 16px 0; font-size: 15px; }
        .btn:hover { background-color: #B8560E; }
        .footer { padding: 20px 24px; text-align: center; font-size: 13px; color: #888; border-top: 1px solid #eee; }
        .alert-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 16px; margin: 16px 0; border-radius: 4px; }
        .danger-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 16px; margin: 16px 0; border-radius: 4px; }
        .info-box { background: #FFF7ED; border-left: 4px solid #ED802A; padding: 14px 16px; margin: 16px 0; border-radius: 4px; }
        .detail-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .detail-table td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
        .detail-table td:first-child { font-weight: 600; color: #555; width: 40%; }
        code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{ config('app.name') }}</h1>
        </div>
        <div class="content">
            @yield('body')
        </div>
        <div class="footer">
            <p>&copy; {{ date('Y') }} {{ config('app.name') }}. All rights reserved.</p>
            <p>This is an automated email. Please do not reply directly.</p>
        </div>
    </div>
</body>
</html>
