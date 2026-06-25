# gRPC Schema Layout

This module keeps hand-written protobuf schemas and generated Go packages in
separate directories:

- `proto/*.proto` is the canonical source for service definitions.
- `grengo/*.pb.go` is generated for `github.com/skaia/grpc/grengo`.
- `skaia/*.pb.go` is generated for `github.com/skaia/grpc/skaia`.
- `ws/*.pb.go` is generated for `github.com/skaia/grpc/ws`.

Do not edit or add `.proto` files inside generated package directories. Update
the matching file in `proto/`, then regenerate from `backend/pkg/grpc`:

```sh
protoc -I . \
  --go_out=. --go-grpc_out=. \
  --go_opt=module=github.com/skaia/grpc \
  --go-grpc_opt=module=github.com/skaia/grpc \
  proto/grengo.proto proto/skaia.proto

protoc -I . \
  --go_out=. \
  --go_opt=module=github.com/skaia/grpc \
  proto/ws.proto
```
