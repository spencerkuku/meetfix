#!/bin/sh
set -e
npx prisma migrate deploy
node dist/bootstrap-admin-cli.js
exec node dist/main.js
