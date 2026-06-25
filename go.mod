module github.com/skaia/grengo

go 1.25.0

require (
	github.com/gorilla/websocket v1.5.3
	github.com/jaypipes/ghw v0.24.0
	github.com/shirou/gopsutil/v3 v3.24.5
	github.com/skaia/grpc v0.0.0
	google.golang.org/grpc v1.81.1
)

require (
	github.com/go-ole/go-ole v1.2.6 // indirect
	github.com/jaypipes/pcidb v1.1.1 // indirect
	github.com/lufia/plan9stats v0.0.0-20211012122336-39d0f177ccd0 // indirect
	github.com/power-devops/perfstat v0.0.0-20210106213030-5aafc221ea8c // indirect
	github.com/shoenig/go-m1cpu v0.1.6 // indirect
	github.com/tklauser/go-sysconf v0.3.12 // indirect
	github.com/tklauser/numcpus v0.6.1 // indirect
	github.com/yusufpapurcu/wmi v1.2.4 // indirect
	golang.org/x/net v0.51.0 // indirect
	golang.org/x/sys v0.42.0 // indirect
	golang.org/x/text v0.34.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260226221140-a57be14db171 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
	howett.net/plist v1.0.2-0.20250314012144-ee69052608d9 // indirect
)

replace github.com/skaia/grpc => ./backend/pkg/grpc
