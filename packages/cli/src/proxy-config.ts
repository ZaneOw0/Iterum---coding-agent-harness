import { execFileSync } from "node:child_process"

export interface ProxyTarget { host: string; port: number }

// 解析代理目标：支持 http://host:port、裸 host:port，以及
// "http=host:port;https=host:port" 形式（取第一个 host:port 项）。
export function parseProxyTarget(s: string): ProxyTarget | undefined {
  const raw = s.trim()
  if (!raw) return undefined
  const first = raw.split(";").map(x => x.trim()).find(x => x.length > 0)
  if (!first) return undefined
  let hostPort = first
  const eq = first.indexOf("=")
  if (eq >= 0) hostPort = first.slice(eq + 1).trim()
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(hostPort)
  if (scheme) hostPort = hostPort.slice(scheme[0].length)
  hostPort = hostPort.split(/[/?#]/)[0] ?? ""
  const lastColon = hostPort.lastIndexOf(":")
  if (lastColon <= 0) return undefined
  const host = hostPort.slice(0, lastColon)
  const port = Number(hostPort.slice(lastColon + 1))
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return undefined
  return { host, port }
}

export interface ProxyConfig { proxy?: string }

// 代理优先级：cfg.proxy 显式指定 → win32 读系统代理注册表 → 无。
export function detectProxy(cfg: ProxyConfig, query?: (name: string) => string | undefined, platform: string = process.platform): ProxyTarget | undefined {
  if (cfg.proxy) return parseProxyTarget(cfg.proxy)
  if (platform !== "win32") return undefined
  const q = query ?? registryQuery
  try {
    const enabled = q("ProxyEnable")
    if (enabled === undefined || Number(enabled) !== 1) return undefined
    const server = q("ProxyServer")
    if (!server) return undefined
    return parseProxyTarget(server)
  } catch {
    return undefined
  }
}

function registryQuery(name: string): string | undefined {
  try {
    const out = execFileSync("reg.exe", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", name], { encoding: "utf8" })
    const line = out.split(/\r?\n/).map(l => l.trim()).find(l => l.includes(name))
    if (!line) return undefined
    const parts = line.split(/\s+/)
    return parts.at(-1)
  } catch {
    return undefined
  }
}
