package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Telemetry struct {
	RobotID           string   `json:"robot_id"`
	Position          Position `json:"position"`
	BatteryPercentage float64  `json:"battery_percentage"`
	Timestamp         string   `json:"timestamp"`
}

type Command struct {
	Command string `json:"command"`
}

type RobotState struct {
	RobotID           string   `json:"robot_id"`
	Position          Position `json:"position"`
	BatteryPercentage float64  `json:"battery_percentage"`
	LastUpdatedAt     string   `json:"last_updated_at"`
}

type HealthResponse struct {
	Status          string  `json:"status"`
	PluginConnected bool    `json:"plugin_connected"`
	LastTelemetryAt *string `json:"last_telemetry_at"`
}

// ── Hub ───────────────────────────────────────────────────────────────────────

type Hub struct {
	mu              sync.RWMutex
	pluginConn      *websocket.Conn
	robotState      *RobotState
	lastTelemetryAt *time.Time
}

func newHub() *Hub {
	return &Hub{
		robotState: &RobotState{
			RobotID:  "robot-1",
			Position: Position{X: 0, Y: 0},
		},
	}
}

func (h *Hub) isPluginConnected() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.pluginConn != nil
}

func (h *Hub) updateState(t Telemetry) {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := time.Now().UTC()
	h.robotState = &RobotState{
		RobotID:           t.RobotID,
		Position:          t.Position,
		BatteryPercentage: t.BatteryPercentage,
		LastUpdatedAt:     t.Timestamp,
	}
	h.lastTelemetryAt = &now
}

func (h *Hub) getState() RobotState {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return *h.robotState
}

func (h *Hub) sendCommand(cmd Command) bool {
	data, err := json.Marshal(cmd)
	if err != nil {
		return false
	}
	for attempt := 1; attempt <= 2; attempt++ {
		h.mu.RLock()
		conn := h.pluginConn
		h.mu.RUnlock()
		if conn == nil {
			return false
		}
		if err = conn.WriteMessage(websocket.TextMessage, data); err == nil {
			log.Printf("[BACKEND] Command forwarded to plugin: %s", cmd.Command)
			return true
		}
		log.Printf("[BACKEND] Command send attempt %d/2 failed: %v", attempt, err)
		if attempt < 2 {
			time.Sleep(50 * time.Millisecond)
		}
	}
	h.clearConn()
	return false
}

func (h *Hub) setConn(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.pluginConn = conn
}

func (h *Hub) clearConn() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.pluginConn = nil
}

func panicRecovery(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("[BACKEND] Panic recovered in handler %s: %v\n%s",
					r.URL.Path, rec, debug.Stack())
				writeJSON(w, http.StatusInternalServerError,
					map[string]string{"error": "internal server error"})
			}
		}()
		next(w, r)
	}
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

// ── WebSocket handler ─────────────────────────────────────────────────────────

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (h *Hub) handlePluginWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[BACKEND] WS upgrade error: %v", err)
		return
	}

	log.Printf("[BACKEND] ROS Plugin connected from %s", r.RemoteAddr)
	h.setConn(conn)

	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("[BACKEND] Panic in WS handler: %v\n%s", rec, debug.Stack())
		}
		conn.Close()
		h.clearConn()
		log.Printf("[BACKEND] ROS Plugin disconnected")
	}()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Printf("[BACKEND] Plugin read error: %v", err)
			return
		}
		var t Telemetry
		if err := json.Unmarshal(msg, &t); err != nil {
			log.Printf("[BACKEND] Bad telemetry payload: %s", string(msg))
			continue
		}
		h.updateState(t)
		log.Printf("[BACKEND] Telemetry received → pos=(%.2f, %.2f) battery=%.1f%%",
			t.Position.X, t.Position.Y, t.BatteryPercentage)
	}
}

func (h *Hub) handleHealth(w http.ResponseWriter, r *http.Request) {
	var lastAt *string
	h.mu.RLock()
	if h.lastTelemetryAt != nil {
		s := h.lastTelemetryAt.Format(time.RFC3339Nano)
		lastAt = &s
	}
	h.mu.RUnlock()

	writeJSON(w, http.StatusOK, HealthResponse{
		Status:          "ok",
		PluginConnected: h.isPluginConnected(),
		LastTelemetryAt: lastAt,
	})
}

func (h *Hub) handleGetState(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.getState())
}

func (h *Hub) handlePostCommand(w http.ResponseWriter, r *http.Request) {
	var cmd Command
	if err := json.NewDecoder(r.Body).Decode(&cmd); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}
	valid := map[string]bool{"w": true, "a": true, "s": true, "d": true}
	if !valid[cmd.Command] {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid command, must be one of: w, a, s, d",
		})
		return
	}
	if !h.isPluginConnected() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "ROS plugin not connected",
		})
		return
	}
	if !h.sendCommand(cmd) {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to forward command",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	hub := newHub()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/plugin", hub.handlePluginWS)
	mux.HandleFunc("/health", panicRecovery(corsMiddleware(hub.handleHealth)))
	mux.HandleFunc("/api/robot/state", panicRecovery(corsMiddleware(hub.handleGetState)))
	mux.HandleFunc("/api/robot/command", panicRecovery(corsMiddleware(hub.handlePostCommand)))

	srv := &http.Server{Addr: ":" + port, Handler: mux}

	log.Printf("[BACKEND] Cloud Backend starting on :%s", port)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[BACKEND] Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Printf("[BACKEND] Shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("[BACKEND] Shutdown error: %v", err)
	}
	log.Printf("[BACKEND] Stopped")
}
