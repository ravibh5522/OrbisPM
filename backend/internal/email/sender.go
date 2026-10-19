package email

import (
	"fmt"
	"net/smtp"
	"strings"
)

// Sender sends emails via SMTP.
type Sender struct {
	host     string
	port     int
	user     string
	password string
	from     string
	enabled  bool
}

// Config holds SMTP configuration.
type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	From     string
	Enabled  bool
}

// NewSender creates a new email sender.
func NewSender(cfg Config) *Sender {
	return &Sender{
		host:     cfg.Host,
		port:     cfg.Port,
		user:     cfg.User,
		password: cfg.Password,
		from:     cfg.From,
		enabled:  cfg.Enabled,
	}
}

// Message represents an email message.
type Message struct {
	To      string
	Subject string
	Body    string
}

// Send sends an email message.
func (s *Sender) Send(msg Message) error {
	if !s.enabled {
		return nil
	}

	headers := []string{
		fmt.Sprintf("From: %s", s.from),
		fmt.Sprintf("To: %s", msg.To),
		fmt.Sprintf("Subject: %s", msg.Subject),
		"MIME-Version: 1.0",
		`Content-Type: text/html; charset="utf-8"`,
	}

	raw := strings.Join(headers, "\r\n") + "\r\n\r\n" + msg.Body

	addr := fmt.Sprintf("%s:%d", s.host, s.port)

	var auth smtp.Auth
	if s.user != "" {
		auth = smtp.PlainAuth("", s.user, s.password, s.host)
	}

	return smtp.SendMail(addr, auth, s.from, []string{msg.To}, []byte(raw))
}

// IsEnabled returns whether email sending is enabled.
func (s *Sender) IsEnabled() bool {
	return s.enabled
}

// FormatNotificationEmail builds an HTML email body for a notification.
func FormatNotificationEmail(title, body, frontendURL string) string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>` + title + ` — Simplify Projects</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f4f6;">
  <tr>
    <td align="center" style="padding:40px 16px 48px;">

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="padding-bottom:24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td>
                  <span style="font-size:18px;font-weight:700;color:#d82638;letter-spacing:-0.3px;">Simplify Projects</span>
                </td>
                <td align="right">
                  <span style="font-size:12px;color:#9ca3af;font-weight:500;letter-spacing:0.3px;text-transform:uppercase;">Notification</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Main card -->
        <tr>
          <td style="background-color:#ffffff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04);overflow:hidden;">

            <!-- Top accent bar -->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="background:linear-gradient(135deg,#d82638 0%,#ef5b69 100%);height:4px;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>

            <!-- Bell icon row -->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding:36px 40px 0;text-align:left;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td style="background-color:#eef2ff;border-radius:10px;width:44px;height:44px;text-align:center;vertical-align:middle;">
                        <span style="font-size:20px;line-height:44px;display:block;">&#x1F514;</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Card body -->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="padding:20px 40px 36px;">

                  <!-- Title -->
                  <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;line-height:1.35;letter-spacing:-0.2px;">` + title + `</h1>

                  <!-- Body -->
                  <p style="margin:0 0 32px;font-size:15px;color:#4b5563;line-height:1.75;">` + body + `</p>

                  <!-- CTA Button -->
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td style="border-radius:8px;background:linear-gradient(135deg,#d82638 0%,#ef5b69 100%);">
                        <a href="` + frontendURL + `" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.1px;">
                          Open Simplify Projects &#x2192;
                        </a>
                      </td>
                    </tr>
                  </table>

                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding-top:28px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;">You received this because of your notification preferences in <strong style="color:#6b7280;">Simplify Projects</strong>.</p>
            <p style="margin:0;font-size:12px;color:#d1d5db;">Manage your preferences in your account settings.</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`
}
