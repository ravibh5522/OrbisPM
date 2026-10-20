FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY api.js tools.js http.js server.js ./
ENV NODE_ENV=production PORT=8090
EXPOSE 8090
USER node
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:8090/health || exit 1
CMD ["node", "http.js"]
