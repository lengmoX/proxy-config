# Emby 自定义分流

两个脚本都会在 `📲 Telegram` 后面创建 `🎬 Emby`，支持现有的
`policyNodes=all|none` 和 `landing=true|false` 参数。
默认跟随默认代理，可在面板中切换为直连、地区组或其他可选节点。

**两个脚本默认使用本仓库的 Emby 规则直链，无需额外传参即可启用分流。**
可通过 `embyRuleUrl` 覆盖地址；传入空字符串时仅创建分组，不新增规则或下载配置。
sing-box 模板原有的自定义规则会保留。无需修改原来的 AI 规则。

## 1. 填写规则文件

这两个文件表达相同规则，但格式不同，不能混用：

| 客户端 | 文件 | 配置格式 |
| --- | --- | --- |
| sing-box 1.13.x | `sing-box.json` | `format: "source"`，JSON 源规则 |
| mihomo | `mihomo.yaml` | `behavior: classical` + `format: yaml` |

两个文件目前包含 `random.ouonet.org`、`pro.emby.moe` 和 `emby.ibukifuko.tech`。
新增或修改 Emby 域名时，请同步维护两个文件。域名不要包含 `https://`、端口或路径。
`domain_suffix` / `DOMAIN-SUFFIX` 匹配该域名及其子域名；如果只需精确匹配，
分别改用 `domain` / `DOMAIN`。多个地址继续添加数组元素即可。
播放可能跳转至独立媒体域名，需按实际连接补充，勿泛匹配整个共享 CDN。

纯 IP 地址的规则示例（以下是文档示例 IP，使用前替换）：

sing-box：在 `rules` 中追加独立对象：

```json
{ "ip_cidr": ["192.0.2.10/32"] }
```

mihomo：在 `payload` 中追加：

```yaml
  - IP-CIDR,192.0.2.10/32,no-resolve
```

注意：现有更靠前的规则仍可能优先命中，例如 sing-box 的私网直连规则。
本功能不是通过识别 Emby 应用或端口来自动发现所有服务器。

## 2. 默认直链与自定义地址

当前默认直链均返回文件正文：

```text
https://raw.githubusercontent.com/lengmoX/proxy-config/main/rules/emby/sing-box.json
https://raw.githubusercontent.com/lengmoX/proxy-config/main/rules/emby/mihomo.yaml
```

如需改用自己的文件托管地址，在 Sub-Store 脚本参数中新增 `embyRuleUrl`，sing-box 填 JSON 文件地址，
mihomo 填 YAML 文件地址。保留原有参数；sing-box 仍需 `name`。
不要使用 GitHub 的 `blob` 网页地址。
如果通过脚本 URL 的 `#key=value&...` 传参，应对规则 URL 使用
`encodeURIComponent` 编码，尤其是包含 `&`、`#` 的地址。

sing-box 生成的规则集形如：

```json
{
  "tag": "emby",
  "type": "remote",
  "format": "source",
  "url": "https://raw.githubusercontent.com/lengmoX/proxy-config/main/rules/emby/sing-box.json",
  "download_detour": "🎯 全球直连"
}
```

sing-box 默认通过直连下载此规则集，因此地址必须在你的网络中可访问。
若无法直连 GitHub Raw，可用 `embyRuleUrl` 覆盖为可访问的镜像直链。

不需要编译二进制。若以后改用二进制规则，sing-box 需真正编译成 `.srs`
并改为 `format: binary`；mihomo 的 `.mrs` 是另一种格式，不能共用，
也不能只改文件扩展名。

发布到公开仓库会公开 Emby 域名/IP，请勿在规则中写入账号、密码或访问令牌。
