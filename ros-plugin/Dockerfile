FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download || true
COPY . .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -o ros-plugin .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/ros-plugin .

ENV BACKEND_WS_URL=ws://cloud-backend:8080/ws/plugin

CMD ["./ros-plugin"]
