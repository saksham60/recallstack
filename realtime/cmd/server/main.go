package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/saksham60/recallstack/realtime/internal/config"
	"github.com/saksham60/recallstack/realtime/internal/httpapi"
	"github.com/saksham60/recallstack/realtime/internal/metrics"
	"github.com/saksham60/recallstack/realtime/internal/room"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, "invalid realtime configuration:", err)
		os.Exit(2)
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	registry := metrics.New()
	manager := room.NewManager(room.Options{MaxRooms: cfg.MaxActiveRooms, MaxParticipants: cfg.MaxRoomParticipants, MaxOperations: cfg.MaxRoomOperations, MaxRecentOpIDs: cfg.MaxRecentOperationIDs, IdleTTL: cfg.RoomIdleTTL, MaxTTL: cfg.RoomMaxTTL}, registry, logger)

	cleanupContext, stopCleanup := context.WithCancel(context.Background())
	defer stopCleanup()
	go manager.StartCleanup(cleanupContext, cfg.RoomCleanupInterval)

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           httpapi.NewRouter(cfg, manager, registry, logger),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("realtime server starting", "port", cfg.Port, "max_participants", cfg.MaxRoomParticipants)
		serverErrors <- server.ListenAndServe()
	}()

	signalContext, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()
	select {
	case <-signalContext.Done():
		logger.Info("shutdown requested")
	case serveErr := <-serverErrors:
		if !errors.Is(serveErr, http.ErrServerClosed) {
			logger.Error("server failed", "error", serveErr)
			os.Exit(1)
		}
		return
	}

	stopCleanup()
	shutdownContext, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	shutdownDone := make(chan error, 1)
	go func() { shutdownDone <- server.Shutdown(shutdownContext) }()
	if err := manager.Close(shutdownContext); err != nil {
		logger.Warn("room shutdown incomplete", "error", err)
	}
	if err := <-shutdownDone; err != nil {
		logger.Warn("HTTP shutdown incomplete", "error", err)
	}
	logger.Info("realtime server stopped")
}
