package email

import (
	"bytes"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	log "github.com/skaia/backend/internal/syslog"
	"mime"
	"mime/quotedprintable"
	"net/mail"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

var titleCaser = cases.Title(language.Und)

// Sender sends transactional emails via SMTP.
type Sender struct {
	host     string
	port     int
	user     string
	password string
	from     string
	fromName string
}

type Message struct {
	Subject string
	Text    string
	HTML    string
}

// NewSenderFromEnv creates a Sender using SMTP_* environment variables.
// Returns nil if SMTP_HOST is not configured (email disabled).
func NewSenderFromEnv() *Sender {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		log.Println("email: SMTP_HOST not set, email delivery disabled")
		return nil
	}
	port, _ := strconv.Atoi(os.Getenv("SMTP_PORT"))
	if port == 0 {
		port = 587
	}
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		if domains := strings.Fields(os.Getenv("DOMAINS")); len(domains) > 0 {
			from = "noreply@" + domains[0]
		} else {
			from = "noreply@localhost"
		}
	}
	fromName := os.Getenv("SMTP_FROM_NAME")
	if fromName == "" {
		if cn := os.Getenv("CLIENT_NAME"); cn != "" {
			fromName = titleCaser.String(cn)
		} else {
			fromName = "Go Web Platform"
		}
	}
	fmt.Printf("email: configured with host=%s port=%d from=%s\n", host, port, from)
	return &Sender{
		host:     host,
		port:     port,
		user:     os.Getenv("SMTP_USER"),
		password: os.Getenv("SMTP_PASSWORD"),
		from:     from,
		fromName: fromName,
	}
}

// Send preserves the legacy HTML-only call shape.
func (s *Sender) Send(to, subject, htmlBody string) error {
	return s.SendMessage(to, Message{Subject: subject, Text: "Please view this message in an HTML-capable email client.", HTML: htmlBody})
}

// SendMessage delivers equivalent plain-text and HTML bodies.
func (s *Sender) SendMessage(to string, message Message) error {
	if s == nil {
		return fmt.Errorf("email sender not configured")
	}
	if strings.ContainsAny(message.Subject, "\r\n") || strings.TrimSpace(message.Subject) == "" {
		return fmt.Errorf("email subject is invalid")
	}
	fromAddress, err := mail.ParseAddress(s.from)
	if err != nil || fromAddress.Address != s.from {
		return fmt.Errorf("email sender address is invalid")
	}
	toAddress, err := mail.ParseAddress(to)
	if err != nil || toAddress.Address != to {
		return fmt.Errorf("email recipient address is invalid")
	}
	if strings.ContainsAny(s.fromName, "\r\n") {
		return fmt.Errorf("email sender name is invalid")
	}

	fromHeader := (&mail.Address{Name: s.fromName, Address: s.from}).String()
	boundary, err := messageBoundary()
	if err != nil {
		return fmt.Errorf("email boundary: %w", err)
	}
	headers := []string{
		"From: " + fromHeader,
		"To: " + toAddress.String(),
		"Subject: " + mime.QEncoding.Encode("UTF-8", message.Subject),
		"Date: " + time.Now().Format(time.RFC1123Z),
		"MIME-Version: 1.0",
		`Content-Type: multipart/alternative; boundary="` + boundary + `"`,
	}
	var body bytes.Buffer
	body.WriteString(strings.Join(headers, "\r\n") + "\r\n\r\n")
	writePart(&body, boundary, "text/plain", message.Text)
	writePart(&body, boundary, "text/html", message.HTML)
	body.WriteString("--" + boundary + "--\r\n")
	msg := body.Bytes()

	addr := fmt.Sprintf("%s:%d", s.host, s.port)

	var auth smtp.Auth
	if s.user != "" {
		auth = smtp.PlainAuth("", s.user, s.password, s.host)
	}

	// Use STARTTLS for port 587, direct TLS for port 465, plain for others.
	if s.port == 465 {
		return s.sendTLS(addr, auth, msg, to)
	}
	return smtp.SendMail(addr, auth, s.from, []string{to}, msg)
}

func messageBoundary() (string, error) {
	b := make([]byte, 18)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "skaia-" + hex.EncodeToString(b), nil
}

func writePart(dst *bytes.Buffer, boundary, contentType, content string) {
	dst.WriteString("--" + boundary + "\r\n")
	dst.WriteString("Content-Type: " + contentType + "; charset=UTF-8\r\n")
	dst.WriteString("Content-Transfer-Encoding: quoted-printable\r\n\r\n")
	w := quotedprintable.NewWriter(dst)
	_, _ = w.Write([]byte(content))
	_ = w.Close()
	dst.WriteString("\r\n")
}

// sendTLS handles implicit TLS (port 465).
func (s *Sender) sendTLS(addr string, auth smtp.Auth, msg []byte, to string) error {
	tlsConfig := &tls.Config{ServerName: s.host}
	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("email tls dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, s.host)
	if err != nil {
		return fmt.Errorf("email smtp client: %w", err)
	}
	defer client.Close()

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("email auth: %w", err)
		}
	}
	if err := client.Mail(s.from); err != nil {
		return fmt.Errorf("email mail: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("email rcpt: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("email data: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("email write: %w", err)
	}
	return w.Close()
}

// Configured reports whether the sender has SMTP configured.
func (s *Sender) Configured() bool {
	return s != nil && s.host != ""
}
