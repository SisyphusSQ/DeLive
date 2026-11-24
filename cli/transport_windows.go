package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
)

func connectLocal(profile string) (localConnection, error) {
	// DeLive creates this per-instance file with a DACL for the current user only.
	data, err := os.ReadFile(filepath.Join(profile, "cli-endpoint.json"))
	if err != nil {
		return localConnection{}, fmt.Errorf("cannot find DeLive SQ endpoint; start the app under this Windows account: %w", err)
	}
	var endpoint struct {
		Port   int
		Secret string
	}
	if json.Unmarshal(data, &endpoint) != nil || endpoint.Port < 1 || endpoint.Port > 65535 || len(endpoint.Secret) != 64 {
		return localConnection{}, errors.New("invalid DeLive SQ endpoint; restart the app")
	}
	return localConnection{base: fmt.Sprintf("http://127.0.0.1:%d", endpoint.Port), transport: &http.Transport{}, authorization: "Bearer " + endpoint.Secret}, nil
}
