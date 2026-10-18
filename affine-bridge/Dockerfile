FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./

USER node
EXPOSE 8085
CMD ["node", "server.mjs"]
