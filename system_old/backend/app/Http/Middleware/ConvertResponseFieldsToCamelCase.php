<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ConvertResponseFieldsToCamelCase
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @return mixed
     */
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);
        $content = $response->content();
        try {
            $json = json_decode($content, true);
            // dd($json);
            $replaced = [];
            foreach ($json as $key => $value) {
                $replaced[Str::camel($key)] = $value;
            }
            $response->setContent(json_encode($replaced));
        } catch (\Exception $e) {
            // you can log an error here if you want
        }

        return $response;
    }
}
