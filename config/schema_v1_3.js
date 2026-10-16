/**
 * 配置模板 v1.3 — CONTRACT v1.3 冻结
 *
 * v1.3 相对 v1.2 的变更：
 *  - GameMode 新增 arcade（街机纯玩，娱乐 95%+，词仅作皮肤）
 *  - LevelType 新增 Ball(精灵弹球) / Runner(无尽跑酷) / Idle(放置合成)
 *  - LevelData 新增 staminaCost / propRewards / allowAdRevive（元留存层 §11）
 *  - 新增 PropType 枚举：hint / shuffle / freeze / hammer / revive
 *  - 新增 R10 体力宽松红线
 *  - arcade 关不强制 mixedTypes；staminaCost 建议 0 或极低
 *
 * 来源：CONTRACT v1.3 §3 / §4 / §5 / §10 / §11
 *
 * 这份文件是 v1.3 工具链的唯一事实来源——build.js / validate_meta.js /
 * validate_levels_v1_3.js / generate_levels_v1_3.js 全部 require 它。
 * 改契约只改这里，四个脚本同时生效。
 */
'use strict';

// =====================================================================
// 1. LevelType 枚举（v1.3 共 18 种，与 scripts/gameplay/<X>Level.ts 一一对应）
// =====================================================================
const LevelType = {
  Match: 'Match',         // 1  单词释义匹配
  Listen: 'Listen',       // 2  听音识词
  Sort: 'Sort',           // 3  单词分类
  Memory: 'Memory',       // 4  记忆翻牌
  Spell: 'Spell',         // 5  字母拖拽拼写
  Puzzle: 'Puzzle',       // 6  单词拼图
  Dictation: 'Dictation', // 7  听音拼写
  Eliminate: 'Eliminate', // 8  单词消消乐
  Antonym: 'Antonym',     // 9  反义词对战
  Synonym: 'Synonym',     // 10 近义词连连看
  FillBlank: 'FillBlank', // 11 选词填空
  Picture: 'Picture',     // 12 看图猜词（仅低阶 tier）
  Grammar: 'Grammar',     // 13 语法选择
  Translate: 'Translate', // 14 翻译闯关
  Order: 'Order',         // 15 句子排序
  // v1.3 新增：arcade 纯游戏玩法
  Ball: 'Ball',           // 16 精灵弹球（物理打砖块）
  Runner: 'Runner',       // 17 无尽跑酷（反应收集）
  Idle: 'Idle',           // 18 放置合成（离线成长）
};

// =====================================================================
// 2. GameMode（v1.3，5 档）
// =====================================================================
const GameMode = {
  casual: 'casual',       // 轻松摸鱼：娱乐为主
  campaign: 'campaign',   // 冒险闯关：均衡（240 主线）
  bootcamp: 'bootcamp',   // 专注集训：学习为主
  pvp: 'pvp',             // 实时 PK：Phase3 延后
  arcade: 'arcade',       // v1.3 新增：街机纯玩，娱乐 95%+
};

// =====================================================================
// 3. ExamLevel（分级词库标签，v1.2 引入，v1.3 不变）
// =====================================================================
const ExamLevel = {
  middle: 'middle',       // 中考（小学+初中）
  high: 'high',           // 高考（高中）
  cet4: 'cet4',           // 四级
  cet6: 'cet6',           // 六级
  postgrad: 'postgrad',   // 考研
};

// =====================================================================
// 4. PropType（v1.3 新增，道具类型枚举，§11.2）
// =====================================================================
const PropType = {
  hint: 'hint',           // 提示：高亮正确项/排除一个错误项
  shuffle: 'shuffle',     // 洗牌：重新打乱题目/选项
  freeze: 'freeze',       // 冻结：暂停计时
  hammer: 'hammer',       // 锤子：直接消除/跳过当前题
  revive: 'revive',       // 复活：失败后满血继续
};

// =====================================================================
// 5. WordData Schema（14 键 = id + 13 业务字段，§3 冻结，与 v1.2 一致）
// =====================================================================
const WordDataFields = [
  'id',               // number — 单词唯一 ID
  'word',             // string — 单词
  'phonetic',         // string — 音标
  'meaning',          // string — 中文释义
  'pos',              // string — 词性 n./v./adj./adv.
  'category',         // string — 主题分类
  'synonyms',         // string[] — 近义词
  'antonyms',         // string[] — 反义词
  'example',          // string — 例句
  'example_trans',    // string — 例句翻译
  'image_tag',        // string — 配图文件名（已 sanitize，仅低阶 tier 用）
  'grammar_tags',     // string[] — 语法标注
  'frequency_rank',   // number — 词频排名
  'examLevel',        // 'middle'|'high'|'cet4'|'cet6'|'postgrad'
];

