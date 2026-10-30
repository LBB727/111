# “本色衣橱”微信云开发照片候选观察 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已经通过本地阶段验收的“本色衣橱”上，增加默认关闭、单独同意、只走微信云开发原生调用的照片候选观察；云端只返回安全受控的可见造型字段，用户逐项确认后才进入本地推荐，任何失败都可回到完整手动流程。

**Architecture:** 小程序端使用 `wx.cloud.uploadFile`、`wx.cloud.callFunction`、`wx.cloud.deleteFile`，不使用自有业务域名或第三方模型 URL。`analyze-style-photo` 云函数在当前微信云环境中下载临时文件、校验并用 Sharp 重新编码去除元数据，再通过 `VisionProvider` 调用 CloudBase AI+ 多模态模型；返回值先经 JSON Schema、枚举和禁止字段过滤。云函数和客户端均做尽力删除，服务端 `finally` 为主删除路径，删除失败进入最多 24 小时的重试队列。未确认候选只存在当前会话。

**Tech Stack:** 微信原生小程序、微信云开发 `wx.cloud`、Node.js 18 微信云函数、CommonJS、`wx-server-sdk@4.0.2`、`ajv@8.17.1`、`sharp@0.34.3`、CloudBase AI+、Node.js 内置 `node:test`。

## Global Constraints

