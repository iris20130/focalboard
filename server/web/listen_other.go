//go:build !windows

package web

import (
	"context"
	"net"
)

func listenWithReuse(addr string) (net.Listener, error) {
	lc := net.ListenConfig{}
	return lc.Listen(context.Background(), "tcp", addr)
}
