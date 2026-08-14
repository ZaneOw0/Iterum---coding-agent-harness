# spikes/

一次性可行性验证脚本目录（throwaway，不进入产品代码）。

## 2026-08-14: bun compile + @napi-rs/keyring 打包验证（SPEC 风险 R2 去险）

**结论：可行。** Windows 下 `bun build --compile` 能成功打包 `@napi-rs/keyring`
原生模块（.node 被嵌入可执行文件），运行后 keyring 读写（Windows Credential
Manager）功能正常。

### 运行方式

```powershell
bun add @napi-rs/keyring --registry https://registry.npmjs.org/   # 已写入根 package.json
bun run spikes/compile-keyring.ts   # 直接运行（对照基线）
bun build --compile --target=bun-windows-x64 spikes/compile-keyring.ts --outfile spikes/dist/spike.exe
spikes/dist/spike.exe               # 输出 keyring OK: true，退出码 0
```

### 实测输出

```
> bun run spikes/compile-keyring.ts
keyring OK: true

> .\spikes\dist\spike.exe
keyring OK: true
exit code: 0
```

- 环境：bun 1.3.14，Windows（x64），PowerShell 5.1
- 产物大小：spike.exe ≈ 100,340,736 字节（约 95.7 MiB）
- 编译耗时：bundle 19ms + compile 452ms

### 说明与已知问题

- brief 指定的 `--target=bun-windows-x64` 在 bun 1.3.14 上可被识别（跨编译
  target 语义）。验证方式：`--target=bun-linux-x64` 会尝试下载 Linux base 可执行
  文件并失败（`Failed to extract executable for 'bun-linux-x64-v1.3.14'`），证明
  target 参数未被忽略；`bun-windows-x64` 因本机 base 已就绪而直接成功。
- 嵌入验证：exe 内可检索到 `napi_register_module_v1` 符号，keyring 的
  `.node` 原生模块被静态打入可执行文件，运行时无需 node_modules。
- **registry 渗入（本机环境问题）**：bun 1.3.14 在本机优先读取 `~/.npmrc`
  （`registry=https://registry.npmmirror.com`），项目 bunfig.toml 的 registry
  未生效，`bun add` 会把 npmmirror 镜像 URL 写进 bun.lock。已改用显式
  `--registry https://registry.npmjs.org/` 安装（锁文件中 URL 留空，与仓库既有
  条目一致）。后续安装依赖时建议沿用该 flag 或修复本机 .npmrc。
- `spikes/dist/` 已加入 .gitignore，产物不提交。
