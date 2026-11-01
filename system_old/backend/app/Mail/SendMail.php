<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class SendMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * Create a new message instance.
     *
     * @return void
     */
    public function __construct($email, $data, $title, $type)
    {
        $this->email = $email;
        $this->data = $data;
        $this->title = $title;
        $this->type = $type;
        // dd($type);

    }

    /**
     * Build the message.
     *
     * @return $this
     */
    public function build()
    {
        return $this
            ->from('sup.edupol@gmail.com')
            ->subject('โปรแกรมระบบฐานข้อมูลผู้ผ่านการศึกษาอบรม: ' . $this->title)
            ->view('send_mail')
            ->with([
                'data' => $this->data,
                'email' => $this->email,
                'title' => $this->title,
                'type' => $this->type,
            ]);
    }
}