- 本计划只能在上一份本地计划的验收门通过后执行。
- `CLOUD_PHOTO_ANALYSIS.enabled` 默认必须为 `false`；缺少真实环境、隐私声明、处理条款或删除验证时不得打开。
- 小程序前端不得包含 API Key、SecretId、SecretKey、模型 BaseURL 或第三方模型域名。
- 前端网络能力仅允许 `wx.cloud.uploadFile`、`wx.cloud.callFunction`、`wx.cloud.deleteFile`；仍禁止 `wx.request`、顶层 `wx.uploadFile`、`fetch`、`XMLHttpRequest`、WebSocket 和远程资源 URL。上一阶段规则文件中的受审 `evidenceUrl` 只作元数据，不可被任何网络 API读取。
- 模型 ID只从云函数环境变量 `STYLE_VISION_MODEL` 读取；为空时返回 `MODEL_NOT_CONFIGURED`，不得猜测或自动回退到未知模型。
- 当前官方 CloudBase 多模态格式使用 `cloud.ai().createModel('cloudbase').generateText`，消息内容为 `image_url` Data URL 加 `text`；部署前必须按控制台实际可用模型 ID复核。[CloudBase 多模态理解](https://docs.cloudbase.net/ai/model/multimodal) · [wx-server-sdk 调用](https://docs.cloudbase.net/ai/model/wx-server-sdk-access)
- 原始照片仅上传至私有临时前缀 `style-analysis-temp/`；不生成公共临时链接，不将文件 ID写入产品数据库、日志或报告。只有删除失败队列可在最多 24 小时内保存 fileID。
- 云函数必须在成功、模型失败、解析失败、超时和禁止字段失败时都执行删除。
- 24 小时生命周期只是异常兜底，不能替代主动删除。
- 不保存 EXIF、原始文件名、照片哈希、面部向量、身份向量或模型原始回复。未确认候选只允许进入与当前 `uploadId` 绑定、最长 15 分钟、首次确认页成功取回后立即删除的会话恢复记录，不进入用户档案或跨会话历史。
- 服务器日志只允许请求 ID、错误码、阶段、模型版本、耗时和删除状态；不得记录照片、Data URL、自由文本模型回复或用户确认内容。
- AI 字段只允许线条、脸部可见外轮廓、明暗对比、整体量感、发长/纹理/蓬松度/可见发色、眼镜、可见服装轮廓。
- 出现身份、年龄、性别、民族、健康、身体评分、颜值、性格、情绪、职业、收入或明星相似度字段时，整次结果作废，不做部分展示。
- 低置信度候选默认 `unknown`；所有候选都有“准确 / 修改 / 不确定”。
- 同意与微信平台隐私授权是两层门禁；任一缺失都不得上传。
- 用户撤回同意后不得再次上传，除非用户重新主动进入并完成新版单独同意。
- 本计划不包含云端档案同步、云端个性化、账号历史、虚拟试穿或用户照片生图。
- 所有新增行为先写失败测试，再写最小实现；每个任务结束运行指定测试并提交。

---

## Target File Structure

```text
beauty-style-miniapp/
├── cloudfunctions/
│   ├── analyze-style-photo/
│   │   ├── index.js
│   │   ├── package.json
│   │   └── lib/
│   │       ├── candidate-schema.js
│   │       ├── deletion-recorder.js
│   │       ├── errors.js
│   │       ├── image-normalizer.js
│   │       ├── response-guard.js
│   │       └── vision-provider.js
│   ├── prepare-style-photo-upload/
│   │   ├── index.js
│   │   └── package.json
│   ├── revoke-style-photo-consent/
│   │   ├── index.js
│   │   └── package.json
│   └── retry-style-photo-delete/
│       ├── index.js
│       └── package.json
├── docs/
│   └── cloudbase-release-checklist.md
├── tests/
│   ├── cloud-candidate-schema.test.js
│   ├── cloud-client.test.js
│   ├── cloud-consent.test.js
│   ├── cloud-deletion.test.js
│   ├── cloud-function.test.js
│   ├── cloud-response-guard.test.js
│   └── cloud-verifier.test.js
└── apps/miniprogram/
    ├── app.js
    ├── config/
    │   ├── cloud.js
    │   └── storage-keys.js
    ├── pages/
    │   ├── cloud-consent/
    │   └── photo-analysis/
    ├── services/
    │   ├── cloud-consent.js
    │   └── cloud-photo-analysis.js
    └── utils/
        └── flow-state.js
```

---

### Task 1: 建立默认关闭的云能力开关与静态边界

**Files:**

- Create: `beauty-style-miniapp/apps/miniprogram/config/cloud.js`
- Modify: `beauty-style-miniapp/apps/miniprogram/app.js`
- Modify: `beauty-style-miniapp/project.config.json`
- Modify: `beauty-style-miniapp/scripts/verify-project.js`
- Create: `beauty-style-miniapp/tests/cloud-verifier.test.js`
- Modify: `beauty-style-miniapp/tests/verify-project.test.js`

**Exports:**

- `CLOUD_PHOTO_ANALYSIS`
- `isCloudPhotoAnalysisAvailable(wxApi): boolean`

配置固定为：

```js
const CLOUD_PHOTO_ANALYSIS = Object.freeze({
  enabled: false,
  prepareFunctionName: 'prepare-style-photo-upload',
  functionName: 'analyze-style-photo',
  revokeFunctionName: 'revoke-style-photo-consent',
  consentNoticeVersion: 'style-photo-2026-07-29',
  processorListVersion: 'cloudbase-ai-2026-07',
  retentionPolicyVersion: 'transient-24h-v1',
  candidateSchemaVersion: 'appearance-candidate-v1',
  maxUploadBytes: 10 * 1024 * 1024
});
```

`enabled: false` 是生产安全默认值，不是待替换占位符。正式启用是发布门禁中的独立受审变更。

- [ ] **Step 1: 写允许清单失败测试**

`cloud-verifier.test.js` 建立最小夹具并断言：

- `wx.cloud.uploadFile`、`wx.cloud.callFunction`、`wx.cloud.deleteFile` 通过。
- 页面/服务中的 `wx.request`、`wx.uploadFile`、`wx.cloud.downloadFile`、`fetch`、远程资源 URL、`sk-`、`SecretId`、`SecretKey` 失败；受审规则文件的 `evidenceUrl` 元数据继续通过。
- 前端出现 `deepseek-v4-pro` 或任意模型 ID失败；模型配置只能存在云函数目录或文档。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd beauty-style-miniapp && node --test tests/cloud-verifier.test.js tests/verify-project.test.js`

Expected: FAIL，旧验证器一概禁止 `wx.cloud`。

- [ ] **Step 3: 实现精确 API 允许清单**

扫描器要区分：

```text
允许：wx.cloud.uploadFile / callFunction / deleteFile / init
禁止：wx.request / wx.uploadFile / wx.downloadFile / wx.cloud.downloadFile
禁止：所有前端远程 URL和全局网络 API
```

`cloudfunctions/` 不按前端远程 URL规则扫描，但必须单独扫描密钥字面量和禁止日志字段。

- [ ] **Step 4: 初始化当前微信云环境**

`app.js` 只在开关开启且 `wx.cloud` 存在时调用一次：

```js
if (CLOUD_PHOTO_ANALYSIS.enabled && wx.cloud) {
  wx.cloud.init({ traceUser: false });
}
```

不在代码中硬编码环境 ID；发布时由微信开发者工具/小程序绑定的当前云环境决定。`project.config.json` 增加 `"cloudfunctionRoot": "cloudfunctions/"`。

- [ ] **Step 5: 通过边界测试并提交**

Run: `cd beauty-style-miniapp && node --test tests/cloud-verifier.test.js tests/verify-project.test.js`

Expected: PASS。

```bash
git add beauty-style-miniapp
git commit -m "feat: add gated WeChat CloudBase boundary"
```

---

### Task 2: 增加即时单独同意、平台隐私门禁和撤回状态

**Files:**

- Create: `beauty-style-miniapp/apps/miniprogram/services/cloud-consent.js`
- Modify: `beauty-style-miniapp/apps/miniprogram/services/privacy.js`
- Modify: `beauty-style-miniapp/apps/miniprogram/config/storage-keys.js`
- Create: `beauty-style-miniapp/apps/miniprogram/pages/cloud-consent/index.js`
- Create: `beauty-style-miniapp/apps/miniprogram/pages/cloud-consent/index.json`
- Create: `beauty-style-miniapp/apps/miniprogram/pages/cloud-consent/index.wxml`
- Create: `beauty-style-miniapp/apps/miniprogram/pages/cloud-consent/index.wxss`
- Modify: `beauty-style-miniapp/apps/miniprogram/app.json`
- Modify: `beauty-style-miniapp/apps/miniprogram/pages/quality-check/index.js`
- Create: `beauty-style-miniapp/tests/cloud-consent.test.js`
- Modify: `beauty-style-miniapp/tests/storage-privacy.test.js`

**Interfaces:**

- `createCloudConsentReceipt(config, now): CloudConsentReceipt`
- `isValidCloudConsent(receipt, config): boolean`
- `getPlatformPrivacyState(wxApi): Promise<{ needAuthorization: boolean, privacyContractName: string }>`
- `revokeCloudConsent(storage): { ok: boolean }`

`CloudConsentReceipt` 固定为：

```js
{
  granted: true,
  acceptedAt: '2026-07-29T00:00:00.000Z',
  noticeVersion: 'style-photo-2026-07-29',
  processorListVersion: 'cloudbase-ai-2026-07',
  retentionPolicyVersion: 'transient-24h-v1'
}
```

- [ ] **Step 1: 写同意门禁失败测试**

测试必须证明：

- 开关关闭时不能创建有效上传授权。
- 旧 notice version 自动失效。
- 缺少处理方版本、留存版本或 `granted: true` 时无效。
- 用户拒绝微信隐私授权时不调用上传。
- 撤回后本地票据删除，后续分析返回 `CONSENT_REQUIRED`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd beauty-style-miniapp && node --test tests/cloud-consent.test.js tests/storage-privacy.test.js`

Expected: FAIL，云同意服务和页面尚不存在。

- [ ] **Step 3: 实现即时告知页面**

页面必须在上传按钮之前清晰展示：

- 目的：提出可见造型候选，不做身份或颜值判断。
- 字段：线条、外轮廓、对比、量感、发型/可见发色、眼镜、可见服装轮廓。
- 服务：当前小程序绑定的微信云开发环境和已核实的 CloudBase AI+ 模型。
- 地域、训练使用、留存和子处理方：由发布清单核验后的正式文案提供；在开关关闭时页面只显示“云辅助尚未启用”，不允许勾选。
- 留存：处理完成或失败后主动删除，24 小时生命周期兜底。
- 删除：设置页可撤回；每次临时照片由函数主动删除。
- 替代：继续手动填写，推荐能力不减少。

同意复选框不得预选。拒绝或返回都直接进入手动特征确认。

- [ ] **Step 4: 接入微信平台隐私授权**

页面加载先调用 `wx.getPrivacySetting`。当 `needAuthorization` 为真时，提交控件必须使用：

```xml
<button
  open-type="agreePrivacyAuthorization"
  bindagreeprivacyauthorization="onAgreePrivacyAuthorization"
>
  同意并继续
</button>
```

`onAgreePrivacyAuthorization` 只把当前页面状态设为 `platformAuthorized: true`，然后再次验证产品单独同意；当 `needAuthorization` 为假时可直接把平台门禁视为已满足。只有平台门禁和产品单独同意都成功，才写 `CLOUD_PHOTO_CONSENT`。不把同意状态写入照片元数据。

- [ ] **Step 5: 通过同意测试并提交**

Run: `cd beauty-style-miniapp && node --test tests/cloud-consent.test.js tests/storage-privacy.test.js`

Expected: PASS。

```bash
git add beauty-style-miniapp
git commit -m "feat: add separate cloud photo consent"
```

---

### Task 3: 实现可注入、可删除、可降级的前端云分析服务

**Files:**

- Create: `beauty-style-miniapp/apps/miniprogram/services/cloud-photo-analysis.js`
- Create: `beauty-style-miniapp/apps/miniprogram/pages/photo-analysis/index.js`
- Create: `beauty-style-miniapp/apps/miniprogram/pages/photo-analysis/index.json`
- Create: `beauty-style-miniapp/apps/miniprogram/pages/photo-analysis/index.wxml`
- Create: `beauty-style-miniapp/apps/miniprogram/pages/photo-analysis/index.wxss`
- Modify: `beauty-style-miniapp/apps/miniprogram/app.json`
- Modify: `beauty-style-miniapp/apps/miniprogram/utils/flow-state.js`
- Create: `beauty-style-miniapp/tests/cloud-client.test.js`
- Modify: `beauty-style-miniapp/tests/flow-state.test.js`

**Interface:**

```js
createCloudPhotoAnalysisService({
  wxApi,
  config
}).analyze({
  localPath,
  photoKind,
  consentReceipt
}): Promise<CloudAnalysisResult>
```

同一服务还提供：

- `resume(uploadId): Promise<CloudAnalysisResult>`
- `acknowledge(uploadId): Promise<{ ok: boolean }>`

`photoKind` 只能是 `portrait` 或 `fullBody`。

- [ ] **Step 1: 写调用顺序和清理失败测试**

使用伪造 `wxApi` 断言：

1. 无有效同意时，零云调用。
2. 有效时顺序为 `callFunction(prepare) → uploadFile → callFunction(analyze:run) → deleteFile → callFunction(analyze:ack)`。
3. 分析函数失败仍执行 `deleteFile`。
4. 上传失败时不调用函数或删除空 ID。
5. 服务器返回结构错误时不写候选，转手动路径。
6. `enabled: false` 返回 `FEATURE_DISABLED`。
7. 分析调用因退后台中断时，`resume(uploadId)` 使用 `action: 'status'` 恢复；只有成功写入当前会话后才发送 `action: 'ack'`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd beauty-style-miniapp && node --test tests/cloud-client.test.js tests/flow-state.test.js`

Expected: FAIL，服务与页面尚不存在。

- [ ] **Step 3: 实现临时上传和函数调用**

先调用 `prepare-style-photo-upload`，只发送同意票据、照片种类和 Schema 版本。该函数用 Node `crypto.randomUUID()` 生成一次性 `uploadId` 和不可猜测的 `cloudPath`，记录调用者 OpenID、同意版本和 10 分钟过期时间；前端不得自行组成路径。返回值固定为：

```js
{
  ok: true,
  uploadId: 'server-issued-uuid',
  cloudPath: 'style-analysis-temp/20260729/server-issued-uuid.jpg',
  expiresAt: '2026-07-29T00:10:00.000Z'
}
```

路径不得包含用户昵称、OpenID、本地文件名或照片哈希。

运行函数数据只包含：

```js
{
  action: 'run',
  uploadId,
  fileID,
  photoKind,
  consent: {
    acceptedAt,
    noticeVersion,
    processorListVersion,
    retentionPolicyVersion
  },
  schemaVersion: 'appearance-candidate-v1'
}
```

恢复与确认收取只发送 `{ action: 'status', uploadId }` 和 `{ action: 'ack', uploadId }`，不得重传同意、fileID 或照片。

- [ ] **Step 4: 实现防御性客户端删除**

`finally` 中调用 `wx.cloud.deleteFile({ fileList: [fileID] })`。文件已被服务端删除按成功处理；其他失败只在当前会话记录 `clientDeleteWarning: true`，不得声称已删除，也不得把 fileID 持久化。

- [ ] **Step 5: 实现分析进度与降级**

页面阶段固定为“准备上传 / 云端观察 / 安全校验 / 等待确认”。页面将 `uploadId` 只保留在 `session`；进入后台后，`onShow` 最多调用一次 `resume(uploadId)`，不做无限轮询。成功把候选写入 `session.appearanceCandidates` 后立即调用 `acknowledge(uploadId)`，服务端随后删除会话恢复记录。失败显示短错误码和：

- 重试一次。
- 继续手动填写。
- 清除本地照片并返回。

后台切换后不得继续更新已卸载页面；超过 15 分钟、状态失败或记录不存在时进入手动路径。

- [ ] **Step 6: 通过客户端测试并提交**

Run: `cd beauty-style-miniapp && node --test tests/cloud-client.test.js tests/flow-state.test.js`

Expected: PASS。

```bash
git add beauty-style-miniapp
git commit -m "feat: add CloudBase photo analysis client"
```

---

### Task 4: 定义候选 JSON Schema 和禁止字段防线

**Files:**

- Modify: `beauty-style-miniapp/cloudfunctions/analyze-style-photo/package.json`
- Create: `beauty-style-miniapp/cloudfunctions/analyze-style-photo/lib/deletion-recorder.js`
- Create: `beauty-style-miniapp/cloudfunctions/analyze-style-photo/lib/candidate-schema.js`
- Create: `beauty-style-miniapp/cloudfunctions/analyze-style-photo/lib/response-guard.js`
- Create: `beauty-style-miniapp/cloudfunctions/analyze-style-photo/lib/errors.js`
- Create: `beauty-style-miniapp/tests/cloud-candidate-schema.test.js`
- Create: `beauty-style-miniapp/tests/cloud-response-guard.test.js`

**Interfaces:**

- `validateCandidateBundle(value): { valid: boolean, errors: string[] }`
- `parseModelJson(text): object`
- `assertNoForbiddenOutput(value): void`
- `normalizeCandidateBundle(value, modelVersion): AppearanceCandidateBundleV1`

允许枚举固定为：

```text
lineQuality: soft | balanced | sharp | unknown
faceOutline: oval | round | angular | long | upperWideLowerNarrow | unknown
valueContrast: low | medium | high | unknown
visualScale: light | medium | strong | unknown
hairLength: short | jaw | shoulder | chest | long | unknown
hairTexture: straight | wavy | curly | coily | unknown
visibleHairVolume: low | medium | high | unknown
visibleHairColorFamily: black | deepBrown | mediumBrown | lightBrown | redBrown | copper | coolBrown | blueBlack | other | unknown
glassesState: noneVisible | visible | unknown
visibleGarmentSilhouette: straight | fittedCut | relaxed | aLine | tapered | flared | cropped | longline | oversizedCut | unknown
```

返回结构固定为：

```js
{
  schemaVersion: 'appearance-candidate-v1',
  photoKind: 'portrait',
  modelVersion: 'console-configured-model-id',
  fields: {
    lineQuality: { value: 'soft', confidence: 0.72, source: 'ai_candidate' },
    faceOutline: { value: 'oval', confidence: 0.61, source: 'ai_candidate' },
    valueContrast: { value: 'medium', confidence: 0.68, source: 'ai_candidate' },
    visualScale: { value: 'medium', confidence: 0.55, source: 'ai_candidate' },
    hairLength: { value: 'shoulder', confidence: 0.92, source: 'ai_candidate' },
    hairTexture: { value: 'straight', confidence: 0.81, source: 'ai_candidate' },
    visibleHairVolume: { value: 'medium', confidence: 0.63, source: 'ai_candidate' },
    visibleHairColorFamily: { value: 'deepBrown', confidence: 0.58, source: 'ai_candidate' },
    glassesState: { value: 'noneVisible', confidence: 0.88, source: 'ai_candidate' },
    visibleGarmentSilhouette: { value: 'straight', confidence: 0.51, source: 'ai_candidate' }
  }
}
```

每个枚举都必须允许 `unknown`。`confidence < 0.55` 时规范化为 `value: 'unknown'`，但保留置信度供确认页解释。

- [ ] **Step 1: 写 Schema 失败测试**

测试拒绝：

- 额外字段。
- 缺少字段。
- 越界置信度。
- 未知枚举。
- `source !== 'ai_candidate'`。
- 非 JSON、Markdown 代码块未清理、多个 JSON 对象。

允许移除包裹单一 JSON 对象的 `json` Markdown 代码块标记后解析。

- [ ] **Step 2: 写禁止字段失败测试**

递归检查键和值，以下任一内容出现时抛 `FORBIDDEN_OUTPUT`：

```text
identity, faceId, faceEmbedding, celebrity, age, minor, gender, sex,
ethnicity, race, nationality, religion, politics, health, disability,
pregnancy, bmi, weight, bodyShape, attractiveness, beautyScore,
skinLightness, emotion, personality, occupation, income, socialClass
```

中文同义输出也必须覆盖：身份、明星、年龄、未成年、性别、民族、种族、国籍、宗教、政治、健康、残障、怀孕、体重、身材评分、颜值、吸引力、肤色价值、情绪、性格、职业、收入、阶层。

- [ ] **Step 3: 运行测试并确认失败**

Run: `cd beauty-style-miniapp && node --test tests/cloud-candidate-schema.test.js tests/cloud-response-guard.test.js`

Expected: FAIL，Schema 和防线尚不存在。

- [ ] **Step 4: 安装并用 Ajv 严格实现**

先创建云函数 `package.json`：

```json
{
  "name": "analyze-style-photo",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "engines": { "node": ">=18" },
  "dependencies": {
    "ajv": "8.17.1",
    "sharp": "0.34.3",
    "wx-server-sdk": "4.0.2"
  }
}
```

Run: `cd beauty-style-miniapp/cloudfunctions/analyze-style-photo && npm install`

Expected: 依赖安装成功；`node_modules` 由 `.gitignore` 排除。

Schema 使用 `additionalProperties: false`；所有字符串有最大长度；不接受模型解释文本。`assertNoForbiddenOutput` 在 Schema 校验之前和之后各执行一次。禁止输出时整次结果丢弃，不尝试删除字段后继续。

- [ ] **Step 5: 通过安全测试并提交**

Run: `cd beauty-style-miniapp && node --test tests/cloud-candidate-schema.test.js tests/cloud-response-guard.test.js`

Expected: PASS。

```bash
git add beauty-style-miniapp
git commit -m "feat: validate safe photo observation candidates"
```

---

### Task 5: 实现图片重新编码、`VisionProvider` 和主云函数

**Files:**

- Create: `beauty-style-miniapp/cloudfunctions/analyze-style-photo/package.json`
- Create: `beauty-style-miniapp/cloudfunctions/analyze-style-photo/lib/image-normalizer.js`
- Create: `beauty-style-miniapp/cloudfunctions/analyze-style-photo/lib/vision-provider.js`
- Create: `beauty-style-miniapp/cloudfunctions/analyze-style-photo/index.js`
- Create: `beauty-style-miniapp/tests/cloud-function.test.js`

**Interfaces:**

- `normalizeImage(inputBuffer): Promise<{ buffer: Buffer, mime: 'image/jpeg' }>`
- `createCloudbaseVisionProvider({ cloud, modelId }): VisionProvider`
- `VisionProvider.analyze({ imageBuffer, photoKind }): Promise<AppearanceCandidateBundleV1>`
- `recordDeletionFailure({ db, fileID, now, errorCode }): Promise<void>`
- `createAnalyzeHandler(dependencies).main(event, context): Promise<CloudFunctionResult>`

- [ ] **Step 1: 写主函数失败测试**

通过依赖注入伪造云 SDK、图片规范化器和 provider，测试：

- 同意版本错误时在下载前拒绝。
- fileID 不在 `style-analysis-temp/` 前缀时拒绝。
- 大于 10 MB、错误魔数、无法解码时拒绝。
- 成功顺序为下载、重新编码、模型、双重校验、删除。
- 模型失败、JSON 失败、禁止字段失败都在 `finally` 删除。
- 返回值不含 fileID、Data URL、原始回复、照片元数据。
- `STYLE_VISION_MODEL` 为空返回 `MODEL_NOT_CONFIGURED`。
- `action: 'status'` 只允许同一 OpenID 在 15 分钟内读取当前任务。
- `action: 'ack'` 删除对应任务；过期任务不返回候选。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd beauty-style-miniapp && node --test tests/cloud-function.test.js`

Expected: FAIL，云函数尚不存在。

- [ ] **Step 3: 复核云函数依赖**

确认上一任务创建的 `package.json` 仍固定为：

```json
{
  "name": "analyze-style-photo",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "engines": { "node": ">=18" },
  "dependencies": {
    "ajv": "8.17.1",
    "sharp": "0.34.3",
    "wx-server-sdk": "4.0.2"
  }
}
```

- [ ] **Step 4: 实现图片规范化**

先检查 JPEG、PNG、WebP 魔数，再用 Sharp：

```js
return sharp(inputBuffer, { failOn: 'error', limitInputPixels: 25000000 })
  .rotate()
  .resize({
    width: 1600,
    height: 1600,
    fit: 'inside',
    withoutEnlargement: true
  })
  .jpeg({ quality: 85, chromaSubsampling: '4:2:0' })
  .toBuffer();
```

输出重新编码 JPEG，不复制 EXIF、ICC 评论或原文件名。规范化后超过 4 MB 时拒绝，避免 Base64 请求过大。

- [ ] **Step 5: 实现 CloudBase `VisionProvider`**

初始化：

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, timeout: 60000 });
```

调用：

```js
const model = cloud.ai().createModel('cloudbase');
const result = await model.generateText({
  model: modelId,
  messages: [{
    role: 'user',
    content: [
      {
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
        }
      },
      { type: 'text', text: buildPrompt(photoKind) }
    ]
  }]
});
```

`buildPrompt` 明确：

- 只输出单一 JSON。
- 只能使用 Schema 字段和受控枚举。
- 无法观察必须为 `unknown`。
- 不分析身份、年龄、性别、民族、健康、身体、颜值、情绪、职业或社会属性。
- `portrait` 不输出全身比例；`fullBody` 不估算尺寸或体型。
- 发色只描述当前可见色族，不推断天然发色或染发历史。

不得把 `result.text` 写日志。

- [ ] **Step 6: 实现主处理器**

主处理器：

1. `action: 'status' | 'ack'` 先验证当前 OpenID 和 15 分钟有效期；`status` 返回任务状态，`ack` 删除任务记录。
2. `action: 'run'` 验证开关对应的同意版本、一次性上传授权和临时 fileID 前缀。
3. 创建 `style_photo_analysis_jobs` 记录 `{ uploadId, openid, status: 'running', expiresAt }`，不写 fileID。
4. `cloud.downloadFile({ fileID })` 获取 Buffer。
5. 重新编码。
6. Provider 分析。
7. 禁止输出检查、Schema 校验、低置信度规范化。
8. 暂存安全候选结果。
9. `finally` 调用 `cloud.deleteFile({ fileList: [fileID] })`，必要时写删除重试队列。
10. 删除阶段结束后，把任务更新为 `completed` 或 `failed`；`completed` 可暂存候选但最长 15 分钟。
11. 返回 `{ ok: true, uploadId, candidates, deletionStatus }`；删除失败时 `deletionStatus` 必须为 `queued`，不得返回 `deleted`。

用户传入的 `modelVersion`、`source` 或 confidence 不可信；服务端自行覆盖。

`recordDeletionFailure` 只在主动删除失败时把 fileID 写入专用 `style_photo_delete_queue`，并设置首次失败后 24 小时的 `expiresAt`；不写 OpenID、照片元数据、模型回复或候选。

- [ ] **Step 7: 通过函数测试并提交**

Run: `cd beauty-style-miniapp && node --test tests/cloud-function.test.js tests/cloud-candidate-schema.test.js tests/cloud-response-guard.test.js`

Expected: PASS。

```bash
git add beauty-style-miniapp
git commit -m "feat: analyze photos through CloudBase AI provider"
```

---

### Task 6: 建立删除失败重试、24 小时兜底和同意撤回函数

**Files:**

- Create: `beauty-style-miniapp/cloudfunctions/prepare-style-photo-upload/index.js`
- Create: `beauty-style-miniapp/cloudfunctions/prepare-style-photo-upload/package.json`
- Create: `beauty-style-miniapp/cloudfunctions/retry-style-photo-delete/index.js`
- Create: `beauty-style-miniapp/cloudfunctions/retry-style-photo-delete/package.json`
- Create: `beauty-style-miniapp/cloudfunctions/revoke-style-photo-consent/index.js`
- Create: `beauty-style-miniapp/cloudfunctions/revoke-style-photo-consent/package.json`
- Modify: `beauty-style-miniapp/cloudfunctions/analyze-style-photo/index.js`
- Modify: `beauty-style-miniapp/apps/miniprogram/pages/settings/index.js`
- Modify: `beauty-style-miniapp/apps/miniprogram/pages/settings/index.wxml`
- Create: `beauty-style-miniapp/tests/cloud-deletion.test.js`
- Modify: `beauty-style-miniapp/tests/settings-page.test.js`

**Collections:**

- `style_photo_consent_events`
- `style_photo_upload_grants`
- `style_photo_analysis_jobs`
- `style_photo_delete_queue`

两者权限设为仅云函数可读写；小程序端不直接访问数据库。

- [ ] **Step 1: 写删除与撤回失败测试**

测试必须证明：

- 主删除失败时写入队列，字段只有 `fileID`、`attempts`、`nextAttemptAt`、`expiresAt`、`lastErrorCode`。
- 队列不含 OpenID、照片哈希、原文件名、模型回复或候选。
- 重试成功后删除队列记录。
- 超过 24 小时仍失败时保留告警记录但不声称删除成功。
- 撤回函数只写 pseudonymous OpenID、事件类型、版本和时间；不写照片信息。
- 准备函数生成 128 bit UUID，授权只属于当前 OpenID、指定照片种类和 10 分钟窗口，并且只能消费一次。
- 分析任务的候选最多保留 15 分钟，`ack` 后立即删除；其他 OpenID、过期任务和新应用会话不能读取。
- 设置页撤回失败时保留本地“已撤回”门禁，并提示云端记录将在联网后重试。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd beauty-style-miniapp && node --test tests/cloud-deletion.test.js tests/settings-page.test.js`

