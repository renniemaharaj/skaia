package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const pcodeFileName = ".pcode"

// pcodePath returns the absolute path to the .pcode file at the project root.
func pcodePath() string {
	return filepath.Join(ProjectRoot(), pcodeFileName)
}

// cmdPasscodeSet hashes a two-part passcode and writes it to .pcode.
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

	if err := os.WriteFile(pcodePath(), []byte(content), 0600); err != nil {
		die("Failed to write .pcode: %v", err)
	}

	log("Passcode set => %s", pcodePath())
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

// cmdPasscodeClear removes the .pcode file, disabling grengo API access.
func cmdPasscodeClear() {
	path := pcodePath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		info("No passcode configured")
		return
	}
	if err := os.Remove(path); err != nil {
		die("Failed to remove .pcode: %v", err)
	}
	log("Passcode cleared — grengo API access is now disabled")
}

// cmdPasscodeStatus prints whether a passcode is currently configured.
func cmdPasscodeStatus() {
	if passcodeConfigured() {
		log("Passcode is configured (%s)", pcodePath())
	} else {
		info("No passcode configured — grengo API is disabled")
		info("Set one with: grengo passcode set")
	}
}

// ── helpers ────────────────────────────────────────────────────────────────

// hashPasscode computes SHA-256(salt + p1 + ":" + p2).
func hashPasscode(salt []byte, p1, p2 string) []byte {
	h := sha256.New()
	h.Write(salt)
	h.Write([]byte(p1 + ":" + p2))
	return h.Sum(nil)
}

// verifyPasscode reads .pcode and compares the stored hash against the input pair.
func verifyPasscode(p1, p2 string) bool {
	raw, err := os.ReadFile(pcodePath())
	if err != nil {
		return false
	}

	parts := strings.SplitN(string(raw), ":", 2)
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

// passcodeConfigured returns true when .pcode exists and is non-empty.
func passcodeConfigured() bool {
	fi, err := os.Stat(pcodePath())
	return err == nil && fi.Size() > 0
}
