#!/bin/sh
set -eu

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "> prisma migrate deploy"
  node /opt/prisma/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma
fi

echo "> starting SpeedTyper"
exec node /app/dist/server.cjs
