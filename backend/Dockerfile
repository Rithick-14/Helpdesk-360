FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY backend/package.json ./package.json
RUN npm install --omit=dev
COPY backend/src ./src
RUN mkdir -p /app/data
ENV NODE_ENV=production PORT=4000 DB_PATH=/app/data/helpdesk.sqlite
EXPOSE 4000
CMD ["node", "src/server.js"]