// =====================================================================
// 6. LevelData Schema（§4 冻结）
// =====================================================================
const LevelDataFields = {
  // v1 既有
  v1: [
    'chapter',                // 1-8
    'index',                  // 1-30
    'gameplayType',           // LevelType 枚举（v1.3 共 18 种）
    'optionCount',            // 量化 3→6
    'timeLimit',              // 量化 25→12s
    'wordFreqBand',           // 'high'|'mid'|'low'
    'isBoss',                 // bool
    'comboReq',               // 小Boss≥3 / 大Boss≥5
    'winTarget',              // 通关答对题数
    'difficulty',             // 0-3
  ],
  // v1.1 新增
  v11: [
    'actionIntensity',        // 0-3（casual/arcade≥2 启用实时/物理）
    'wordCount',              // 本关题数
    'withinLevelEscalation',  // bool（关内递进阶）
    'starThresholds',         // [s1, s2, s3] 星级分数阈值
    'scoreRule',              // 计分规则对象
  ],
  // v1.2 变更
  v12: [
    'mode',                   // GameMode（v1.3 扩为 5 档）
    'mixedTypes',             // 本关题型序列；Boss 关须 >= 2
  ],
  // v1.3 新增（元留存层 §11）
  v13: [
    'staminaCost',            // 进入本关消耗体力（0=不消耗；arcade/casual 必须 0）
    'propRewards',            // PropType[] 结算可能掉落的道具
    'allowAdRevive',          // bool 是否允许看广告复活
  ],
};

/** 全部字段拉平（各版本校验器的 ALL_FIELDS） */
const AllLevelFields = [
  ...LevelDataFields.v1,
  ...LevelDataFields.v11,
  ...LevelDataFields.v12,
];

// =====================================================================
// 7. 章节 → 考试等级映射（§3 词库分层）
// =====================================================================
const CHAPTER_EXAM_LEVEL = {
  1: 'middle', 2: 'middle', 3: 'middle',
  4: 'high',   5: 'high',
  6: 'cet4',   7: 'cet4',
  8: 'cet6',
};

// =====================================================================
// 8. 各章解锁的玩法（§10 渐进解锁）
// =====================================================================
const CHAPTER_GAMEPLAYS = {
  1: ['Match', 'Listen', 'Sort', 'Memory'],
  2: ['Spell', 'Puzzle', 'Dictation'],
  3: ['Eliminate', 'Antonym', 'Synonym'],
  4: ['FillBlank', 'Picture', 'Grammar'],
  5: ['Translate', 'Order'],
  6: ['Match', 'Spell', 'Antonym'],
  7: ['FillBlank', 'Grammar', 'Translate'],
  8: ['Order', 'Picture', 'Idle'],
};

// =====================================================================
// 9. 量化曲线（§4 冻结的难度曲线，校验器硬断言用）
// =====================================================================
/** 全局序号 1-240 → 选项数 3/4/5/6 */
function expectOptionCount(globalIndex) {
  return globalIndex <= 30 ? 3 : globalIndex <= 120 ? 4 : globalIndex <= 210 ? 5 : 6;
}

/** 全局序号 → 限时 25/20/15/12 秒 */
function expectTimeLimit(globalIndex) {
  return globalIndex <= 30 ? 25 : globalIndex <= 120 ? 20 : globalIndex <= 210 ? 15 : 12;
}

/** 全局序号 → 词频带 high/mid/low */
function expectWordFreqBand(globalIndex) {
  return globalIndex <= 120 ? 'high' : globalIndex <= 180 ? 'mid' : 'low';
}

// =====================================================================
// 10. 通关目标（§4 Boss 关硬编码）
// =====================================================================
const WIN_TARGET_MAP = {
  normal: 10,
  smallBoss: 15,
  bigBoss: 20,
};

// =====================================================================
// 11. 元留存层常量（v1.3 §11）
// =====================================================================
const META = {
  /** R10 红线：体力恢复速率上限（分钟/点） */
  staminaRecoveryMaxMinutes: 5,
  /** R10 红线：免费获取渠道最少数量 */
  staminaFreeSourcesMin: 3,
  /** R10 红线：新手保护天数 */
  newbieProtectionDays: 7,
  /** §11.4 每日任务数下限 */
  dailyTasksMin: 3,
  /** §11.4 登录日历周期 */
  loginCalendarCycle: 7,
  /** §11.5 异步排行榜数量下限 */
  asyncBoardsMin: 3,
  /** §11.2 道具类型总数 */
  propTypeCount: 5,
};

// =====================================================================
// 12. 校验辅助函数
// =====================================================================

/**
 * §8 高阶去卡通图：examLevel >= cet4 禁用 Picture 玩法。
 *
 * 注意：这是产品要求不是纯技术约束——让备考用户在关键阶段
 * 不被幼稚视觉干扰。所以它被写进 schema 而不是散在校验器里。
 */
function canUsePicture(examLevel) {
  if (!examLevel) return true;
  return examLevel === 'middle' || examLevel === 'high';
}

/**
 * R5 image_tag sanitize：统一小写 + 下划线。
 * 生图与词库转换前必须 sanitize，否则空格/大写/符号会直接导致裂图。
 */
function makeImageTag(word) {
  return String(word || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** 6 位日期键（YYYY-MM-DD），用于每日任务/登录去重 */
function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** 判断 mode 是否为免费模式（R10：casual/arcade 不耗体力） */
function isFreeMode(mode) {
  return mode === 'casual' || mode === 'arcade';
}

module.exports = {
  LevelType,
  GameMode,
  ExamLevel,
  PropType,
  WordDataFields,
  LevelDataFields,
  AllLevelFields,
  CHAPTER_EXAM_LEVEL,
  CHAPTER_GAMEPLAYS,
  expectOptionCount,
  expectTimeLimit,
  expectWordFreqBand,
  WIN_TARGET_MAP,
  META,
  canUsePicture,
  makeImageTag,
  dayKey,
  isFreeMode,
};
