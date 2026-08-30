{{--
    The one wrapper every email in this kit renders inside.

    Written for EMAIL CLIENTS, not browsers — which is a different, older
    target than the rest of your app:

      • Tables for layout. Outlook renders on Word's engine; flex and grid do
        not exist there.
      • Inline styles on every element. Gmail strips <style> blocks in a
        forwarded message, and several clients strip them outright.
      • No external CSS, no web fonts, no JavaScript.
      • A max width around 600px — the widest that survives a phone's preview
        pane without horizontal scrolling.

    The admin's body HTML lands in {!! $bodyHtml !!}. It may use two helper
    classes that this layout styles for it: `.btn` (call-to-action link) and
    `.code` (a large monospace OTP). Since inline styles are required, those
    two are also given inline fallbacks by the <style> block below — clients
    that keep <style> get the nicer version, the rest still read fine.
--}}
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $brand['name'] ?? config('app.name') }}</title>
<style>
    /* Progressive enhancement only — never the sole source of a style. */
    .btn {
        display: inline-block;
        padding: 12px 26px;
        background: {{ $brand['accent'] ?? '#4f46e5' }};
        color: #ffffff !important;
        text-decoration: none;
        border-radius: 10px;
        font-weight: bold;
        font-size: 15px;
    }
    .code {
        font-family: 'Courier New', Courier, monospace;
        font-size: 32px;
        font-weight: bold;
        letter-spacing: 6px;
        color: {{ $brand['accent'] ?? '#4f46e5' }};
        background: #f1f5f9;
        padding: 14px 20px;
        border-radius: 10px;
        text-align: center;
    }
    .email-body table { border-collapse: collapse; width: 100%; }
    .email-body th, .email-body td { padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 14px; }
    @media (max-width: 620px) {
        .email-card { width: 100% !important; border-radius: 0 !important; }
        .email-pad  { padding: 24px 18px !important; }
    }
</style>
</head>
<body style="margin:0; padding:0; background:#f1f5f9; -webkit-font-smoothing:antialiased;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9; padding:24px 12px;">
<tr>
<td align="center">

    <table role="presentation" class="email-card" width="600" cellpadding="0" cellspacing="0"
           style="width:600px; max-width:600px; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,0.08); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">

        {{-- Header: logo when one is configured, otherwise the brand name. --}}
        <tr>
            <td class="email-pad" align="center"
                style="padding:28px 32px 20px; border-bottom:1px solid #e2e8f0;">
                @if (!empty($brand['logo_url']))
                    <img src="{{ $brand['logo_url'] }}" alt="{{ $brand['name'] }}"
                         width="56" height="56"
                         style="display:block; width:56px; height:56px; border-radius:12px; border:0;">
                @else
                    <div style="font-size:20px; font-weight:bold; color:{{ $brand['accent'] ?? '#4f46e5' }};">
                        {{ $brand['name'] }}
                    </div>
                @endif
            </td>
        </tr>

        {{-- Body: the admin's rendered template. --}}
        <tr>
            <td class="email-pad email-body"
                style="padding:28px 32px; color:#334155; font-size:15px; line-height:1.65;">
                {!! $bodyHtml !!}
            </td>
        </tr>

        {{-- Footer --}}
        <tr>
            <td class="email-pad" align="center"
                style="padding:20px 32px 28px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:12px; line-height:1.6;">
                @if (!empty($brand['site_url']))
                    <a href="{{ $brand['site_url'] }}"
                       style="color:{{ $brand['accent'] ?? '#4f46e5' }}; text-decoration:none; font-weight:bold;">
                        {{ preg_replace('#^https?://#', '', $brand['site_url']) }}
                    </a><br>
                @endif
                &copy; {{ date('Y') }} {{ $brand['name'] }}
                @if (!empty($brand['footer_note']))
                    <br>{{ $brand['footer_note'] }}
                @endif
            </td>
        </tr>

    </table>

</td>
</tr>
</table>

</body>
</html>
