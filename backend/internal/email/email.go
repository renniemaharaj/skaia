package email

import (
	"crypto/tls"
	"fmt"
	"log"
	"net/smtp"
	"os"
	"strconv"
	"strings"
)

// Sender sends transactional emails via SMTP.
type Sender struct {
	host     string
	port     int
	user     string
	password string
	from     string
	fromName string
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
			fromName = strings.Title(cn)
		} else {
			fromName = "Skaia"
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

// Send delivers an HTML email to the given recipient.
func (s *Sender) Send(to, subject, htmlBody string) error {
	if s == nil {
		return fmt.Errorf("email sender not configured")
	}

	fromHeader := fmt.Sprintf("%s <%s>", s.fromName, s.from)
	headers := []string{
		"From: " + fromHeader,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=\"UTF-8\"",
	}
	msg := []byte(strings.Join(headers, "\r\n") + "\r\n\r\n" + htmlBody)

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
