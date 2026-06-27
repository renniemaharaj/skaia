module github.com/skaia/backend

go 1.25.3

require (
	github.com/go-chi/chi/v5 v5.2.5
	github.com/go-chi/cors v1.2.2
	github.com/go-chi/httprate v0.15.0
	github.com/go-rod/rod v0.116.2
	github.com/golang-jwt/jwt/v5 v5.3.1
	github.com/google/uuid v1.6.0
	github.com/gorilla/websocket v1.5.3
	github.com/lib/pq v1.11.2
	github.com/pquerna/otp v1.5.0
	github.com/redis/go-redis/v9 v9.18.0
	github.com/renniemaharaj/conveyor v0.0.0-20250821123734-2de0e1bcadc1
	github.com/renniemaharaj/grouplogs v1.6.2
	github.com/skaia/grpc v0.0.0
	github.com/stretchr/testify v1.11.1
	github.com/stripe/stripe-go/v82 v82.5.1
	golang.org/x/crypto v0.48.0
	google.golang.org/grpc v1.81.1
	google.golang.org/protobuf v1.36.11
)

require (
	github.com/boombuler/barcode v1.0.1-0.20190219062509-6c824513bacc // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	github.com/fatih/color v1.18.0 // indirect
	github.com/klauspost/cpuid/v2 v2.2.10 // indirect
	github.com/mattn/go-colorable v0.1.13 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	github.com/ysmood/fetchup v0.2.3 // indirect
	github.com/ysmood/goob v0.4.0 // indirect
	github.com/ysmood/got v0.40.0 // indirect
	github.com/ysmood/gson v0.7.3 // indirect
	github.com/ysmood/leakless v0.9.0 // indirect
	github.com/zeebo/xxh3 v1.0.2 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	golang.org/x/net v0.51.0 // indirect
	golang.org/x/sys v0.42.0 // indirect
	golang.org/x/text v0.34.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260226221140-a57be14db171 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace github.com/renniemaharaj/conveyor => ./pkg/conveyor

replace github.com/renniemaharaj/grouplogs => ./pkg/grouplogs

replace github.com/skaia/grpc => ./pkg/grpc
