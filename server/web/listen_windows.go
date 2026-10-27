//go:build windows

package web

import (
	"context"
	"net"
	"syscall"
)

// listenWithReuse allows the server to bind again immediately after a forced
// restart even when Windows still has sockets on the port in TIME_WAIT.
func listenWithReuse(addr string) (net.Listener, error) {
	lc := net.ListenConfig{
		Control: func(network, address string, c syscall.RawConn) error {
			var sockErr error
			if err := c.Control(func(fd uintptr) {
				sockErr = syscall.SetsockoptInt(syscall.Handle(fd), syscall.SOL_SOCKET, syscall.SO_REUSEADDR, 1)
			}); err != nil {
				return err
			}
			return sockErr
		},
	}
	return lc.Listen(context.Background(), "tcp", addr)
}
