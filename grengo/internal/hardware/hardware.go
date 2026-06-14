package hardware

import (
	"fmt"
	"sync"
	"time"

	"github.com/jaypipes/ghw"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
)

type StaticInfo struct {
	CPUModel      string   `json:"cpu_model"`
	TotalCores    uint32   `json:"total_cores"`
	MemoryTotal   uint64   `json:"memory_total"`
	MemorySticks  []string `json:"memory_sticks"`
	GPUs          []string `json:"gpus"`
	StorageDrives []string `json:"storage_drives"`
}

type DynamicInfo struct {
	CorePercents []float64 `json:"core_percents"`
	MemoryUsed   uint64    `json:"memory_used"`
	Temps        []float64 `json:"temps"`
	DiskReads    uint64    `json:"disk_reads"`
	DiskWrites   uint64    `json:"disk_writes"`
}

type HardwarePayload struct {
	Static  StaticInfo  `json:"static"`
	Dynamic DynamicInfo `json:"dynamic"`
}

var (
	cachedStatic  *StaticInfo
	cachedDynamic *DynamicInfo
	mu            sync.RWMutex
	once          sync.Once
)

// InitAndWatch starts the background ticker that updates dynamic stats.
func InitAndWatch() {
	once.Do(func() {
		cachedStatic = gatherStatic()
		cachedDynamic = gatherDynamic()
		go loop()
	})
}

func loop() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		dyn := gatherDynamic()
		mu.Lock()
		cachedDynamic = dyn
		mu.Unlock()
	}
}

// GetPayload returns the latest cached hardware payload.
func GetPayload() HardwarePayload {
	mu.RLock()
	defer mu.RUnlock()
	var payload HardwarePayload
	if cachedStatic != nil {
		payload.Static = *cachedStatic
	}
	if cachedDynamic != nil {
		payload.Dynamic = *cachedDynamic
	}
	return payload
}

func gatherStatic() *StaticInfo {
	s := &StaticInfo{}

	// ghw for deep hardware
	cpuInfo, _ := ghw.CPU()
	if cpuInfo != nil && len(cpuInfo.Processors) > 0 {
		s.CPUModel = cpuInfo.Processors[0].Model
		s.TotalCores = cpuInfo.TotalCores
	}

	memInfo, _ := ghw.Memory()
	if memInfo != nil {
		s.MemoryTotal = uint64(memInfo.TotalPhysicalBytes)
		for _, m := range memInfo.Modules {
			if m.SizeBytes > 0 {
				s.MemorySticks = append(s.MemorySticks, fmt.Sprintf("%s %dMB", m.Vendor, m.SizeBytes/1024/1024))
			}
		}
	}

	gpuInfo, _ := ghw.GPU()
	if gpuInfo != nil {
		for _, card := range gpuInfo.GraphicsCards {
			if card.DeviceInfo != nil {
				s.GPUs = append(s.GPUs, card.DeviceInfo.Product.Name)
			}
		}
	}

	blkInfo, _ := ghw.Block()
	if blkInfo != nil {
		for _, disk := range blkInfo.Disks {
			s.StorageDrives = append(s.StorageDrives, fmt.Sprintf("%s (%s) %dGB", disk.Name, disk.DriveType.String(), disk.SizeBytes/1024/1024/1024))
		}
	}

	return s
}

func gatherDynamic() *DynamicInfo {
	d := &DynamicInfo{}

	// gopsutil for dynamic
	percents, _ := cpu.Percent(0, true)
	d.CorePercents = percents

	v, _ := mem.VirtualMemory()
	if v != nil {
		d.MemoryUsed = v.Used
	}

	sensors, _ := host.SensorsTemperatures()
	for _, sensor := range sensors {
		if sensor.Temperature > 0 {
			d.Temps = append(d.Temps, sensor.Temperature)
		}
	}

	ioStats, _ := disk.IOCounters()
	for _, io := range ioStats {
		d.DiskReads += io.ReadBytes
		d.DiskWrites += io.WriteBytes
	}

	return d
}
