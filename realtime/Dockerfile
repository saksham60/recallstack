FROM golang:1.27.0-bookworm AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/realtime ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

ENV PORT=8080
COPY --from=builder --chown=nonroot:nonroot /out/realtime /realtime
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/realtime"]