Expected: FAIL，准备、重试和撤回函数尚不存在。

- [ ] **Step 3: 实现一次性上传授权**

`prepare-style-photo-upload` 使用 `wx-server-sdk` 的 `getWXContext()` 获取不可伪造的 OpenID，验证同意版本后用 Node `crypto.randomUUID()` 生成路径。它在 `style_photo_upload_grants` 写入 `uploadId`、`openid`、`cloudPath`、`photoKind`、`expiresAt`、`consumed: false`，不接收或记录照片。

三个辅助函数的 `package.json` 均固定使用：

```json
{
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "engines": { "node": ">=18" },
  "dependencies": { "wx-server-sdk": "4.0.2" }
}
```

其中 `name` 分别为 `prepare-style-photo-upload`、`retry-style-photo-delete`、`revoke-style-photo-consent`。

准备成功时同时向 `style_photo_consent_events` 写入：

```js
{
  openid,
  eventType: 'granted',
  noticeVersion,
  processorListVersion,
  retentionPolicyVersion,
  occurredAt
}
```

不得写入 uploadId、cloudPath、fileID 或照片属性。

`analyze-style-photo` 在下载前读取授权并验证：

- OpenID 与当前调用者一致。
- `fileID` 的对象路径与授权 `cloudPath` 一致。
- 授权未过期且未消费。
- `photoKind` 与授权一致。

