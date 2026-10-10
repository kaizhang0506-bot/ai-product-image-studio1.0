# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   │   ├── api/
│   │   │   ├── upload/route.ts    # POST 素材上传（对象存储 + 签名 URL；测试版关闭后拒绝）
│   │   │   ├── analyze/route.ts   # POST AI 解析策划（理解环节双通道 understandChat：有 Key 走最新 Kimi——src/lib/kimi-client.ts 直连 Moonshot 官方 API，默认 kimi-k3，Key 来源 body.kimiApiKey > MOONSHOT_API_KEY > KIMI_API_KEY；无 Key 免密兜底内置旗舰模型 doubao-seed-2-0-pro，网关转发头鉴权——填不填都能用；Kimi 通道失败自动降级内置模型（响应 engine: kimi/builtin/kimi-fallback，降级时前端琥珀横幅提示），流程永不中断；两轮调用：①总导演统筹 AI——逐张细读产品图 + 套系风格提炼 + 统筹简报 campaign（叙事线/美术宪法/卖点覆盖审查/逐图位任务）+ 场景 DNA 提取并行；②策划师——消费统筹简报产出逐图位画面计划。用户图位清单 slotSpecText 最高优先级（"图1 模特图"/"详情页图2 细节图 xxx"）；画面文案为极短美式英文：title 2~3 词 / copy 2~4 词；测试版关闭后拒绝）
│   │   │   ├── enhance/route.ts   # POST 素材 AI 画质优化（generateImage 双通道图生图增强，支持人工自定义提示词，内容构图不变；不计入 50 张出图配额；测试版关闭后拒绝）
│   │   │   ├── generate/route.ts  # POST 批量出图 SSE 流水线（出图引擎双通道 generateImage：有 Gemini Key 走 Google Imagen，无 Key 免密走内置豆包 Seedream——src/lib/image-providers.ts；关闭检查最优先 + 剩余额度截断任务 → 参考图输入规范化 normalizeUrlList（对象 {url} 兼容收敛为字符串、过滤空值，防 SDK "URL cannot be empty"）→ 生图（提示词注入统筹美术宪法 + 图位任务 + 产品图细读 + 防复刻原创性纪律，套系一致且与参考素材明显不同；主图 1:1 / 详情页 3:2）→ 渲染文字质检 checkRenderedText（Kimi Key 走 kimi-k3，无 Key 兜底 doubao-seed-2-0-lite，异常不阻塞；白底图跳过），不合格带强调提示重采样 → 高清增强 → 精确尺寸 → SKU_N 命名；每张成功 addGenerated(1) 累计测试版权额）
│   │   │   ├── quota/route.ts     # GET 测试版配额查询（generated/max/remaining/closed）
│   │   │   └── prompts/route.ts   # 指令工作台 API（GET 六模板列表含当前生效文本与 overridden 标记 / PUT 保存覆盖 / DELETE 恢复默认；与默认一致自动移除覆盖）
│   │   ├── globals.css     # 全局样式（影棚主题 Design Tokens）
│   │   ├── layout.tsx      # 根布局与 metadata
│   │   ├── page.tsx        # 工作台主页面（阶段编排：素材 → 策划（统筹→细读→风格→规划）→ 出图 → 交付；顶部测试版徽标 + 额度进度条；closed 时显示封版面板并禁用输入；策划完成后 workflowRef 平滑滚回顶部直视计划区）
│   │   └── prompts/        # 指令工作台后台（page.tsx server metadata + workbench.tsx client：左侧模板列表 + 右侧等宽编辑器，保存覆盖/恢复默认/可用变量提示/已覆盖徽标）
│   ├── components/
│   │   ├── studio/         # 工作台业务组件
│   │   │   ├── input-panel.tsx      # 左侧输入面板（SKU/卖点/上传/出图设置；fieldset disabled 支持整体禁用 + 额度提示；底部「指令工作台」入口链接 /prompts）
│   │   │   ├── uploader.tsx         # 图片上传器（点击/拖拽，多图）
│   │   │   ├── analysis-view.tsx    # 策划结果与可编辑出图计划（含「全部参与/全部暂停」批量开关）
│   │   │   └── generation-view.tsx  # 批量生成进度与成片画廊（画框卡片 + 灯箱大图预览）
│   │   └── ui/             # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/
│   │   ├── studio-types.ts    # 共享类型与纯工具（前后端通用）
│   │   ├── studio-prompts.ts  # 生图提示词构建（按出图任务类型；版式标准经 getEditorialStandard() 实时读指令注册中心（key: editorial），支持后台覆盖热生效；美式英文文字规范（LETTER-PERFECT + 全大写标题）；套系上下文块注入统筹美术宪法/图位任务/产品图细读，详见 DESIGN.md）
│   │   ├── prompt-registry.ts # 指令注册中心（CRITICAL：全部核心 AI 指令唯一来源，六模板 scout/sceneDna/planner/copywriter/textQa/editorial；覆盖持久化 /tmp/studio-prompt-overrides.json + mtime 缓存，被清理自动回落默认；fillTemplate 做 {{var}} 占位符填充；已详细化：环节间情报宁满勿压——concept 100~150字/artDirection 200~300字/atmosphere 120~200字等；/prompts 后台可在线编辑，保存后下次调用即生效）
│   │   ├── studio-server.ts   # 服务端：对象存储 + sharp 图像处理 + 渲染文字质检（checkRenderedText）
│   │   ├── image-providers.ts # 出图引擎双通道适配层（统一入口 generateImage(UnifiedImageInput)：resolveImagenKey 有 Key（body.apiKey > GEMINI_API_KEY > GOOGLE_API_KEY）→ generateWithImagen（Gemini API gemini-2.5-flash-image，多参考图图生图，宽高比最近映射 + imageConfig 降级重试，IMAGEN_MODEL 可覆盖）；无 Key → generateWithBuiltin 免密内置豆包 Seedream（coze-coding-dev-sdk ImageGenerationClient，默认模型 doubao-seedream-5-0-260128，SEEDREAM_MODEL 可覆盖；refs 空时条件展开完全不传 image 字段——SDK validateUrl 对空值严格报错；尺寸 clampBuiltinSize 等比缩放到 1440~4096；Config timeout 300000）
│   │   ├── kimi-client.ts     # Kimi（Moonshot）官方 API 直连适配层（OpenAI 兼容 chat/completions，默认模型 kimi-k3，KIMI_MODEL/KIMI_BASE_URL 可覆盖；Key 解析 body > MOONSHOT_API_KEY > KIMI_API_KEY；Kimi K2.5+ 采样参数固定，一律用服务端默认值；理解环节统一入口：细读/统筹/策划/场景 DNA/文字质检）
│   │   ├── quota-server.ts    # 测试版限量配额（上限 50 张；/tmp/studio-quota.json 持久化 + 内存缓存 + writeChain 串行累加；达到上限 closed=true 全链路拒绝）
│   │   ├── client-api.ts      # 客户端：上传/分析/SSE 流式生成/下载/配额查询（fetchQuota）；analyze/generate 请求自动注入 kimiApiKey（选填，不填走内置免密模型；页面已移除密钥输入区，历史 localStorage 密钥仍兼容生效）
│   │   └── utils.ts           # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

