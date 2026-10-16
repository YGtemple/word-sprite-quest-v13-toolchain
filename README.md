# 单词精灵闯关 v1.3 · 配置与构建工具链

> 一句话简介：CONTRACT v1.3 的完整配置数据与构建门禁——240 关主线 + 15 街机关卡 + 元留存层配置 + 50 项自动检查。

这是 [word-sprite-quest](https://github.com/YGtemple/word-sprite-quest) 的 **v1.3 数据与工具层**。

和已有的 [word-sprite-quest-tooling](https://github.com/YGtemple/word-sprite-quest-tooling)（v1.2 工具链）的关系：

| | v1.2 tooling | 本仓库（v1.3） |
|---|---|---|
| 契约版本 | CONTRACT v1.2 | CONTRACT v1.3 |
| 游戏模式 | 4 档 | **5 档**（新增 `arcade`） |
| 玩法类型 | 15 种 | **18 种**（新增 Ball/Runner/Idle） |
| 元留存层 | 无 | **完整**（体力/道具/每日任务/排行榜） |
| 构建脚本 | 无 | **build.js**（758 行，14 模块） |
| 红线 | R4–R9 | R4–**R10** |

v1.3 是 v1.2 的**结构性扩展**，不是小改。契约里写着「旧 v1/v1.1/v1.2 缓存一律作废」——所以两块工具链并存但各自对应一个契约版本。

## 一、v1.3 加了什么

### 1. arcade 第五档模式

《街机纯玩》：**娱乐 95%+，单词仅作皮肤/主题，不考记忆**。

这一档的设计意图写在契约里：**防流失**。原来的「轻松摸鱼」档虽然娱乐为主，但仍然要答题。而 arcade 档是纯粹的游戏——弹球、跑酷、放置，单词只是砖块上的色块、障碍物的轮廓。

数据上最直接的体现是 `wordCount: 0`。15 个街机关卡，每关的题数都是 0：

```json
{
  "id": "arcade_ball_01",
  "gameplayType": "Ball",
  "mode": "arcade",
  "wordCount": 0,
  "staminaCost": 0,
  "description": "砖块印单词色块，不要求识读"
}
```

三种玩法各 5 关：

| 玩法 | 关卡 | 时长期望 | 通关目标 |
|---|---|---|---|
| Ball 精灵弹球 | 入门/初级/进阶/挑战/无尽 | 90-120s | 1000→5000 分 |
| Runner 无尽跑酷 | 入门/初级/进阶/挑战/无尽 | 60-90s | 500→3000 分 |
| Idle 放置合成 | 入门/初级/进阶/挑战/无尽 | 120-180s | 10→50 次合成 |

### 2. 元留存层（契约 §11）

四份新配置，全部有校验器盯着：

| 配置文件 | 内容 | 校验重点 |
|---|---|---|
| `stamina_config.json` | 体力系统 | **R10 五条红线** |
| `props_config.json` | 5 类道具 | 非付费墙、三档掉率 |
| `daily_tasks.json` | 每日任务 + 7 日日历 + 排行榜 | 天数连续性、第 7 日稀有 |
| `arcade_levels.json` | 15 街机关卡 | wordCount=0、全免费 |

### 3. R10 体力宽松红线（v1.3 新增）

这是我认为整个契约里最特别的一条：

> **体力系统必须"宽松"，不得因体力稀缺导致用户流失。** ①自然恢复速率远高于行业（≈每 2-3 分钟回 1 点）；②多免费获取渠道，无付费墙；③**0 体力兜底**：体力=0 时须提供"看广告免费玩一局"通道，**永不硬阻塞**核心入口；④新手前 7 日近乎无限体力；⑤**禁止**"体力不足即锁死入口、必须付费才能继续"。

它被完整翻译成了配置数据：

```json
{
  "maxStamina": 50,
  "recoveryRate": { "pointsPerInterval": 1, "intervalMinutes": 2 },
  "freeSources": [ /* 6 个渠道：登录/广告/升级/宠物/连闯/好友 */ ],
  "zeroStaminaFallback": {
    "enabled": true,
    "method": "ad_revive_free_play",
    "description": "体力=0 时提供看广告免费玩一局入口，永不硬阻塞（R10）"
  },
  "newbieProtection": { "first7DaysUnlimited": true },
  "staminaCostByMode": { "casual": 0, "arcade": 0, "campaign": 1, "bootcamp": 1, "pvp": 0 },
  "redLine": "R10: 禁止体力不足即锁死入口、强制付费才能继续。0 体力须有看广告免费玩通道。"
}
```

注意 `staminaCostByMode` 里 `casual` 和 `arcade` 都是 **0**——娱乐向玩法不该被体力卡住。这是把产品意图编码进配置，而不是散在代码各处的 `if`。

最后那个 `redLine` 字段看起来像形式主义，但它是唯一能**自动验证「这条约束还被记得」**的手段。`validate_meta.js` 专门有一项检查它是否存在。

## 二、构建门禁（build.js）

758 行，14 个检查模块，分两层：

```
前 9 个模块 ── 查配置（不需要 Cocos 工程，秒级）
后 5 个模块 ── 查工程 + 实际构建（需 --project= 指定）
```

这样设计的好处：CI 里可以先跑 `--skip-build` 做轻量门禁，只在真正打包时才读 Cocos 工程。

### 几个把红线变成断言的检查

**R5 image_tag 一致性**：遍历 8 章词库，每个 `image_tag` 必须等于 `makeImageTag(word)`。不一致意味着生图文件名对不上，上线必裂图。人肉检查 80 个词不现实。

**R9 coin 来源覆盖**：检查 `pet_config.json` 的 `ResourcePool.coin.sources` 是否包含 `casual + campaign + bootcamp + arcade` 四个模式。R9 说「所有模式必须写入同一 ResourcePool」——这条检查把 R9 直接翻译成了可执行断言。

**wordCount=0（模块 9）**：街机关卡必须 `wordCount === 0`。这条验的不是技术约束，是 §4.1 的产品设计「单词仅作皮肤，不考记忆」。**产品意图能被机器验证，才不会在迭代中被悄悄改掉。**

**R7 双平台隔离（模块 12）**：递归扫 `scripts` 下所有 `.ts`，遇到 `PlatformAdapter.ts` 就跳过（它是唯一允许出现 `wx`/`tt` 的文件），其余文件出现 `\bwx\.` 或 `\btt\.` 就累计违规。

**R6 跨分包引用（模块 11）**：扫四个主包脚本目录，匹配 `subpackages/chN` 引用。主包引用分包纹理会直接导致构建失败。

### 一处保留的纠错痕迹

`checkPlatformConfig()` 里原本写的是：

```js
const oldModes = levels.filter(l => ['study', 'arcade', 'hybrid'].includes(l.mode));
```

但 v1.3 里 `arcade` 已经是合法 mode 了。所以改成：

```js
// 注意：v1.3 中 arcade 是合法 mode，不是旧值。
// 这里曾误把 arcade 归入旧值集合，已修正。
const trulyOld = levels.filter(l => ['study', 'hybrid'].includes(l.mode));
```

注释里保留了「曾误把 arcade 归入旧值」这句说明。不删痕迹，是因为下次改契约的人需要知道这个坑踩过。

## 三、schema 是唯一事实来源

`config/schema_v1_3.js`（349 行）被四个脚本共同 `require`：

```
                    ┌─ build.js               (构建门禁)
schema_v1_3.js ─────┼─ validate_meta.js       (元留存层校验)
                    ├─ validate_levels_v1_3.js (关卡校验)
                    └─ generate_levels_v1_3.js (关卡生成)
```

改契约只改这一个文件，四个脚本同时生效——避免常量散在各脚本里、改一处漏三处。

它导出的关键内容：

```js
LevelType      // 18 种玩法
GameMode       // 5 档模式
PropType       // 5 类道具
LevelDataFields // 按 v1 / v1.1 / v1.2 / v1.3 四段分开列

expectOptionCount()   // 量化曲线：全局序号 → 选项数 3/4/5/6
expectTimeLimit()     // → 限时 25/20/15/12 秒
expectWordFreqBand()  // → 词频带 high/mid/low

META = {
  staminaRecoveryMaxMinutes: 5,   // R10 红线数值
  staminaFreeSourcesMin: 3,
  newbieProtectionDays: 7,
  dailyTasksMin: 3,
  loginCalendarCycle: 7,
  asyncBoardsMin: 3,
  propTypeCount: 5,
}

canUsePicture()  // §8 高阶去卡通图
makeImageTag()   // R5 sanitize
isFreeMode()     // casual/arcade 不耗体力
```

`META` 常量收拢了 R10 的所有阈值数字。这些数字原本散在契约文档里，现在变成校验器可以引用的常量。

`LevelDataFields` 按版本分段这个设计我很喜欢——**看 schema 就能读出契约的演进史**：

```js
v1:   [chapter, index, gameplayType, ...]           // 基础
v11:  [actionIntensity, wordCount, ...]             // 增加难度维度
v12:  [mode, mixedTypes]                            // 模式族与题型序列
v13:  [staminaCost, propRewards, allowAdRevive]     // 元留存层
```

## 四、文件结构

```
├── README.md
├── config/
│   ├── schema_v1_3.js              # 唯一事实来源（349 行）
│   ├── schema_v1_3.ts              # TS 声明版
│   ├── levels_240.json             # 240 关主线（182 KB）
│   ├── arcade_levels.json          # 15 街机关卡（v1.3 新增）
│   ├── stamina_config.json         # 体力系统（R10）
│   ├── props_config.json           # 5 类道具
│   ├── daily_tasks.json            # 每日任务 + 7 日日历 + 排行榜
│   ├── pet_config_v1_3.json        # 宠物（含 metaRetention 挂钩）
│   ├── achievements_v1_3.json      # 成就（含 9 个 arcade 成就）
│   └── words_ch1..8.json           # 8 章词库
└── scripts/
    ├── build.js                    # 发布构建门禁（758 行，14 模块）
    ├── validate_meta.js            # 元留存层校验（484 行）
    ├── validate_levels_v1_3.js     # 关卡校验（417 行）
    ├── generate_levels_v1_3.js     # 关卡生成（306 行）
    ├── check_gameplay_v1_3.js      # 玩法子类检查
    ├── validate_gameconfig.js      # 配置总校验
    └── patch_build.js              # 构建补丁
```

## 五、用法

```bash
# 构建门禁（不调 Cocos，秒级）
node scripts/build.js --skip-build

# 元留存层校验（R10 红线）
node scripts/validate_meta.js

# 关卡逐关校验（量化曲线断言）
node scripts/validate_levels_v1_3.js

# 完整构建（需 Cocos Creator CLI）
node scripts/build.js --platform=wechat --project=<Cocos项目路径>
```

全部脚本退出码设计成 0/1，可直接串 CI 或 pre-commit hook。契约里「违反即 P0 退回」的退回动作，就是靠这些 exit code 执行的。

## 六、校验结果

```
levels_240.json (CONTRACT v1.3)
  总关数: 240 | Boss 关: 16 | mixedTypes>=2 关: 40 | 章节数: 8
  v1.3 字段: staminaCost/propRewards/allowAdRevive 全部完整
  R10 体力宽松: 全部合规
  结果: ✓ 通过

arcade_levels.json (CONTRACT v1.3)
  总关数: 15 | Ball: 5 | Runner: 5 | Idle: 5
  全部 mode=arcade, staminaCost=0, 无 mixedTypes
  结果: ✓ 通过

words_ch1~ch8.json (CONTRACT v1.3)
  总词数: 80 | 文件数: 8 | 错误: 0
  结果: ✓ 通过

validate_meta.js (CONTRACT v1.3 §11)
  体力/道具/每日任务/arcade关卡/跨配置一致性
  结果: ✓ 通过

build.js --skip-build (CONTRACT v1.3)
  检查项: 50+ | 通过: 50+ | 失败: 0 | 警告: 3
  结果: ✓ 构建就绪
```

## 许可证

MIT License
