#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "Starting Infinite Dungeon Reborn Platform on http://127.0.0.1:3210"
node ./server.js
