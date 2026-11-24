// Command delive reads a running DeLive SQ meeting library over its local API.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const usage = `delive — DeLive SQ command line

  delive health | status | topics | tags
  delive meetings list [--limit N] [--offset N]
  delive meetings search QUERY [--limit N] [--offset N]
  delive meetings show|versions|images|transcript|summary ID
  delive meetings export ID [--format md|txt|srt|vtt] [--purpose reading|proofreading]
                            [--allow-pending] [--output FILE]

Queries print JSON (--json is optional). Export writes the adopted transcript
to stdout or a new file. Start DeLive SQ under your OS account.
For a custom desktop profile, set DELIVE_USER_DATA_DIR to its absolute path.
`

type command struct {
	path, field, output string
	query               url.Values
	export              bool
}

func parse(args []string) (command, error) {
	c := command{query: url.Values{}}
	if len(args) == 0 {
		return c, errors.New("missing command; see delive --help")
	}
	action := args[0]
	args = args[1:]
	flags := flag.NewFlagSet(action, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	if action == "meetings" {
		if len(args) == 0 {
			return c, errors.New("missing meetings subcommand")
		}
		action, args = args[0], args[1:]
		c.path = "/sessions"
		switch action {
		case "list", "search":
			if action == "search" {
				if len(args) == 0 || strings.TrimSpace(args[0]) == "" || strings.HasPrefix(args[0], "--") {
					return c, errors.New("search requires a query")
				}
				c.query.Set("search", args[0])
				args = args[1:]
			}
			for _, key := range []string{"limit", "offset"} {
				flags.Func(key, "pagination", func(s string) error {
					n, err := strconv.Atoi(s)
					if err != nil || n < 0 || (key == "limit" && n == 0) {
						return fmt.Errorf("invalid %s", key)
					}
					c.query.Set(key, s)
					return nil
				})
			}
		case "show", "summary", "transcript", "images", "versions", "export":
			if len(args) == 0 || args[0] == "" || strings.HasPrefix(args[0], "--") || args[0] == "." || args[0] == ".." {
				return c, errors.New("a meeting ID is required")
			}
			c.path += "/" + url.PathEscape(args[0])
			args = args[1:]
			switch action {
			case "versions", "images":
				c.field = action
			case "export":
				c.export = true
				c.path += "/export"
				format := flags.String("format", "md", "export format")
				purpose := flags.String("purpose", "reading", "export purpose")
				pending := flags.Bool("allow-pending", false, "include pending review sections")
				flags.StringVar(&c.output, "output", "", "new output file")
				if err := flags.Parse(args); err != nil {
					return c, err
				}
				c.query.Set("format", *format)
				c.query.Set("purpose", *purpose)
				if *pending {
					c.query.Set("allowPending", "true")
				}
				if flags.NArg() != 0 {
					return c, errors.New("unexpected export argument")
				}
				return c, nil
			case "summary", "transcript":
				c.path += "/" + action
			}
		default:
			return c, fmt.Errorf("unknown meetings command %q", action)
		}
	} else {
		switch action {
		case "health", "status", "topics", "tags":
			c.path = "/" + action
		default:
			return c, fmt.Errorf("unknown command %q", action)
		}
	}
	flags.Bool("json", true, "JSON output")
	if err := flags.Parse(args); err != nil {
		return c, err
	}
	if flags.NArg() != 0 {
		return c, errors.New("unexpected argument; see delive --help")
	}
	return c, nil
}

type localConnection struct {
	base          string
	transport     *http.Transport
	authorization string
}

func profileDirectory() (string, error) {
	if dir := os.Getenv("DELIVE_USER_DATA_DIR"); dir != "" {
		if !filepath.IsAbs(dir) {
			return "", errors.New("DELIVE_USER_DATA_DIR must be an absolute path")
		}
		return dir, nil
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "DeLive SQ"), nil
}

func run(args []string) error {
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		fmt.Print(usage)
		return nil
	}
	c, err := parse(args)
	if err != nil {
		return err
	}
	profile, err := profileDirectory()
	if err != nil {
		return err
	}
	conn, err := connectLocal(profile)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodGet, conn.base+"/api/v1"+c.path, nil)
	if err != nil {
		return err
	}
	req.URL.RawQuery = c.query.Encode()
	if conn.authorization != "" {
		req.Header.Set("Authorization", conn.authorization)
	}
	client := http.Client{Timeout: 15 * time.Second, Transport: conn.transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("cannot reach DeLive SQ; start the app under this OS account: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var detail struct{ Error string }
		_ = json.NewDecoder(res.Body).Decode(&detail)
		return fmt.Errorf("%s %s", res.Status, detail.Error)
	}
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	if !c.export {
		if c.field != "" {
			var fields map[string]json.RawMessage
			if err = json.Unmarshal(body, &fields); err != nil {
				return err
			}
			field, ok := fields[c.field]
			if !ok {
				return fmt.Errorf("%s unavailable in this app version", c.field)
			}
			if c.field == "versions" {
				body, err = json.Marshal(map[string]json.RawMessage{"adoptedVersionId": fields["adoptedVersionId"], "versions": field})
				if err != nil {
					return err
				}
			} else {
				body = field
			}
		}
		var pretty bytes.Buffer
		if err = json.Indent(&pretty, body, "", "  "); err != nil {
			return err
		}
		pretty.WriteByte('\n')
		body = pretty.Bytes()
	}
	if c.output == "" {
		_, err = os.Stdout.Write(body)
		return err
	}
	file, err := os.OpenFile(c.output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	_, err = file.Write(body)
	closeErr := file.Close()
	if err = errors.Join(err, closeErr); err != nil {
		os.Remove(c.output)
	}
	return err
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "delive:", err)
		os.Exit(1)
	}
}
