package app

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"

	"github.com/skaia/grengo/internal/repo"
)

// pcodePath returns the absolute path to the .pcode file at the project root.
func pcodePath() string {
	return repo.New(ProjectRoot()).PCodeFile()
}

// cmdPasscodeSet hashes a two-part passcode and stores it in the grengo DB.
//
// Usage:
//
//	grengo passcode set [<p1> <p2>]
func cmdPasscodeSet(args []string) {
	var p1, p2 string

	if len(args) >= 2 {
		p1 = args[0]
		p2 = args[1]
	} else {
		fmt.Println()
		fmt.Printf("%sSet grengo API passcode%s\n", colorBold, colorReset)
		fmt.Printf("%s─────────────────────────────────────%s\n", colorBlue, colorReset)
		fmt.Println()
		info("The passcode consists of two parts (password + salt) that together form the credential.")
		fmt.Println()
		p1 = prompt("Passcode part 1 (password)", "", true)
		p2 = prompt("Passcode part 2 (salt)", "", true)
	}

	if p1 == "" || p2 == "" {
		die("Both passcode parts are required")
	}

	// Generate a random 16-byte file-salt so identical passcode pairs
	// produce different hashes across installations.
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		die("Cannot generate random salt: %v", err)
	}

	hash := hashPasscode(salt, p1, p2)

	// Store as: hex(salt):hex(hash)
	content := hex.EncodeToString(salt) + ":" + hex.EncodeToString(hash)

	if err := newGrengoService().StorePasscode(content); err != nil {
		warn("Failed to store passcode in grengo DB: %v", err)
		if err := os.WriteFile(pcodePath(), []byte(content), 0600); err != nil {
			die("Failed to write fallback .pcode: %v", err)
		}
		log("Passcode set => grengo DB unavailable, fallback %s", pcodePath())
	} else {
		_ = os.Remove(pcodePath())
		log("Passcode set => grengo database")
	}
	info("The grengo API is now accessible with this passcode pair.")
}

// cmdPasscodeVerify checks a passcode pair against the stored .pcode file.
func cmdPasscodeVerify(args []string) {
	if !passcodeConfigured() {
		die("No passcode configured. Run: grengo passcode set")
	}

	var p1, p2 string
	if len(args) >= 2 {
		p1 = args[0]
		p2 = args[1]
	} else {
		p1 = prompt("Passcode part 1", "", true)
		p2 = prompt("Passcode part 2", "", true)
	}

	if !verifyPasscode(p1, p2) {
		die("Passcode verification failed")
	}
	log("Passcode verified ✓")
}

// cmdPasscodeClear removes the stored passcode, disabling grengo API access.
func cmdPasscodeClear() {
	path := pcodePath()
	dbErr := newGrengoService().ClearPasscode()
	fileExists := true
	if _, err := os.Stat(path); os.IsNotExist(err) {
		fileExists = false
	}
	if dbErr != nil && !fileExists {
		die("Failed to clear grengo DB passcode: %v", dbErr)
		return
	}
	if fileExists {
		if err := os.Remove(path); err != nil {
			die("Failed to remove fallback .pcode: %v", err)
		}
	}
	if dbErr != nil {
		warn("Fallback passcode cleared, but grengo DB passcode could not be cleared: %v", dbErr)
		warn("API access may still be enabled when the grengo DB is available")
		return
	}
	log("Passcode cleared — grengo API access is now disabled")
}

func storedPasscodePayload() (string, error) {
	if value, err := newGrengoService().LoadPasscode(); err == nil && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value), nil
	}
	raw, err := os.ReadFile(pcodePath())
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(raw)), nil
}

func removeFallbackPasscode() {
	if _, err := os.Stat(pcodePath()); err == nil {
		if err := os.Remove(pcodePath()); err != nil {
			warn("Failed to remove fallback .pcode: %v", err)
		}
	}
}

func migrateFallbackPasscodeIfPossible() {
	raw, err := os.ReadFile(pcodePath())
	if err != nil {
		return
	}
	content := strings.TrimSpace(string(raw))
	if content == "" {
		return
	}
	if err := newGrengoService().StorePasscode(content); err != nil {
		return
	}
	removeFallbackPasscode()
}

func passcodePayloadConfigured() bool {
	payload, err := storedPasscodePayload()
	return err == nil && strings.TrimSpace(payload) != ""
}

// cmdPasscodeStatus prints whether a passcode is currently configured.
func cmdPasscodeStatus() {
	if passcodeConfigured() {
		log("Passcode is configured")
	} else {
		info("No passcode configured — grengo API is disabled")
		info("Set one with: grengo passcode set")
	}
}

// helpers

// hashPasscode computes SHA-256(salt + p1 + ":" + p2).
func hashPasscode(salt []byte, p1, p2 string) []byte {
	h := sha256.New()
	h.Write(salt)
	h.Write([]byte(p1 + ":" + p2))
	return h.Sum(nil)
}

// verifyPasscode reads the grengo DB passcode and compares it against the input pair.
func verifyPasscode(p1, p2 string) bool {
	raw, err := storedPasscodePayload()
	if err != nil {
		return false
	}

	parts := strings.SplitN(raw, ":", 2)
	if len(parts) != 2 {
		return false
	}

	salt, err := hex.DecodeString(strings.TrimSpace(parts[0]))
	if err != nil {
		return false
	}
	storedHash, err := hex.DecodeString(strings.TrimSpace(parts[1]))
	if err != nil {
		return false
	}

	computed := hashPasscode(salt, p1, p2)

	// Constant-time comparison.
	if len(computed) != len(storedHash) {
		return false
	}
	var diff byte
	for i := range computed {
		diff |= computed[i] ^ storedHash[i]
	}
	return diff == 0
}

// passcodeConfigured returns true when a DB or fallback file passcode exists.
func passcodeConfigured() bool {
	return passcodePayloadConfigured()
}
