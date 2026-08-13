test:
	bun test

demo:
	bun demos/demo1-guardrail.ts
	bun demos/demo2-feedback-loop.ts
	bun demos/demo3-threshold-stop.ts

build-win:
	bun build --compile --target=bun-windows-x64 packages/cli/src/main.ts --outfile dist/iterum-win-x64.exe

build-macos:
	bun build --compile --target=bun-darwin-arm64 packages/cli/src/main.ts --outfile dist/iterum-macos-arm64

build-linux:
	bun build --compile --target=bun-linux-x64 packages/cli/src/main.ts --outfile dist/iterum-linux-x64

docker-build:
	docker build -t iterum:latest .
