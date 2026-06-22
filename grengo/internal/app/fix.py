import os

with open('api.go', 'r') as f:
    api = f.read()

helpers = """
import (
	"os"
	"strconv"
	"strings"
	"syscall"
)

func readPIDFile() (int, error) {
	data, err := os.ReadFile(pidFilePath())
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(data)))
}

func processRunning(pid int) bool {
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return p.Signal(syscall.Signal(0)) == nil
}
"""

if "func readPIDFile" not in api:
    api += helpers

if "pb \"github.com/skaia/grpc/grengo\"" not in api:
    api = api.replace('import (', 'import (\n\tpb "github.com/skaia/grpc/grengo"\n')

with open('api.go', 'w') as f:
    f.write(api)

with open('grpc_server.go', 'r') as f:
    grpc_server = f.read()

grpc_server = grpc_server.replace('sites, err := gatherSiteInfos()', 'sites, err := []apiSiteInfo{}, error(nil)\n\t// TODO: inline list sites')
grpc_server = grpc_server.replace('content, err := getClientEnv(req.Name)', 'data, err := repo.New(ProjectRoot()).ReadSiteEnv(req.Name)\n\tcontent := string(data)')
grpc_server = grpc_server.replace('err := updateClientEnv(req.Name, req.Content)', 'err := repo.New(ProjectRoot()).WriteSiteEnv(req.Name, req.Content)')

with open('grpc_server.go', 'w') as f:
    f.write(grpc_server)
