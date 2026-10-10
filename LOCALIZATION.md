# 汉化约定

本次检查游戏页、96 个项目的标题／说明／成本、动态终端消息、策略选择、探测器与战斗、两条结局及重新读档后的显示。内部变量、项目 ID、策略名称、数组顺序、计算公式及存档字段不翻译。

## 术语

优先延续原中文版；明显误译或同一概念的多种叫法统一如下。社区版本的译法并不完全一致，数值和规则以本项目原版代码为准。

| 原文 | 本版显示 |
| --- | --- |
| Operations / ops | 操作点数 |
| Memory / Processors / Trust | 内存／处理器／信任 |
| Creativity | 创造力 |
| Harvester Drone / Wire Drone | 采集无人机／线材无人机 |
| Swarm Computing | 群体运算 |
| WireBuyer | 自动买丝器 |
| Revenue Tracker | 收入追踪器 |
| HypnoDrone | 催眠无人机 |
| Von Neumann Probe | 冯·诺依曼探测器 |
| Value Drift / Drifters | 价值漂移／漂流者 |
| Honor / Threnody | 荣誉／英雄挽歌 |
| OODA Loop | OODA 循环 |
| Strategic Attachment | 策略依附 |
| Hadwiger Problem / Tóth Sausage Conjecture | 哈德维格问题／托特香肠猜想（Tóth） |
| RANDOM / GREEDY / GENEROUS | 随机／贪婪／慷慨 |
| MINIMAX / TIT FOR TAT / BEAT LAST | 最小最大／针锋相对／击败上轮 |

参考原中文版 [g1tyx/paperclips](https://github.com/g1tyx/paperclips)、社区百科的[游戏阶段](https://wiki.biligame.com/universalpaperclips/游戏阶段)与[战斗](https://wiki.biligame.com/universalpaperclips/战斗)，并对照[另一中文版的项目文本](https://github.com/zhang-astronaut/paperclips-zh/blob/main/public/projects.js)。没有引入其他版本的游戏引擎、价格或解锁规则。

## 有意保留的原文

- 数字、数量级（million、trillion、oct 等）、单位（MWs、MW-seconds 等）及 A／B 选项保留原版表达。
- Yomi、OODA、A100、B100、Xavier、Tóth 保留便于辨认的拼写。
- 游戏名称副标题、作者与音乐署名、作品名称保留英文。
- 终端中的诗句与作者引语保留原文：项目 6、14、15、17、19、121、125、128、131、132、134、218。它们不是遗漏的功能说明。
- 常见战役名使用中文，如滑铁卢、奥斯特利茨、博罗金诺。较少见且译法不统一的专名保留原拼写：Haslach-Jungingen、Kaihona、Kolberg、Maria、Medina de Rioseco、Millesimo、Novi、Raszyn、Rolica、La Rothiere、Schongrabern、Tamames、Valmaseda、Valutino、Vauchamps。未知的存档名称也原样显示。

## 旧存档

存档仍为版本 1，原六个键保持不变。历史英文战役名与挽歌名称通过 `localizeBattleName()` 在渲染时转换，不改写存档中的名称或编号。策略下拉框对新解锁和重新读档使用同一译名，保存的策略索引与原生英文标识保持不变。

`npm test` 检查全部项目显示文本的明确英文例外、历史名称的数据往返，以及策略新解锁／读档的一致性；浏览器检查另外覆盖三个阶段与结局中的实际显示。