## 业务上下文（AI 产品图工作台）

- 产品定位：电商（Amazon 风格）产品图批量生产流水线：上传产品图/背景氛围参考/排版海报参考/卖点/SKU → AI 解析风格与氛围（模仿味道而非抄袭）→ 人工可控出图计划 → 批量生成主图（2000×2000，5~7 张）与详情页图（1940×1200，3~7 张）→ 高清增强 → 按 `SKU_1.jpg` 连续编号交付。
- 生图尺寸约束：生图模型接受 2560x1440 ~ 4096x4096，先按 `2560x2560` / `2560x1584` 生成，再用 sharp `resize(fit: cover)` 精确缩放到电商规范尺寸。
- SSE 协议：`/api/generate` 返回 `text/event-stream`，事件类型见 `src/lib/studio-types.ts` 的 `GenerateEvent`；客户端用 `fetch + body.getReader()` 增量解析。
- 重试机制：生图失败自动重试一次；前端可对失败任务「重试失败项」并保留原编号（`filenameOverrides`）。
- 指令工作台（`/prompts`）：六大 AI 环节指令（总导演/场景DNA/策划师/文案补全/文字质检/版式规范）全部出自 `src/lib/prompt-registry.ts`；analyze 路由 buildInstruction/buildPlanInstruction/buildSceneDnaMessages/fillTitlesIfNeeded、studio-server checkRenderedText、studio-prompts getEditorialStandard 六个调用点均经 `getPromptText + fillTemplate` 实时读取。后台保存覆盖 → 下次 AI 调用即生效（实测 [OVR-OK] 标记贯通 AI 输出）；`{{变量}}` 占位符（如 {{upstreamIntel}}/{{plannerSlotRules}}）由调用点填充，编辑时删除占位符会丢失对应上下文。
- 环节间情报加详纪律：每个节点写给下一步的提示词宁满勿压——产品细读 details 80~150 字、产品理解 150~250 字、美术宪法 200~300 字、图位 focus 50~100 字/notes 80~150 字、画面 concept 100~150 字（按 ①构图②场景③光线④产品状态⑤卖点表达 逐层展开）、scenePrompt 200~350 字；抽象词必须换成具体视觉事实。

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**