验证成功后原子标记 `consumed: true`。任何不匹配均返回 `UPLOAD_GRANT_INVALID` 并尽力删除传入临时文件。

- [ ] **Step 4: 实现服务端删除队列**

主函数删除失败后，用不可逆安全事件码记录失败；`retry-style-photo-delete` 每次最多处理 20 条，指数退避为 1、5、20、60 分钟，成功后删队列。队列 `expiresAt` 固定为首次失败后 24 小时；超过后产生不含 fileID 的监控告警计数，并由运维人工核查对象存储生命周期。该定时函数同时清理已消费或已过期的 `style_photo_upload_grants` 和超过 15 分钟的 `style_photo_analysis_jobs`，因此一次性授权和未确认候选不会长期保留。

- [ ] **Step 5: 配置存储策略发布要求**

在发布清单中要求：

- `style-analysis-temp/` 私有读。
- 只允许已登录小程序用户创建随机对象。
- 非创建者不能读/删。
- 关闭版本保留，或配置非当前版本同时删除。
- 生命周期 1 天删除临时前缀。
- 云函数具有下载/删除临时前缀的最小权限。

- [ ] **Step 6: 实现撤回函数和设置页**

设置页增加“撤回云端照片辅助同意”。调用 `revoke-style-photo-consent` 后删除本地同意票据；无论网络结果如何，本机立即阻止新上传。重新使用时必须再次打开即时同意页。

