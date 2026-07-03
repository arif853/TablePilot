<?php

namespace App\Mail;

use App\Models\TenantApplication;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TenantOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public User $user,
        public TenantApplication $application,
        public string $code,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Verify your restaurant registration OTP',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.tenant-otp',
        );
    }
}
