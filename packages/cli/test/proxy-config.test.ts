import { describe, expect, test } from "bun:test"
import { parseProxyTarget, detectProxy, vendorFetch } from "../src/proxy-config"
import { getVendor } from "@iterum/core/llm/vendors"

describe("parseProxyTarget", () => {
  test("http://host:port 形式", () => {
    expect(parseProxyTarget("http://127.0.0.1:7890")).toEqual({ host: "127.0.0.1", port: 7890 })
  })
  test("裸 host:port 形式", () => {
    expect(parseProxyTarget("127.0.0.1:7890")).toEqual({ host: "127.0.0.1", port: 7890 })
  })
  test("分号分隔取第一项", () => {
    expect(parseProxyTarget("http=127.0.0.1:7890;https=127.0.0.1:7890")).toEqual({ host: "127.0.0.1", port: 7890 })
    expect(parseProxyTarget("http://127.0.0.1:7890;http://127.0.0.1:8080")).toEqual({ host: "127.0.0.1", port: 7890 })
  })
  test("非法输入返回 undefined", () => {
    expect(parseProxyTarget("")).toBeUndefined()
    expect(parseProxyTarget("nohost")).toBeUndefined()
    expect(parseProxyTarget("host:0")).toBeUndefined()
    expect(parseProxyTarget("host:99999")).toBeUndefined()
  })
})

describe("detectProxy", () => {
  test("cfg.proxy 优先于注册表", () => {
    expect(detectProxy({ proxy: "http://127.0.0.1:7890" }, () => undefined)).toEqual({ host: "127.0.0.1", port: 7890 })
  })
  test("win32 注册表开启且 ProxyServer 有效时解析", () => {
    const query = (n: string) => n === "ProxyEnable" ? "0x1" : n === "ProxyServer" ? "127.0.0.1:7890" : undefined
    expect(detectProxy({}, query, "win32")).toEqual({ host: "127.0.0.1", port: 7890 })
  })
  test("注册表未开启或查询失败返回 undefined", () => {
    expect(detectProxy({}, (n: string) => n === "ProxyEnable" ? "0x0" : "127.0.0.1:7890", "win32")).toBeUndefined()
    expect(detectProxy({}, () => { throw new Error("reg not found") }, "win32")).toBeUndefined()
  })
  test("非 win32 不查注册表", () => {
    expect(detectProxy({}, () => "0x1", "linux")).toBeUndefined()
  })
})

describe("vendorFetch", () => {
  const proxyQuery = (n: string) => n === "ProxyEnable" ? "0x1" : n === "ProxyServer" ? "127.0.0.1:7890" : undefined
  test("direct 厂商默认直连（无视系统代理）", () => {
    expect(vendorFetch(getVendor("deepseek"), {}, proxyQuery, "win32")).toBeUndefined()
    expect(vendorFetch(getVendor("zhipu"), {}, proxyQuery, "win32")).toBeUndefined()
  })
  test("显式 cfg.proxy 强制 direct 厂商走代理", () => {
    expect(typeof vendorFetch(getVendor("deepseek"), { proxy: "http://127.0.0.1:7890" }, () => undefined, "win32")).toBe("function")
  })
  test("非 direct 厂商走系统代理，无代理时 undefined", () => {
    expect(typeof vendorFetch(getVendor("openai"), {}, proxyQuery, "win32")).toBe("function")
    expect(vendorFetch(getVendor("openai"), {}, () => undefined, "linux")).toBeUndefined()
  })
})
