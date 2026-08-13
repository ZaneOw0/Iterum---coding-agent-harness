FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun build --compile --target=bun-linux-x64 packages/cli/src/main.ts --outfile /app/iterum

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app/iterum /usr/local/bin/iterum
ENTRYPOINT ["iterum"]
