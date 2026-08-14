// throwaway spike: 验证 bun build --compile 能否打包 @napi-rs/keyring（SPEC 风险 R2）
import { Entry } from "@napi-rs/keyring"
const e = new Entry("iterum-spike", "test")
e.setPassword("secret")
console.log("keyring OK:", e.getPassword() === "secret")
e.deletePassword()
