package db

import (
	"fmt"
	"goftw/internal/whoiam"
	"time"
)

// Config holds DB connection info
type Config struct {
	Host     string
	Port     string
	User     string
	Password string
	Debug    bool
	Wait     bool
}

// WaitForDB pings the database until reachable
func WaitForDB(cfg Config) error {
	if !cfg.Wait {
		return nil
	}

	fmt.Printf("[Database] Waiting for MariaDB at %s:%s...\n", cfg.Host, cfg.Port)
	for {
		_, err := whoiam.ExecRunSwallowIO(
			"mysqladmin",
			"ping",
			"-h", cfg.Host,
			"-P", cfg.Port,
			"-u", cfg.User,
			fmt.Sprintf("-p%s", cfg.Password),
			"--silent",
		)
		// if err != nil {
		// 	return err
		// }
		if err == nil {
			fmt.Println("[OK] MariaDB reachable.")
			return nil
		}
		if cfg.Debug {
			fmt.Println("[DEBUG][DB] waiting...")
		}
		time.Sleep(2 * time.Second)
	}
}
