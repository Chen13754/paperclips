# 环球回形针：文件存档版

游戏地址：**https://chen13754.github.io/paperclips/index2.html**

在现有中文版上增加「导出存档」「导入存档」，手机和电脑通过手动传输 JSON 文件接力游玩。无需安装插件，没有同步后台或存档上传服务。

## 使用

1. 在当前设备点击「导出存档」，下载 `paperclips-YYYY-MM-DD_HH-mm-ss.json`。
2. 通过聊天工具、数据线等方式把文件传到另一台设备。
3. 在另一台设备打开同一游戏网址，点击「导入存档」，选择文件，核对保存时间并确认。

导出会先保存点击时的进度，包含项目、策略、股票、量子芯片及周目信息。文件名使用设备当地时间，内部 `exportedAt` 使用 UTC ISO 时间。请保持设备时钟准确，按时间选择要继续的存档；不会自动合并两个设备的进度。

原游戏每约 25 秒自动保存到本浏览器，此行为保留。网页无法在关闭后持续运行游戏，也不会自动读取另一台设备的存档。

读档沿用原版流程：正在进行的锦标赛会重置，战斗列表会按原版 `refresh()` 清理；已经获得的资源、研究与周目正常恢复。

导入会覆盖当前浏览器的进度；想保留当前进度时，先导出一份。无效文件或取消导入不会写入存档。写入失败时会恢复已经改动的存档键；如果浏览器连恢复写入也拒绝，请不要刷新或关闭游戏，并按页面提示处理。

## 迁移原网址的进度

打开游戏顶部的「原网页进度迁移」，或访问：

https://chen13754.github.io/paperclips/migrate.html

帮助页提供电脑控制台脚本与安卓脚本书签步骤。脚本从本项目加载导出工具，在原游戏页面下载相同格式的文件，不删除原存档。需要网络读取静态脚本，但不会传输任何游戏进度。

不要清除原浏览器的数据，直到确认新版中的进度正确。脚本书签受具体浏览器支持限制；手机尺寸模拟不等同于安卓实机验证。

## 本地检查

使用已有 Node.js，无运行时依赖。测试依赖、缓存和浏览器测试文件均放在项目目录中：

```powershell
npm ci --cache .cache/npm --no-audit --no-fund
npm test
npm run test:browser
```

浏览器测试使用电脑已安装的 Microsoft Edge，或通过 `PAPERCLIPS_BROWSER` 指定 Chromium 浏览器可执行文件，不下载浏览器。测试仅使用临时浏览器配置和临时本地预览服务，结束后关闭。GitHub Actions 仅发布网页资源，不发布测试文件、依赖、缓存或个人存档。

## 存档格式

版本 1 使用 `{format: "paperclips-save", version: 1, exportedAt, storage}`。`storage` 保存原生 JSON 字符串：`saveGame`、`saveProjectsUses`、`saveProjectsFlags`、`saveProjectsActive`、`saveStratsActive` 和 `savePrestige`。没有周目信息时，`savePrestige` 为 `null`，导入时清除目标设备旧的周目信息。

## 来源与署名

- 原作：Frank Lantz，[Universal Paperclips](https://www.decisionproblem.com/paperclips/)。
- 本项目基于 [g1tyx/paperclips](https://github.com/g1tyx/paperclips)，起始提交 `f4b33a93082a2c1ef5678353486428cf21506e9c`。
- 原中文版 README：汉化版 http://likexia.gitee.io/paperclips ，英文版 http://www.decisionproblem.com/paperclips/index2.html 。

保留原版玩法、原有资源和署名；本项目的主要修改是文件存档、迁移帮助，以及取消手机窄屏遮挡。
