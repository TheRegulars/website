package main

import (
	"archive/zip"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

type MapsState struct {
	gameDirs func() []string
	pk3Cache sync.Map
}

type PK3Info struct {
	modTime time.Time
	size    int64
	maps    []string
}

var bspRe *regexp.Regexp = regexp.MustCompile(`(?i)^maps/([^/\\]+)\.bsp$`)

func (s *MapsState) GetMapsSet() map[string]struct{} {
	pk3sFound := make(map[string]bool)
	mapsFound := make(map[string]struct{})
	for _, dir := range s.gameDirs() {
		files, err := os.ReadDir(dir)
		if err != nil {
			log.Printf("Error reading dir: %v", err)
			continue
		}
		for _, file := range files {
			// TODO: add support for pk3dir too
			if strings.EqualFold(filepath.Ext(file.Name()), ".pk3") && file.Type().IsRegular() {
				fullpath := filepath.Join(dir, file.Name())
				stat, err := file.Info()
				if err != nil {
					// e.g. the pk3 was removed after ReadDir
					log.Printf("Can't stat %s: %v", fullpath, err)
					continue
				}
				pk3sFound[fullpath] = true
				var info *PK3Info
				if value, ok := s.pk3Cache.Load(fullpath); ok {
					info = value.(*PK3Info)
				}
				// pk3 got changed
				if info == nil || !info.modTime.Equal(stat.ModTime()) || info.size != stat.Size() {
					info, err = loadPK3Info(fullpath, stat)
					if err != nil {
						log.Printf("Can't load maps from %s %v", fullpath, err)
						s.pk3Cache.Delete(fullpath)
						continue
					}
					s.pk3Cache.Store(fullpath, info)
				}
				for _, mapname := range info.maps {
					mapsFound[mapname] = struct{}{}
				}
			}
		}
	}
	// forget pk3s that were removed
	s.pk3Cache.Range(func(key, _ any) bool {
		if !pk3sFound[key.(string)] {
			s.pk3Cache.Delete(key)
		}
		return true
	})
	// ignore special map for hud setup
	delete(mapsFound, "_hudsetup")
	return mapsFound
}

func loadPK3Info(filename string, stat os.FileInfo) (*PK3Info, error) {
	info := &PK3Info{modTime: stat.ModTime(), size: stat.Size()}
	err := listPk3Maps(filename, func(mapname string) bool {
		info.maps = append(info.maps, mapname)
		return true
	})
	if err != nil {
		return nil, err
	}
	return info, nil
}

func (s *MapsState) ListMaps() []string {
	mapsFound := s.GetMapsSet()
	mapsList := make([]string, 0, len(mapsFound))
	for mapname := range mapsFound {
		mapsList = append(mapsList, mapname)
	}
	sort.Strings(mapsList)
	return mapsList
}

func listPk3Maps(filename string, callback func(string) bool) error {
	arc, err := zip.OpenReader(filename)
	if err != nil {
		return err
	}

	defer arc.Close()

	for _, f := range arc.File {
		match := bspRe.FindStringSubmatch(f.Name)
		if len(match) == 2 {
			ok := callback(match[1])
			if !ok {
				return nil
			}
		}
	}
	return nil
}
