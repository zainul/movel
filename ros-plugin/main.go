package main

import (
	"encoding/json"
	"log"
	"math"
	"net/url"
	"os"
	"os/signal"
	"runtime/debug"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

// ── Types ────────────────────────────────────────────────────────────────────

type Telemetry struct {
	RobotID           string   `json:"robot_id"`
	Position          Position `json:"position"`
	BatteryPercentage float64  `json:"battery_percentage"`
	Timestamp         string   `json:"timestamp"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Command struct {
	Command string `json:"command"`
}

// ── Robot State ───────────────────────────────────────────────────────────────

type RobotState struct {
	mu      sync.Mutex
	x       float64
	y       float64
	battery float64
	step    float64
}

func newRobotState() *RobotState {
	return &RobotState{x: 0, y: 0, battery: 100.0, step: 1.0}
}

func (r *RobotState) applyCommand(cmd string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	switch cmd {
	case "w":
		r.y += r.step
		log.Printf("[ROBOT] CMD w  → move up    pos=(%.1f, %.1f)", r.x, r.y)
	case "s":
		r.y -= r.step
		log.Printf("[ROBOT] CMD s  → move down  pos=(%.1f, %.1f)", r.x, r.y)
	case "a":
		r.x -= r.step
		log.Printf("[ROBOT] CMD a  → move left  pos=(%.1f, %.1f)", r.x, r.y)
	case "d":
		r.x += r.step
		log.Printf("[ROBOT] CMD d  → move right pos=(%.1f, %.1f)", r.x, r.y)
	default:
		log.Printf("[ROBOT] Unknown command: %s", cmd)
	}
}

func (r *RobotState) drainBattery() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.battery > 0 {
		r.battery = math.Max(0, r.battery-0.1)
	}
}

func (r *RobotState) snapshot() (float64, float64, float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.x, r.y, r.battery
}

func run(robot *RobotState, backendURL string) {
	u, err := url.Parse(backendURL)
	if err != nil {
		log.Fatalf("[PLUGIN] Invalid backend URL: %v", err)
	}

	backoff := time.Second
	const maxBackoff = 30 * time.Second
	var conn *websocket.Conn
	for {
		c, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
		if err != nil {
			log.Printf("[PLUGIN] Connection failed: %v — retry in %s", err, backoff)
			time.Sleep(backoff)
			if backoff < maxBackoff {
				backoff *= 2
				if backoff > maxBackoff {
					backoff = maxBackoff
				}
			}
			continue
		}
		conn = c
		log.Printf("[PLUGIN] Connected to backend ✓")
		break
	}
	defer conn.Close()

	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("[PLUGIN] Panic in command reader: %v\n%s", rec, debug.Stack())
			}
		}()
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				log.Printf("[PLUGIN] Read error: %v", err)
				return
			}
			var cmd Command
			if err := json.Unmarshal(msg, &cmd); err != nil {
				log.Printf("[PLUGIN] Bad command payload: %s", string(msg))
				continue
			}
			log.Printf("[PLUGIN] Received command: %s", cmd.Command)
			robot.applyCommand(cmd.Command)
		}
	}()

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for range ticker.C {
		robot.drainBattery()
		x, y, battery := robot.snapshot()

		t := Telemetry{
			RobotID:           "robot-1",
			Position:          Position{X: x, Y: y},
			BatteryPercentage: battery,
			Timestamp:         time.Now().UTC().Format(time.RFC3339Nano),
		}
		data, err := json.Marshal(t)
		if err != nil {
			log.Printf("[PLUGIN] Marshal error: %v", err)
			continue
		}
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("[PLUGIN] Write error: %v — will reconnect", err)
			return
		}
		log.Printf("[PLUGIN] Telemetry sent → pos=(%.2f, %.2f) battery=%.1f%%", x, y, battery)
	}
}

func main() {
	backendWS := os.Getenv("BACKEND_WS_URL")
	if backendWS == "" {
		backendWS = "ws://cloud-backend:8080/ws/plugin"
	}

	log.Printf("[PLUGIN] Starting Movel AI ROS Plugin (mock mode)")
	log.Printf("[PLUGIN] Backend WS URL: %s", backendWS)

	robot := newRobotState()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		for {
			func() {
				defer func() {
					if rec := recover(); rec != nil {
						log.Printf("[PLUGIN] Panic recovered in run loop: %v\n%s", rec, debug.Stack())
					}
				}()
				run(robot, backendWS)
			}()
			log.Printf("[PLUGIN] Disconnected — reconnecting in 3s...")
			time.Sleep(3 * time.Second)
		}
	}()

	<-quit
	log.Printf("[PLUGIN] Shutting down")
}
