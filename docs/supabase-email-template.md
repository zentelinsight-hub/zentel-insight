# Supabase Email OTP Template

Use this document when configuring the hosted Supabase email template for Zentel Insight.

## Site URL

```text
https://zentelinsight.com.ng
```

## Redirect URLs

```text
http://localhost:5173/**
https://zentelinsight.com.ng/**
https://www.zentelinsight.com.ng/**
```

## Confirm Signup Template

Configure the Supabase **Confirm signup** email template to show the six-digit OTP using:

```text
{{ .Token }}
```

Suggested email body:

```html
<h1>Zentel Insight</h1>
<p>Inspiring Creativity, Empowering Minds.</p>
<p>Use the verification code below to confirm your Zentel Insight account:</p>
<p style="font-size: 32px; font-weight: 800; letter-spacing: 6px;">{{ .Token }}</p>
<p>This code expires soon. If you did not request this account, you can ignore this email.</p>
<p>For support, contact zentelinsight@gmail.com.</p>
```

Do not add external tracking pixels. Do not claim OTP email verification is live until this hosted template and the redirect URLs have been configured in Supabase.
