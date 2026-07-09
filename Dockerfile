FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production --no-audit --no-fund

COPY . .

RUN mkdir -p /app/data /app/uploads/products /app/uploads/logo

ENV PORT=3000
ENV DATA_DIR=/app/data
ENV UPLOAD_DIR=/app/uploads
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
