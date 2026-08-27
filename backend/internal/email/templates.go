package email

import (
	"fmt"
	"html"
	"net/url"
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
	if v := strings.TrimSpace(os.Getenv("SITE_NAME")); v != "" {
		return v
	}
	if cn := strings.TrimSpace(os.Getenv("CLIENT_NAME")); cn != "" {
		return titleCaser.String(cn)
	}
	return "Go Web Platform"
}

func actionURL(path, token string) string {
	return fmt.Sprintf("%s/%s?token=%s", baseURL(), strings.TrimLeft(path, "/"), url.QueryEscape(token))
}

func transactionalMessage(subject, preview, greeting, body, actionLabel, actionLink, securityNote string) Message {
	name := siteName()
	text := greeting + "\n\n" + body
	if actionLink != "" {
		text += "\n\n" + actionLabel + ":\n" + actionLink
	}
	if securityNote != "" {
		text += "\n\n" + securityNote
	}
	text += "\n\n- " + name

	action := ""
	if actionLink != "" {
		action = fmt.Sprintf(`<tr><td style="padding:8px 32px 24px"><a href="%s" style="display:inline-block;background:#167d70;color:#fff;text-decoration:none;font-size:15px;font-weight:650;line-height:20px;padding:12px 20px;border-radius:8px">%s</a></td></tr><tr><td style="padding:0 32px 24px;color:#667085;font-size:12px;line-height:18px">Button not working? Copy and paste this link:<br><a href="%s" style="color:#167d70;word-break:break-all">%s</a></td></tr>`, html.EscapeString(actionLink), html.EscapeString(actionLabel), html.EscapeString(actionLink), html.EscapeString(actionLink))
	}
	note := ""
	if securityNote != "" {
		note = fmt.Sprintf(`<tr><td style="padding:16px 32px 28px;border-top:1px solid #eaecf0;color:#667085;font-size:12px;line-height:18px">%s</td></tr>`, html.EscapeString(securityNote))
	}
	htmlBody := fmt.Sprintf(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>%s</title></head><body style="margin:0;background:#f7f8fa;color:#182230;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">%s</div><table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f7f8fa;padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e4e7ec;border-radius:12px;overflow:hidden"><tr><td style="padding:24px 32px 12px;color:#167d70;font-size:14px;font-weight:700;letter-spacing:.02em">%s</td></tr><tr><td style="padding:8px 32px 4px;font-size:24px;font-weight:700;line-height:32px">%s</td></tr><tr><td style="padding:8px 32px;color:#344054;font-size:15px;line-height:24px">%s</td></tr><tr><td style="padding:4px 32px 20px;color:#344054;font-size:15px;line-height:24px">%s</td></tr>%s%s</table><div style="padding:18px;color:#98a2b3;font-size:11px;line-height:16px">Sent by %s</div></td></tr></table></body></html>`, html.EscapeString(subject), html.EscapeString(preview), html.EscapeString(name), html.EscapeString(subject), html.EscapeString(greeting), html.EscapeString(body), action, note, html.EscapeString(name))
	return Message{Subject: subject, Text: text, HTML: htmlBody}
}

func VerifyEmailMessage(username, token string) Message {
	return transactionalMessage("Verify your email", "Confirm this email address for your account.", "Hi "+displayName(username)+",", "Please confirm this email address to finish setting up your account. This link expires in 24 hours and can be used once.", "Verify email", actionURL("verify-email", token), "If you did not create this account, you can ignore this email.")
}

func PasswordResetMessage(username, token string) Message {
	return transactionalMessage("Reset your password", "Use this secure link to choose a new password.", "Hi "+displayName(username)+",", "We received a request to reset your password. This link expires in 1 hour and can be used once.", "Reset password", actionURL("reset-password", token), "If you did not request this reset, you can ignore this email. Your password has not changed.")
}

func PasswordChangedMessage(username string) Message {
	return transactionalMessage("Password changed", "Your account password was changed.", "Hi "+displayName(username)+",", "Your password was changed successfully.", "", "", "If you did not make this change, request another password reset immediately and contact your site administrator.")
}

func TOTPEnabledMessage(username string) Message {
	return transactionalMessage("Two-factor authentication enabled", "Two-factor authentication is now active.", "Hi "+displayName(username)+",", "Two-factor authentication was enabled on your account.", "", "", "If you did not make this change, secure your account immediately.")
}

func TOTPDisabledMessage(username string) Message {
	return transactionalMessage("Two-factor authentication disabled", "Two-factor authentication was removed.", "Hi "+displayName(username)+",", "Two-factor authentication was disabled on your account.", "", "", "If you did not make this change, secure your account immediately.")
}

func displayName(value string) string {
	if value = strings.TrimSpace(value); value != "" {
		return value
	}
	return "there"
}

func VerifyEmailHTML(username, token string) string { return VerifyEmailMessage(username, token).HTML }
func PasswordResetHTML(username, token string) string {
	return PasswordResetMessage(username, token).HTML
}
func PasswordChangedHTML(username string) string { return PasswordChangedMessage(username).HTML }
func TOTPEnabledHTML(username string) string     { return TOTPEnabledMessage(username).HTML }
func TOTPDisabledHTML(username string) string    { return TOTPDisabledMessage(username).HTML }
