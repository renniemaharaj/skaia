package email

import (
	"fmt"
	"html"
	"os"
	"strings"
)

func baseURL() string {
	if v := os.Getenv("BASE_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	domains := strings.Fields(os.Getenv("DOMAINS"))
	if len(domains) > 0 {
		d := domains[0]
		if !strings.HasPrefix(d, "http://") && !strings.HasPrefix(d, "https://") {
			d = "https://" + d
		}
		return strings.TrimRight(d, "/")
	}
	return "http://localhost:5173"
}

func siteName() string {
	if v := os.Getenv("SITE_NAME"); v != "" {
		return v
	}
	if cn := os.Getenv("CLIENT_NAME"); cn != "" {
		return strings.Title(cn)
	}
	return "Skaia"
}

func wrap(title, body string) string {
	name := html.EscapeString(siteName())
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s</title>
<style>
body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f4f4f5;color:#18181b}
.container{max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.header{background:#18181b;color:#fff;padding:24px 32px;text-align:center}
.header h1{margin:0;font-size:20px;font-weight:600}
.body{padding:32px}
.body p{margin:0 0 16px;line-height:1.6;font-size:15px}
.btn{display:inline-block;background:#2563eb;color:#fff !important;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px}
.footer{padding:20px 32px;text-align:center;font-size:12px;color:#71717a;border-top:1px solid #e4e4e7}
code{background:#f4f4f5;padding:2px 6px;border-radius:4px;font-size:14px;font-family:monospace}
.code-block{background:#f4f4f5;padding:16px 20px;border-radius:8px;text-align:center;font-size:28px;letter-spacing:6px;font-weight:700;font-family:monospace;margin:16px 0}
</style>
</head>
<body>
<div class="container">
<div class="header"><h1>%s</h1></div>
<div class="body">%s</div>
<div class="footer">This email was sent by %s. If you did not request this, you can safely ignore it.</div>
</div>
</body>
</html>`, html.EscapeString(title), name, body, name)
}

// VerifyEmailHTML builds the HTML for email verification.
func VerifyEmailHTML(username, token string) string {
	link := fmt.Sprintf("%s/verify-email?token=%s", baseURL(), token)
	body := fmt.Sprintf(`<p>Hi <strong>%s</strong>,</p>
<p>Welcome! Please verify your email address by clicking the button below:</p>
<p style="text-align:center;margin:24px 0">
<a class="btn" href="%s">Verify Email</a>
</p>
<p>Or copy this link into your browser:</p>
<p style="word-break:break-all;font-size:13px;color:#71717a">%s</p>
<p>This link expires in 24 hours.</p>`,
		html.EscapeString(username), html.EscapeString(link), html.EscapeString(link))
	return wrap("Verify Your Email", body)
}

// PasswordResetHTML builds the HTML for password recovery.
func PasswordResetHTML(username, token string) string {
	link := fmt.Sprintf("%s/reset-password?token=%s", baseURL(), token)
	body := fmt.Sprintf(`<p>Hi <strong>%s</strong>,</p>
<p>We received a request to reset your password. Click the button below to set a new password:</p>
<p style="text-align:center;margin:24px 0">
<a class="btn" href="%s">Reset Password</a>
</p>
<p>Or copy this link into your browser:</p>
<p style="word-break:break-all;font-size:13px;color:#71717a">%s</p>
<p>This link expires in 1 hour. If you did not request a password reset, no action is needed.</p>`,
		html.EscapeString(username), html.EscapeString(link), html.EscapeString(link))
	return wrap("Reset Your Password", body)
}

// TOTPEnabledHTML notifies the user that 2FA has been activated.
func TOTPEnabledHTML(username string) string {
	body := fmt.Sprintf(`<p>Hi <strong>%s</strong>,</p>
<p>Two-factor authentication has been <strong>enabled</strong> on your account.</p>
<p>You will now need to enter a code from your authenticator app each time you sign in.</p>
<p>If you did not enable this, please secure your account immediately by changing your password.</p>`,
		html.EscapeString(username))
	return wrap("Two-Factor Authentication Enabled", body)
}

// TOTPDisabledHTML notifies the user that 2FA has been deactivated.
func TOTPDisabledHTML(username string) string {
	body := fmt.Sprintf(`<p>Hi <strong>%s</strong>,</p>
<p>Two-factor authentication has been <strong>disabled</strong> on your account.</p>
<p>Your account is now protected by password only. We recommend re-enabling 2FA for better security.</p>`,
		html.EscapeString(username))
	return wrap("Two-Factor Authentication Disabled", body)
}

// PasswordChangedHTML notifies the user that their password was changed.
func PasswordChangedHTML(username string) string {
	body := fmt.Sprintf(`<p>Hi <strong>%s</strong>,</p>
<p>Your password has been successfully changed.</p>
<p>If you did not make this change, please reset your password immediately or contact support.</p>`,
		html.EscapeString(username))
	return wrap("Password Changed", body)
}
