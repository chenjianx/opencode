# raccoon-intellij

Raccoon AI 编码助手的 JetBrains（IntelliJ 系）插件，与 `raccoon-vscode` 对齐。

## 架构

VSCode 端是一个**薄宿主**：几乎所有逻辑都在平台无关的
[`@opencode-ai/raccoon-core`](../raccoon-core)（`RaccoonProvider` 编排层）与
[`@opencode-ai/raccoon-webview`](../raccoon-webview)（React UI）里。`raccoon-core` 直接依赖 Node
内建模块，无法在 JVM/JCEF 中运行，因此本插件采用 **Node 子进程 + JCEF** 架构，最大化复用这两个包：

```
IntelliJ 插件 (Kotlin)
 ├─ RaccoonToolWindowFactory ── JBCefBrowser 加载 raccoon-webview 构建产物
 │     └─ 注入 bridge shim：window.acquireVsCodeApi -> JBCefJSQuery
 ├─ SidecarProcess ── 启动 `node sidecar.cjs`，stdin/stdout 上跑 JSON-lines RPC
 │     └─ sidecar 内 new RaccoonProvider(connection, platform, transport)
 │            └─ ConnectionPort 拉起 opencode server（复刻 server-manager.ts）
 └─ 消息流：
      webview --postMessage--> JS bridge --JBCefJSQuery--> Kotlin --stdin--> sidecar
      sidecar --stdout(JSON-RPC)--> Kotlin --executeJavaScript--> webview(message 事件)
```

- Kotlin 只做宿主：工具窗口、JCEF、进程管理、stdio 桥接。
- `sidecar/`（TypeScript，esbuild 打包成 `sidecar.cjs`）实现 core 的三个 port：
  `ConnectionPort`（`connection.ts`）、`HostPlatform`（`platform.ts`）、`WebviewTransport`（`transport.ts`）。
- 首版 `HostPlatform.editor.*` 为 stub —— 聊天不依赖编辑器上下文。

## 目录

```
sidecar/                     # Node 子进程（TS 源码）
  index.ts                   #   装配 RaccoonProvider + 三个 port + stdio 循环
  rpc.ts                     #   stdio JSON-lines 协议
  connection.ts              #   ConnectionPort：拉起 opencode server
  platform.ts                #   HostPlatform：env/fs/storage 真实现，editor stub
  transport.ts               #   WebviewTransport：post* -> stdout
src/main/kotlin/ai/opencode/raccoon/
  RaccoonToolWindowFactory.kt#   注册工具窗口
  RaccoonService.kt          #   项目级 service：桥接 sidecar <-> webview
  SidecarProcess.kt          #   Node 子进程 + stdio 读写
  RaccoonWebview.kt          #   JBCefBrowser + acquireVsCodeApi bridge
  WebviewResourceHandler.kt  #   把 webview 产物以虚拟 http 源提供给 JCEF
src/main/resources/
  META-INF/plugin.xml
  webview/                   # vite 构建产物（bun run build:webview 生成）
  sidecar/sidecar.cjs        # esbuild 产物（bun run build:sidecar 生成）
```

## 构建

先构建前端资源（webview + sidecar），再用 Gradle 打包插件：

```bash
# 1) 生成 webview 产物与 sidecar.cjs 到 src/main/resources/
bun install                 # 在仓库根执行一次
bun run build               # 在本目录：= build:webview + build:sidecar

# 2) 构建插件 zip（需 JDK 17，IntelliJ 2024.2 运行时）
JAVA_HOME=<jdk17> ./gradlew buildPlugin
# 产物：build/distributions/raccoon-intellij-0.0.0.zip
```

## 本地运行

```bash
JAVA_HOME=<jdk17> ./gradlew runIde
```

正式构建会生成并打包 `darwin-arm64`、`darwin-x64`、`linux-x64`、`win32-x64` 四个平台的二进制，
插件运行时按当前平台直接选择内置文件。`runIde` 则使用 `packages/opencode` 源码启动，便于调试。
也可用环境变量连接已有服务：

- `RACCOON_NODE` —— node 运行时路径（默认按 PATH / 常见位置查找）。
- `RACCOON_SERVER_URL` —— 直接连已运行的 server，跳过 spawn。

打开右侧 **Raccoon** 工具窗口即加载聊天界面。

## 现状与后续

**已实现**：Gradle 插件骨架、JCEF 工具窗口、Node 子进程、opencode server 拉起、
聊天端到端（init → server → 状态流 → 双向消息）。

**待办**：编辑器右键命令（explain/fix/improve/add-context）、code-lens 函数动作、
内联自动补全、独立设置面板、`HostPlatform.editor.*` 与 `ui.*` 经桥接接回 IDE、
node 运行时与 server 二进制的打包分发、JDK 21 工具链。
