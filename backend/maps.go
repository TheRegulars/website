package main

import (
	"archive/zip"
	"io/ioutil"
	"log"
	"path"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

type MapsState struct {
	gameDirs  func() []string
	mapsCache sync.Map
}

type PK3Info struct {
	modTime time.Time
	maps    []string
}

type MapnameCallback = func(key, value string, state interface{})

var bspRe *regexp.Regexp = regexp.MustCompile(`^maps/([^/\\]+)\.bsp$`)

func (s *MapsState) ListMaps() []string {
	checkFiles := make(map[string]time.Time)
	mapsFound := make(map[string]bool)
	dirs := s.gameDirs()
	for _, dir := range dirs {
		files, err := ioutil.ReadDir(dir)
		if err != nil {
			log.Printf("Error reading dir: %v", err)
			continue
		}
		for _, file := range files {
			// TODO: add support for pk3dir too
			if strings.HasSuffix(file.Name(), ".pk3") {
				fullpath := path.Join(dir, file.Name())
				if file.Mode().IsRegular() {
					checkFiles[fullpath] = file.ModTime()
				}
			}
		}
	}
	iterateStoredMaps := func(key, value interface{}) bool {
		filepath, ok := key.(string)
		if !ok {
			// skip this
			return true
		}
		info, ok := value.(*PK3Info)
		if !ok {
			return true
		}
		modtime, ok := checkFiles[filepath]
		if !ok {
			// this map was removed
			s.mapsCache.Delete(key)
			return true
		}

		if modtime.After(info.modTime) {
			var newInfo PK3Info
			// file was updated, so we need to update maps from this file
			newInfo.maps = nil
			callback := func(mapname string) bool {
				newInfo.maps = append(newInfo.maps, mapname)
				return true
			}
			err := listPk3Maps(filepath, callback)
			if err != nil {
				// we can't load maps for this file
				log.Printf("Can't load maps from %s %v", filepath, err)
				s.mapsCache.Delete(key)
				delete(checkFiles, filepath)
				return true
			}

			newInfo.modTime = modtime
			s.mapsCache.Store(key, &newInfo)
			info = &newInfo
		}
		delete(checkFiles, filepath)
		for _, mapname := range info.maps {
			mapsFound[mapname] = true
		}
		return true
	}
	s.mapsCache.Range(iterateStoredMaps)
	for filepath, modtime := range checkFiles {
		var newInfo PK3Info
		newInfo.modTime = modtime
		callback := func(mapname string) bool {
			newInfo.maps = append(newInfo.maps, mapname)
			return true
		}
		err := listPk3Maps(filepath, callback)
		if err != nil {
			log.Printf("Can't load maps from %s %v", filepath, err)
		}
		s.mapsCache.Store(filepath, newInfo)
		for _, mapname := range newInfo.maps {
			mapsFound[mapname] = true
		}
	}
	mapsList := make([]string, 0, len(mapsFound))
	for mapname, _ := range mapsFound {
		if mapname == "_hudsetup" {
			// this special xon map for hud setup
			// we ignore it
			continue
		}
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
