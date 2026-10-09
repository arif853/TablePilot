<?php

namespace App\Mail;

use App\Models\TenantApplication;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TenantApplicationApprovalMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public TenantApplication $application,
        public bool $approved,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->approved
                ? 'Your restaurant application has been approved'
                : 'Your restaurant application update',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.tenant-approval',
        );
    }
}
