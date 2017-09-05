#!/usr/bin/env bash

./node_modules/geojson-random/geojson-random 1000 point-stream > points-1000.geojson
./node_modules/geojson-random/geojson-random 10000 point-stream > points-10000.geojson
./node_modules/geojson-random/geojson-random 100000 point-stream > points-100000.geojson
