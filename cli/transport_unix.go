//go:build !windows

package main

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"syscall"
)

func connectLocal(profile string) (localConnection, error) {
	profile, err := filepath.EvalSymlinks(profile)
	if err != nil {
		return localConnection{}, fmt.Errorf("cannot find DeLive SQ profile; start the app: %w", err)
	}
	dir := fmt.Sprintf("/tmp/delive-cli-%d", os.Getuid())
	info, err := os.Lstat(dir)
	if err != nil {
		return localConnection{}, fmt.Errorf("cannot find DeLive SQ socket directory; start the app: %w", err)
	}
	if !info.IsDir() || info.Mode().Perm()&0077 != 0 || info.Sys().(*syscall.Stat_t).Uid != uint32(os.Getuid()) {
		return localConnection{}, errors.New("DeLive SQ socket directory must be private and owned by the current user")
	}
	hash := sha256.Sum256([]byte(profile))
	socket := filepath.Join(dir, fmt.Sprintf("%x.sock", hash[:16]))
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		var dialer net.Dialer
		return dialer.DialContext(ctx, "unix", socket)
	}}
	return localConnection{base: "http://localhost", transport: transport}, nil
}
