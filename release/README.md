# 发布与签名 OTA

首版目标为 macOS Apple Silicon `v0.1.0` / build 1，应用 ID 为 `io.github.mjason.longxgui`。
NSH 固定为 `0.5.0`。所有产物先准备为 GitHub **草稿**，不自动公开。

## 信任链

- 安装包内固定 GitHub 来源 `mjason/longx-gui`、清单公钥和 OTA 根公钥。
- 根密钥只用于签发叶子发布证书；叶子密钥签 `.nshpkg`，独立更新密钥签 `latest.json`。
- 公钥与 `release.cert` 在 `release/keys/`。证书仅覆盖本应用 ID，有效期一年，应在 2027-11-14 前重新签发。
- 本机私钥位于 `.longx/local/release-keys/`，以 owner-only 权限保存，同时由 `.gitignore` 的目录及 `*.secret` 规则排除。应把根私钥转存到自己的加密离线备份；本仓库和 GitHub 都没有根私钥备份。
- 不丢失更新密钥：其公钥固定在已分发安装包里。更换它需要先以旧密钥发布一个信任新密钥的整包版本。

## 本地准备

1. 修改 `nsh.json` 和 `package.json` 的 version；同步 package-lock。每次整包或 OTA 发布都递增 `build`，写 `release/notes/v<version>.md`。
2. 运行 `npm ci` 与 `npm run quality`。本机没有全局 nsh 时，先设置 `NSH_BIN` 指向可信的 NSH 0.5.0 分发中的 `bin/nsh`。
3. 运行 `npm run release:prepare -- full`，生成当前 Mac 的安装包、OTA、带签名清单、校验和及 release notes；只需要 TSX 的后续发布用 `ota`。
4. 运行 `node scripts/verify-release.mjs`，再对安装包进行测试。首版 build 1 的 OTA 不会被同 build 的首版安装包当成升级；端到端 OTA 演练必须用更高 build 的测试包，不能靠降低版本校验来测试。
5. 将代码提交并推送，记录该 commit。正式整包应由下述 Actions 完成 Apple 签名/公证，创建指向它的 GitHub draft release。只上传 `.tar.gz`、`.nshpkg`、`latest.json`、`latest.json.sig`、`SHA256SUMS` 和整包的 `MACOS_DISTRIBUTION.json`。不要上传 native 工作目录、私钥或调试 sourcemap。
6. 人工检查下载/安装/升级后，才将草稿改为正式发布。Draft/prerelease 不进入 NSH updater 的 latest 通道。

脚本不会覆盖已有的非空 `dist/v<version>`；需要重建时，将旧目录移到另一个明确的路径做对比，不要混用旧包与新签名。

`NSH_KEY_DIR` 可指定另一私钥目录；`NSH_RELEASE_CERT_FILE` 可指定公开叶子证书。根私钥不参与日常构建。

## GitHub Actions

`.github/workflows/release.yml` 仅接受手动触发，且只创建草稿。配置 GitHub Settings → Environments → `release`，建议限制为 `main` 并要求拥有者审批。Secrets 只添加到此 environment，不发到聊天、不提交 Git：

| Secret                       | 内容                                                             |
| ---------------------------- | ---------------------------------------------------------------- |
| `NSH_RELEASE_KEY`            | `.longx/local/release-keys/release.secret` 的原文                |
| `NSH_UPDATE_KEY`             | `.longx/local/release-keys/update.secret` 的原文                 |
| `APPLE_CERTIFICATE_P12`      | Developer ID Application 证书与配套私钥导出为 `.p12` 后的 base64 |
| `APPLE_CERTIFICATE_PASSWORD` | 导出 `.p12` 时设置的非空密码                                     |
| `APPLE_SIGN_IDENTITY`        | 完整身份名，例如 `Developer ID Application: Your Name (TEAMID)`  |
| `APPLE_API_KEY_P8`           | App Store Connect **团队 API Key** 下载的 `.p8` 原文             |
| `APPLE_API_KEY_ID`           | 该团队 API Key 的 Key ID                                         |
| `APPLE_API_ISSUER`           | 该团队 API Key 的 Issuer ID                                      |

不需要上传根私钥。NSH 两个 secret 已在本机生成；拥有者可通过 stdin 上传，而不展示值：

```sh
gh secret set NSH_RELEASE_KEY --env release < .longx/local/release-keys/release.secret
gh secret set NSH_UPDATE_KEY --env release < .longx/local/release-keys/update.secret
```

Apple 证书在 Apple Developer → Certificates 中申请 **Developer ID Application**，不是 Apple Development、Apple Distribution 或 Developer ID Installer。可用 Xcode 管理证书或钥匙串生成 CSR；证书必须与这台生成 CSR 的机器上的私钥配对，再一起导出 `.p12`。具体申请和账号授权由拥有者完成。公证使用与该团队匹配的 App Store Connect 团队 API Key；不要把个人 API Key 当成需要 Issuer ID 的团队密钥。

`.p12` 可通过 `base64 -i /你的路径/DeveloperID.p12 | gh secret set APPLE_CERTIFICATE_P12 --env release` 直接上传；`.p8` 可用 `gh secret set APPLE_API_KEY_P8 --env release < /你的路径/AuthKey.p8`。其他值用 GitHub 的 masked secret 表单填写。

Workflow 使用 Apple Silicon runner，下载官方固定版本与对应 checksum，不使用浮动 latest；先质量检查，再读签名密钥。NSH 叶子证书保持公开以便审查。`full` 模式将 Apple 私钥导入短期钥匙串，逐个签名原生 Mach-O 文件，再签应用，提交公证，staple、validate、Gatekeeper assess 通过后重新归档；最后才计算 hash 并签 manifest。运行结束删除临时钥匙串和密钥文件。若证书、账号、架构、签名、公证任一环节失败，不生成可发布整包，不回退 ad-hoc。

GitHub Actions → Prepare signed release draft → Run workflow，选择 `full` 准备首版。后续纯 TSX 选择 `ota`，无需 Apple 证书（但仍需 NSH 签名密钥）。此工作流从不自动公开草稿。

## 升级体验与边界

安装版启动后延迟 10 秒、之后每六小时检查一次；先检查 OTA，没有可用 OTA 才查整包。不会后台下载、安装或重启。菜单“检查更新…”与设置“关于与更新”提供手动入口，进度/错误/已验证状态均可见。

应用内重启有系统确认，提醒未保存编辑内容、消息草稿和本机排队消息不会跨重启保存。暂不自动恢复这些状态。关闭此确认不会安装更新。开发预览明确显示“不执行在线升级”，不把不支持当成已是最新版。

签名、证书、应用 ID、runtime 下限、build 防回滚、hash 与大小校验由 NSH 原生更新器负责；JS 不自制下载后执行通道。异常时不关闭验证或自动走另一个更新源。首次启动 OTA 的试运行与失败回退由 NSH 管理。

## macOS 发行状态

用户拥有 Apple Developer 账号，并将自行申请证书、配置 GitHub Secrets。当前机器尚无 Developer ID 身份，因此本机产物只是 ad-hoc **测试构建**，不能作为正式发行版。正式首版必须通过 Actions 的签名/公证路径。不要为安装而关闭 Gatekeeper。

本机签名清单和 OTA 的密码学验证不等于 Apple 公证，也不等于已经完成真实设备的升级/回滚演练。未完成的检查须在发布交接中明确列出。