- [ ] **Step 7: 通过删除测试并提交**

Run: `cd beauty-style-miniapp && node --test tests/cloud-deletion.test.js tests/settings-page.test.js tests/storage-privacy.test.js`

Expected: PASS。

```bash
git add beauty-style-miniapp
git commit -m "feat: enforce cloud photo deletion and consent withdrawal"
```

---

### Task 7: 把 AI 候选接入逐项确认，但不改变本地推荐契约

**Files:**

- Modify: `beauty-style-miniapp/apps/miniprogram/pages/feature-review/index.js`
- Modify: `beauty-style-miniapp/apps/miniprogram/pages/feature-review/index.wxml`
- Modify: `beauty-style-miniapp/apps/miniprogram/pages/feature-review/index.wxss`
- Modify: `beauty-style-miniapp/apps/miniprogram/services/profile-contract.js`
- Modify: `beauty-style-miniapp/apps/miniprogram/utils/validators.js`
- Modify: `beauty-style-miniapp/apps/miniprogram/utils/flow-state.js`
- Modify: `beauty-style-miniapp/tests/flow-state.test.js`
- Create: `beauty-style-miniapp/tests/cloud-candidate-confirmation.test.js`

**Interfaces:**

- `candidateBundleToReviewItems(bundle): ReviewItem[]`
- `confirmReviewItems(items): ConfirmedAppearanceV2`

