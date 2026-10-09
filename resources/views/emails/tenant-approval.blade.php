@extends('emails.layout')

@section('content')
<h2 style="margin: 0 0 16px;">Restaurant application {{ $approved ? 'approved' : 'updated' }}</h2>

<p style="margin: 0 0 12px;">Hi {{ $application->user->name }},</p>

@if($approved)
    <p style="margin: 0 0 12px;">Your restaurant {{ $application->restaurant_name }} has been approved. You can now log in to your tenant dashboard.</p>
@else
    <p style="margin: 0 0 12px;">Your restaurant application for {{ $application->restaurant_name }} was reviewed by our admin team.</p>
    <p style="margin: 0 0 12px;">You can re-apply after updating your details if needed.</p>
@endif

@if(!empty($application->approval_notes))
    <p style="margin: 16px 0 0;"><strong>Notes:</strong> {{ $application->approval_notes }}</p>
@endif
@endsection
