FROM oven/bun:1.4-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
USER bun
# Applies pending migrations on boot, then serves.
CMD ["bun", "src/index.ts"]
