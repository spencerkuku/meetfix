FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY packages ./packages
RUN npm ci
COPY backend ./backend
RUN npm run build --workspace=repair-visibility
RUN npx prisma generate --schema=backend/prisma/schema.prisma
RUN npm run build --workspace=backend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY packages ./packages
RUN npm ci
COPY --from=build /app/packages/repair-visibility/dist ./packages/repair-visibility/dist
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY backend/docker-entrypoint.sh ./backend/docker-entrypoint.sh
RUN chmod +x backend/docker-entrypoint.sh
RUN mkdir -p backend/uploads/rooms backend/uploads/repairs && chown -R node:node /app
USER node
WORKDIR /app/backend
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
