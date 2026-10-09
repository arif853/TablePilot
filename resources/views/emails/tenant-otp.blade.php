@extends('emails.layout')

@section('content')
<h2 style="margin: 0 0 16px;">Verify your email</h2>

<p style="margin: 0 0 12px;">Hi {{ $user->name }},</p>

<p style="margin: 0 0 12px;">Use the OTP below to verify your restaurant registration for {{ $application->restaurant_name }}.</p>

<div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; padding: 16px 20px; background: #f3f4f6; border-radius: 12px; text-align: center; margin: 20px 0;">{{ $code }}</div>

<p style="margin: 0 0 12px;">This code expires in 10 minutes.</p>
<p style="margin: 0;">If you did not request this, you can safely ignore this email.</p>
@endsection
