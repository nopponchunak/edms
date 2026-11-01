<?php

namespace App\Http\Controllers;

use App\Mail\NotificationMail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;

class NotificationController extends Controller
{
    /**
     * Send email notification based on template type.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\Response
     */
    public function sendEmail(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'template' => 'required|string|in:action_request,status_update',
            'to' => 'required|email',
            'subject' => 'required|string',
            'data' => 'required|array',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Validation failed',
                'errors' => $validator->errors()
            ], 400);
        }

        try {
            $template = $request->input('template');
            $to = $request->input('to');
            $subject = $request->input('subject');
            $data = $request->input('data');

            Mail::to($to)->send(new NotificationMail($template, $subject, $data));

            return response()->json([
                'status' => 'success',
                'message' => 'Email sent successfully'
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'Failed to send email: ' . $e->getMessage()
            ], 500);
        }
    }
}
