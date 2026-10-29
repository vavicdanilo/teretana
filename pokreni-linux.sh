#!/usr/bin/env bash
set -eu
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Instaliraj Node.js 22 ili noviji sa https://nodejs.org/ pa pokušaj ponovo."
  exit 1
fi
echo "Otvori http://localhost:3000 u pregledniku."
echo "Terminal ostavi otvoren dok koristiš aplikaciju."
exec node server.mjs