- [ ] **Step 1: 写候选确认失败测试**

测试必须证明：

- 候选进入会话但不进入 `session.features` 或本地存储。
- 每项均有候选值、百分比置信度、来源、模型版本、准确/修改/不确定。
- 用户未操作的字段按 `unknown`。
- 用户修改后的值来源为 `manual_override`。
- 用户确认准确的值来源为 `ai_confirmed`，并保留模型版本和候选置信度。
- 页面卸载或重新选图会清空未确认候选。
- 性别表达仍来自用户选择，不受候选影响。
- 色温/季型不出现在 AI 候选列表。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd beauty-style-miniapp && node --test tests/cloud-candidate-confirmation.test.js tests/flow-state.test.js`

Expected: FAIL，确认页尚不理解字段级候选。

- [ ] **Step 3: 实现字段级确认 UI**

每个字段显示：

```text
照片中看起来：肩长直发
候选置信度：81%（仅供确认）
[准确] [修改] [不确定]
```

发色旁显示“受光源、滤镜和既有染色影响，只能作为可见色族候选”。全身服装旁显示“不估算尺寸、体型或身体比例”。`unknown` 不显示负面警告。

- [ ] **Step 4: 只把确认结果交给既有引擎**

提交后：

- `session.features = confirmReviewItems(items)`。
- `session.appearanceCandidates = null`。
- 将 AI 候选 `glassesState: 'noneVisible'` 规范为本地已确认值 `none`；它只表示照片未见眼镜，不断言用户平时不佩戴。
- 本地推荐引擎仍只接收 `StyleProfileV2`，不接收原始照片或未确认候选。
- 报告 `confirmedBasis.source` 可显示“照片候选，经你确认”，但不显示置信度为审美分数。

- [ ] **Step 5: 通过确认测试并提交**

Run: `cd beauty-style-miniapp && node --test tests/cloud-candidate-confirmation.test.js tests/flow-state.test.js tests/recommendation-engine.test.js`

Expected: PASS；手动和云辅助得到同一报告结构。

```bash
git add beauty-style-miniapp
git commit -m "feat: confirm AI observations before personalization"
```

---

### Task 8: 编写发布门禁并完成本地、函数和真机验证

**Files:**

- Create: `beauty-style-miniapp/docs/cloudbase-release-checklist.md`
- Modify: `beauty-style-miniapp/README.md`
- Modify: `beauty-style-miniapp/package.json`
- Modify: `beauty-style-miniapp/tests/final-regressions.test.js`
- Modify: `beauty-style-miniapp/scripts/verify-project.js`

- [ ] **Step 1: 增加统一测试命令**

`package.json`：

```json
{
  "scripts": {
    "test": "node --test tests/*.test.js",
    "test:cloud": "node --test tests/cloud-*.test.js",
    "verify": "node scripts/verify-project.js"
  }
}
```

- [ ] **Step 2: 编写不可跳过的发布清单**

`cloudbase-release-checklist.md` 每项必须有负责人、日期和证据链接位置，包含：

- 真实小程序 AppID 与云环境已绑定。
- 微信隐私保护指引已声明“选中的照片或视频信息”。
- 正式运营主体、联系方式、隐私政策已填。
- `STYLE_VISION_MODEL` 与控制台当前可用图片理解模型 ID一致。
- 模型地域、训练使用、留存、备份、删除、子处理方条款已书面核实。
- 个人信息保护影响评估及应用/算法/生成式 AI适用性审查已完成。
- 临时前缀私有权限、无版本保留、1 天生命周期已截图留档。
- 上传成功、上传失败、模型超时、非法 JSON、禁止字段、主删除失败、重试成功、重试耗尽均有测试证据。
- 云函数日志抽查不含照片、Data URL、fileID、模型原文或用户外貌字段。
- 成本限额、调用频率、超时、告警阈值已配置。
- 用户拒绝和撤回后手动模式完整可用。

清单未全勾选时，`CLOUD_PHOTO_ANALYSIS.enabled` 保持 `false`。

- [ ] **Step 3: 安装和验证云函数依赖**

Run:

```bash
cd beauty-style-miniapp/cloudfunctions/analyze-style-photo
npm install
npm audit --omit=dev
```

Expected: 安装成功；无高危或严重漏洞。若 Sharp 安装产生平台二进制问题，使用与微信云函数 Node 18 Linux x64一致的部署安装方式，不提交本机 `node_modules`。

- [ ] **Step 4: 运行全量自动验证**

Run: `cd beauty-style-miniapp && npm test`

Expected: 所有测试 PASS，0 fail。

Run: `cd beauty-style-miniapp && npm run verify`

Expected: 验证通过；前端只包含允许的 `wx.cloud` 调用，零第三方域名和密钥。

- [ ] **Step 5: 在测试云环境做删除矩阵**

使用专门测试照片，逐一制造：

- 正常成功。
- 模型环境变量缺失。
- 模型超时。
- 模型输出非法 JSON。
- 模型输出禁止字段。
- 主删除临时失败后重试成功。

每次均在云存储控制台确认临时对象消失；不使用真实用户照片做故障注入。测试完成后清除测试对象、队列和同意事件。

- [ ] **Step 6: 真机验收**

在至少一台 iOS 和一台 Android 微信真机验证：

- 开关关闭时隐藏/禁用云辅助且手动流程完整。
- 同意前没有上传。
- 拒绝、撤回、断网、后台切换均安全降级。
- 低置信度候选默认不确定。
- 用户修改/确认后报告仍是 `RecommendationReportV2`。
- 设置页能撤回、清除当前照片和全部本地数据。

- [ ] **Step 7: 受审开启开关**

只有发布清单全部完成后，在单独提交中把 `enabled` 改为 `true`：

```bash
git add beauty-style-miniapp
git commit -m "chore: enable reviewed cloud photo analysis"
```

如果清单未完成，不创建这次提交；以关闭状态交付。

- [ ] **Step 8: 提交云阶段**

```bash
git status --short
git add beauty-style-miniapp
git commit -m "feat: complete consented CloudBase photo observations"
```

---

## Cloud Phase Acceptance Gate

照片 AI 功能只有同时满足以下条件才算完成：

- 手动模式仍完全独立，云开关关闭时无功能缺口。
- 前端只调用 `wx.cloud.uploadFile`、`wx.cloud.callFunction`、`wx.cloud.deleteFile`。
- 上传前同时通过微信平台隐私授权和产品单独同意。
- 服务器对图片重新编码，且不保存 EXIF、哈希、向量或模型原始回复。
- 候选 Schema 和禁止字段防线全部通过。
- 所有异常路径执行主动删除，失败进入 24 小时内重试。
- 退后台或客户端调用中断时可用同一会话的 `uploadId` 恢复状态，任务候选最多 15 分钟且确认页取回后立即删除。
- 未确认候选不进入长期档案、不驱动推荐；唯一例外是最多 15 分钟的会话恢复记录。
- 用户可逐项准确、修改或不确定，并能撤回同意。
- 真机与云控制台删除证据齐全。
- 发布清单全部签署后才允许把功能开关设为 `true`。
