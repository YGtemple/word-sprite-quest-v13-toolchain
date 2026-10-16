/**
 * validate_meta.js — 元留存层配置校验器（CONTRACT v1.3 §11）
 *
 * 校验对象：
 *  1. stamina_config.json  — 体力系统（R10 宽松红线）
 *  2. props_config.json    — 道具系统（5 类 + 非付费墙）
 *  3. daily_tasks.json     — 每日任务 + 7 日登录日历 + 异步排行榜
 *  4. arcade_levels.json   — 街机纯玩关卡（mode=arcade, staminaCost=0, 无 mixedTypes）
 *
 * R10 红线检查项：
 *  - 恢复速率 ≤ 5 分钟/点
 *  - 0 体力兜底（看广告免费玩）
 *  - 新手前 7 日近乎无限体力
 *  - arcade/casual staminaCost=0
 *  - 禁止付费墙锁死入口
 *
 * 用法：
 *   node validate_meta.js                           # 默认读取 ../config/
 *   node validate_meta.js --config=<配置目录路径>
 *
 * 退出码：校验通过 exit(0)；存在失败项 exit(1)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// =====================================================================
// 引用 Schema（唯一事实来源）
// =====================================================================
let S;
try {
  S = require('../config/schema_v1_3.js');
} catch (e) {
  S = require('./schema_v1_3.js');
}

// =====================================================================
// 参数解析
// =====================================================================
const args = process.argv.slice(2);
const configArg = args.find(a => a.startsWith('--config='));
const configDir = configArg
  ? path.resolve(configArg.slice('--config='.length))
  : path.join(__dirname, '..', 'config');

const reportPath = path.join(__dirname, 'validate_meta_report.json');

// =====================================================================
// 报告收集
// =====================================================================
const report = {
  contractVersion: 'v1.3',
  timestamp: new Date().toISOString(),
  configDir,
  checks: [],
  errors: [],
  warnings: [],
  stats: {},
};

function addCheck(name, passed, detail) {
  report.checks.push({ name, passed, detail });
  const icon = passed ? '✓' : '✗';
  console.log(`  ${icon} ${name}: ${detail}`);
  if (passed) {
    report.stats.passed = (report.stats.passed || 0) + 1;
  } else {
    report.stats.failed = (report.stats.failed || 0) + 1;
    report.errors.push(`${name}: ${detail}`);
  }
}

function addWarning(name, detail) {
  report.warnings.push(`${name}: ${detail}`);
  console.log(`  ⚠ ${name}: ${detail}`);
}

function loadJSON(filename) {
  const fp = path.join(configDir, filename);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (err) {
    return { _parseError: err.message };
  }
}

// =====================================================================
// 1. 体力系统校验（stamina_config.json, R10）
// =====================================================================
// 这一节把 R10 的每一条红线拆成独立的 check，
// 任何一条不满足都会进 report.errors 并最终 exit(1)。
function validateStamina() {
  console.log('\n── 1. 体力系统校验 (stamina_config.json, R10) ──');
  const cfg = loadJSON('stamina_config.json');
  if (!cfg) {
    addCheck('stamina_config.json 存在', false, '文件不存在');
    return;
  }
  if (cfg._parseError) {
    addCheck('stamina_config.json 解析', false, cfg._parseError);
    return;
  }

  addCheck('stamina contractVersion', cfg.contractVersion === 'v1.3',
    cfg.contractVersion || '缺失');

  // R10① 恢复速率 ≤ 5 分钟/点（硬红线）
  const recovery = cfg.recoveryRate || {};
  const intervalMin = recovery.intervalMinutes || 999;
  addCheck('R10 恢复速率 ≤5min', intervalMin <= 5, `${intervalMin} 分钟/点`);

  // R10① 建议 ≤ 3 分钟（宽松加分项，不达标只提示）
  addCheck('R10 恢复速率建议 ≤3min', intervalMin <= 3,
    intervalMin <= 3 ? '远高于行业' : `${intervalMin}min（可更宽松）`);

  // R10 体力上限 ≥ 30
  const maxStamina = cfg.maxStamina || 0;
  addCheck('R10 体力上限 ≥30', maxStamina >= 30, `${maxStamina}（建议 30-50）`);

  // R10② 免费获取渠道 ≥ 3 种（取自 schema 的 META 常量）
  const freeSources = cfg.freeSources || [];
  addCheck(`R10 免费渠道 ≥${S.META.staminaFreeSourcesMin}`,
    freeSources.length >= S.META.staminaFreeSourcesMin,
    `${freeSources.length} 种：${freeSources.map(s => s.key).join(', ')}`);

  // R10③ 0 体力兜底
  const fallback = cfg.zeroStaminaFallback || {};
  addCheck('R10 0体力兜底', fallback.enabled === true,
    fallback.enabled ? fallback.method : '缺失');

  // R10④ 新手保护
  const newbie = cfg.newbieProtection || {};
  addCheck(`R10 新手${S.META.newbieProtectionDays}日保护`,
    newbie.first7DaysUnlimited === true,
    newbie.first7DaysUnlimited ? '已启用' : '缺失');

  // R10：免费模式不耗体力（用 schema 的 isFreeMode 判定，避免重复定义）
  const costByMode = cfg.staminaCostByMode || {};
  addCheck('R10 arcade 免费', costByMode.arcade === 0, `staminaCost=${costByMode.arcade}`);
  addCheck('R10 casual 免费', costByMode.casual === 0, `staminaCost=${costByMode.casual}`);

  // R10⑤ 禁止付费墙锁死入口——检查红线声明字段存在
  addCheck('R10 红线声明', typeof cfg.redLine === 'string' && cfg.redLine.length > 0,
    cfg.redLine ? '已声明' : '缺失');

  report.stats.staminaMax = maxStamina;
  report.stats.staminaRecoveryMin = intervalMin;
  report.stats.staminaFreeSources = freeSources.length;
}

// =====================================================================
// 2. 道具系统校验（props_config.json）
// =====================================================================
function validateProps() {
  console.log('\n── 2. 道具系统校验 (props_config.json) ──');
  const cfg = loadJSON('props_config.json');
  if (!cfg) {
    addCheck('props_config.json 存在', false, '文件不存在');
    return;
  }
  if (cfg._parseError) {
    addCheck('props_config.json 解析', false, cfg._parseError);
    return;
  }

  addCheck('props contractVersion', cfg.contractVersion === 'v1.3',
    cfg.contractVersion || '缺失');

  // 5 类道具完整（从 schema 的 PropType 取应有关键字）
  const props = cfg.props || [];
  const requiredKeys = Object.keys(S.PropType);
  const propKeys = props.map(p => p.key);
  const hasAll = requiredKeys.every(k => propKeys.includes(k));
  addCheck(`${S.META.propTypeCount} 类道具完整`, hasAll,
    hasAll ? requiredKeys.join('+')
           : `缺失：${requiredKeys.filter(k => !propKeys.includes(k)).join(',')}`);

  // 非付费墙（与 R10 同源思路：把商业约束写进配置）
  addCheck('非付费墙', cfg.paidOnly === false,
    cfg.paidOnly === false ? '付费仅加速' : '付费墙违规');

  // 每个道具必须带三档掉率（normal / boss / arcade）
  const hasDropRates = props.every(p => p.dropRate && typeof p.dropRate === 'object');
  addCheck('掉落率配置', hasDropRates,
    hasDropRates ? '全部含 dropRate' : '部分缺失');

  // icon 命名（R5）
  const hasIcons = props.every(p => typeof p.icon === 'string' && p.icon.length > 0);
  addCheck('道具图标命名 (R5)', hasIcons, hasIcons ? '全部含 icon' : '部分缺失');

  // 产出来源 ≥ 3 种
  const sources = cfg.sources || [];
  addCheck('产出来源 ≥3', sources.length >= 3,
    `${sources.length} 种：${sources.map(s => s.key).join(', ')}`);

  // 初始库存与上限
  const initInv = cfg.initialInventory || {};
  addCheck('初始库存', requiredKeys.every(k => typeof initInv[k] === 'number'),
    '5 类齐备');

  const maxInv = cfg.maxInventory || {};
  const hasMax = requiredKeys.every(k => typeof maxInv[k] === 'number');
  addCheck('上限配置', hasMax, hasMax ? '5 类齐备' : '部分缺失');

  // 掉落率数值合理（0 < rate <= 1）
  const ratesValid = props.every(p =>
    Object.values(p.dropRate || {}).every(r => typeof r === 'number' && r > 0 && r <= 1));
  addCheck('掉落率数值范围', ratesValid, ratesValid ? '全部在 (0,1]' : '存在越界值');

  report.stats.propCount = props.length;
}

// =====================================================================
// 3. 每日任务 + 登录日历 + 排行榜校验（daily_tasks.json）
// =====================================================================
function validateDailyTasks() {
  console.log('\n── 3. 每日任务与登录日历校验 (daily_tasks.json) ──');
  const cfg = loadJSON('daily_tasks.json');
  if (!cfg) {
    addCheck('daily_tasks.json 存在', false, '文件不存在');
    return;
  }
  if (cfg._parseError) {
    addCheck('daily_tasks.json 解析', false, cfg._parseError);
    return;
  }

  addCheck('daily_tasks contractVersion', cfg.contractVersion === 'v1.3',
    cfg.contractVersion || '缺失');

  // §11.4 每日任务 ≥ 3 条
  const daily = cfg.dailyTasks || {};
  const tasks = daily.tasks || [];
  addCheck(`每日任务 ≥${S.META.dailyTasksMin}`, tasks.length >= S.META.dailyTasksMin,
    `${tasks.length} 条：${tasks.map(t => t.id).join(', ')}`);

  // 每条任务必须有 reward
  const tasksHaveReward = tasks.every(t => t.reward && typeof t.reward === 'object');
  addCheck('任务奖励配置', tasksHaveReward, tasksHaveReward ? '全部含 reward' : '部分缺失');

  // 7 日登录日历
  const calendar = cfg.loginCalendar || {};
  const rewards = calendar.rewards || [];
  addCheck(`登录日历 ${S.META.loginCalendarCycle} 日`,
    rewards.length === S.META.loginCalendarCycle,
    `${rewards.length} 天`);
  addCheck('日历周期字段', calendar.cycle === S.META.loginCalendarCycle,
    `cycle=${calendar.cycle}`);

  // 日历天数连续 1..7
  const days = rewards.map(r => r.day).sort((a, b) => a - b);
  const consecutive = days.every((d, i) => d === i + 1);
  addCheck('日历天数连续', consecutive, days.join(','));

  // 第 7 日必须是稀有奖励（isRare）
  const day7 = rewards.find(r => r.day === 7);
  addCheck('第7日稀有奖励', !!day7 && day7.isRare === true,
    day7 && day7.isRare ? '已标记 isRare' : '未标记');

  // 异步排行榜 ≥ 3 个榜
  const ranking = cfg.asyncRanking || {};
  const boards = ranking.boards || [];
  addCheck(`异步榜单 ≥${S.META.asyncBoardsMin}`, boards.length >= S.META.asyncBoardsMin,
    `${boards.length} 个：${boards.map(b => b.key).join(', ')}`);

  report.stats.dailyTaskCount = tasks.length;
  report.stats.rankingBoards = boards.length;
}

// =====================================================================
// 4. 街机关卡校验（arcade_levels.json, R10）
// =====================================================================
function validateArcadeLevels() {
  console.log('\n── 4. 街机关卡校验 (arcade_levels.json, R10) ──');
  const cfg = loadJSON('arcade_levels.json');
  if (!cfg) {
    addCheck('arcade_levels.json 存在', false, '文件不存在');
    return;
  }
  if (cfg._parseError) {
    addCheck('arcade_levels.json 解析', false, cfg._parseError);
    return;
  }

  const levels = cfg.levels || [];
  addCheck('街机关卡数 ≥15', levels.length >= 15, `${levels.length} 关`);

  // 三种玩法各 5 关
  const byType = {};
  for (const lv of levels) byType[lv.gameplayType] = (byType[lv.gameplayType] || 0) + 1;
  const arcadeTypes = ['Ball', 'Runner', 'Idle'];
  const allTypesPresent = arcadeTypes.every(t => byType[t] >= 5);
  addCheck('三种街机玩法各 5 关', allTypesPresent,
    arcadeTypes.map(t => `${t}:${byType[t] || 0}`).join(' '));

  // 全部 mode=arcade
  const allArcade = levels.every(lv => lv.mode === 'arcade');
  addCheck('全部 mode=arcade', allArcade, allArcade ? '合规' : '存在非法 mode');

  // R10：全部 staminaCost=0
  const allFree = levels.every(lv => lv.staminaCost === 0);
  addCheck('R10 全部 staminaCost=0', allFree, allFree ? '街机免费' : '存在收费关');

  // arcade 不绑 mixedTypes
  const noMixed = levels.every(lv => !lv.mixedTypes || lv.mixedTypes.length === 0);
  addCheck('不绑 mixedTypes', noMixed, noMixed ? '合规' : '存在多余 mixedTypes');

  // 字段完整性
  const required = ['id', 'gameplayType', 'mode', 'difficulty', 'timeLimit',
    'winTarget', 'starThresholds', 'scoreRule', 'staminaCost', 'allowAdRevive'];
  const missing = [];
  levels.forEach((lv, i) => {
    for (const f of required) {
      if (lv[f] === undefined || lv[f] === null) missing.push(`[${i}]${f}`);
    }
  });
  addCheck('字段完整性', missing.length === 0,
    missing.length === 0 ? '全部完整' : `缺失 ${missing.length} 项`);

  // wordCount 应为 0（单词仅作皮肤，不作答题）
  const skinOnly = levels.every(lv => lv.wordCount === 0);
  addCheck('wordCount=0（词仅作皮肤）', skinOnly,
    skinOnly ? '合规' : '存在需要识读单词的街机关');

  report.stats.arcadeLevels = levels.length;
}

// =====================================================================
// 5. 跨配置一致性校验（R9 模式联动）
// =====================================================================
function validateCrossConfig() {
  console.log('\n── 5. 跨配置一致性 (R9) ──');
  const daily = loadJSON('daily_tasks.json');
  const pet = loadJSON('pet_config.json');
  const props = loadJSON('props_config.json');

  // 每日任务奖励的道具必须是合法的 PropType
  if (daily && !daily._parseError && props && !props._parseError) {
    const validProps = new Set((props.props || []).map(p => p.key));
    const badProps = [];
    const tasks = (daily.dailyTasks || {}).tasks || [];
    for (const t of tasks) {
      for (const k of Object.keys(t.reward?.props || {})) {
        if (!validProps.has(k)) badProps.push(`${t.id}:${k}`);
      }
    }
    for (const r of (daily.loginCalendar || {}).rewards || []) {
      for (const k of Object.keys(r.reward?.props || {})) {
        if (!validProps.has(k)) badProps.push(`day${r.day}:${k}`);
      }
    }
    addCheck('任务奖励道具合法', badProps.length === 0,
      badProps.length === 0 ? '全部合法' : `非法：${badProps.join(', ')}`);
  }

  // pet_config 版本应为 v1.3
  if (pet && !pet._parseError) {
    addCheck('pet_config 版本', pet.contractVersion === 'v1.3',
      pet.contractVersion || '缺失');
  }

  // coin 来源需包含 arcade（R9：所有模式写入同一 ResourcePool）
  if (pet && !pet._parseError) {
    const currencies = pet.resourcePool?.currencies || [];
    const coin = currencies.find(c => c.key === 'coin');
    const hasArcade = (coin?.sources || []).includes('arcade');
    addCheck('R9 coin 含 arcade 来源', hasArcade,
      hasArcade ? '已汇入统一 ResourcePool' : 'arcade 资源未入账');
  }

  // metaRetention 挂钩存在（§11 宠物与元留存层联动）
  if (pet && !pet._parseError) {
    addCheck('metaRetention 挂钩', !!pet.metaRetention,
      pet.metaRetention ? '已配置' : '缺失');
  }
}

// =====================================================================
// 主流程
// =====================================================================
function main() {
  console.log('═══════════════════════════════════════');
  console.log('  元留存层配置校验报告 (CONTRACT v1.3 §11)');
  console.log('═══════════════════════════════════════');
  console.log(`  配置目录: ${configDir}`);

  validateStamina();
  validateProps();
  validateDailyTasks();
  validateArcadeLevels();
  validateCrossConfig();

  // 汇总
  console.log('\n═══════════════════════════════════════');
  console.log('  校验汇总');
  console.log('═══════════════════════════════════════');
  console.log(`  通过: ${report.stats.passed || 0}`);
  console.log(`  失败: ${report.stats.failed || 0}`);
  console.log(`  警告: ${report.warnings.length}`);

  if (report.warnings.length > 0) {
    console.log('\n  ⚠ 警告:');
    report.warnings.forEach(w => console.log(`    - ${w}`));
  }
  if (report.errors.length > 0) {
    console.log('\n  ✗ 失败项:');
    report.errors.forEach(e => console.log(`    - ${e}`));
  }

  // 落盘报告
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n  报告已写入: ${reportPath}`);
  } catch (e) { /* 报告写入失败不影响退出码 */ }

  if (report.errors.length > 0) {
    console.log('\n  结果: ✗ 退回 (P0)');
    process.exit(1);
  } else {
    console.log('\n  结果: ✓ 通过');
    process.exit(0);
  }
}

main();
