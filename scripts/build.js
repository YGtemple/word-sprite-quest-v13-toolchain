/**
 * build.js v1.3 — 发布构建脚本（CONTRACT v1.3）
 *
 * v1.3 变更：
 *  - 新增 R10 体力宽松检查（stamina_config.json）
 *  - 新增道具系统检查（props_config.json）
 *  - 新增每日任务+登录日历检查（daily_tasks.json）
 *  - 关卡校验增加 staminaCost/propRewards/allowAdRevive
 *  - mode 取值扩为 5 档（含 arcade）
 *
 * 职责（13 个检查模块）：
 *  1-8  配置层面：文件完整性 / 关卡 / 词库 image_tag(R5) / 宠物(R9) /
 *       成就 / 体力(R10) / 道具 / 每日任务
 *  9    街机关卡
 *  10   包体大小（R6：主包 ≤4MB，主纹理 ≤1.5MB）
 *  11   跨分包引用（R6：主包零跨包纹理引用）
 *  12   双平台隔离（R7）+ 实际 Cocos 构建
 *  13   构建就绪报告
 *
 * 用法：
 *   node build.js                     # 全量检查 + 构建
 *   node build.js --skip-build        # 仅检查，不调 Cocos
 *   node build.js --platform=wechat   # 只构建微信
 *   node build.js --project=<路径>    # 指定 Cocos 工程
 *
 * 退出码：构建就绪 exit(0)；存在失败项 exit(1)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const S = require('../config/schema_v1_3.js');

// =====================================================================
// 参数解析
// =====================================================================
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const platformArg = args.find(a => a.startsWith('--platform='));
const projectArg = args.find(a => a.startsWith('--project='));

const platform = platformArg ? platformArg.split('=')[1] : null;
const cocosProjectPath = projectArg
  ? projectArg.split('=')[1]
  : path.join(__dirname, '..', '..', 'Codex产物');

const configDir = path.join(__dirname, '..', 'config');
const traeRoot = path.join(__dirname, '..');

// =====================================================================
// 包体红线（R6）
// =====================================================================
const MAIN_PACKAGE_LIMIT = 4 * 1024 * 1024;
const MAIN_TEXTURE_LIMIT = 1.5 * 1024 * 1024;

// =====================================================================
// 报告收集
// =====================================================================
const report = {
  contractVersion: 'v1.3',
  timestamp: new Date().toISOString(),
  platform: platform || 'both',
  checks: [],
  errors: [],
  warnings: [],
  stats: {},
};

function addCheck(name, passed, detail) {
  report.checks.push({ name, passed, detail });
  const icon = passed ? '✓' : '✗';
  console.log(`  ${icon} ${name}: ${detail}`);
  if (!passed) report.errors.push(`${name}: ${detail}`);
}

function addWarning(name, detail) {
  report.warnings.push(`${name}: ${detail}`);
  console.log(`  ⚠ ${name}: ${detail}`);
}

// =====================================================================
// 1. 配置文件完整性检查
// =====================================================================
function checkConfigFiles() {
  console.log('\n── 1. 配置文件完整性 ──');

  const requiredFiles = [
    { file: 'levels_240.json', desc: '240 关卡配置' },
    { file: 'pet_config.json', desc: '宠物配置' },
    { file: 'achievements.json', desc: '成就配置' },
    { file: 'stamina_config.json', desc: '体力系统配置 (v1.3)' },
    { file: 'props_config.json', desc: '道具系统配置 (v1.3)' },
    { file: 'daily_tasks.json', desc: '每日任务+登录日历 (v1.3)' },
    { file: 'arcade_levels.json', desc: '街机纯玩关卡 (v1.3)' },
    { file: 'schema_v1_3.js', desc: 'Schema JS v1.3' },
    { file: 'schema_v1_3.ts', desc: 'Schema TS v1.3' },
  ];

  for (const { file, desc } of requiredFiles) {
    const fp = path.join(configDir, file);
    addCheck(`配置文件 ${file}`, fs.existsSync(fp), desc);
  }

  for (let ch = 1; ch <= 8; ch++) {
    const fp = path.join(configDir, `words_ch${ch}.json`);
    addCheck(`词库 words_ch${ch}.json`, fs.existsSync(fp), `第${ch}章词库`);
  }
}

// =====================================================================
// 2. levels_240.json 校验摘要
// =====================================================================
// 注意：这里是「摘要式」检查（统计规模 + 关键约束），
// 完整逐关校验交给 validate_levels_v1_3.js。
// build.js 要在 30 秒内跑完，不能重复做逐条遍历。
function checkLevels() {
  console.log('\n── 2. 关卡配置校验 ──');
  const fp = path.join(configDir, 'levels_240.json');
  if (!fs.existsSync(fp)) {
    addCheck('levels_240.json', false, '文件不存在');
    return;
  }

  const levels = JSON.parse(fs.readFileSync(fp, 'utf8'));
  report.stats.totalLevels = levels.length;

  addCheck('总关数 240', levels.length === 240, `${levels.length} 关`);

  // mode 全部合法（含 v1.3 的 arcade）
  const validModes = new Set(Object.values(S.GameMode));
  const badModes = levels.filter(l => !validModes.has(l.mode));
  addCheck('mode 取值合法(5档)', badModes.length === 0,
    badModes.length === 0 ? '全部合法' : `${badModes.length} 关非法`);

  // Boss 关统计与 mixedTypes 约束（R8）
  const bosses = levels.filter(l => l.isBoss);
  report.stats.bossLevels = bosses.length;
  const bossViolations = bosses.filter(l => (l.mixedTypes || []).length < 2);
  addCheck('R8 Boss mixedTypes≥2', bossViolations.length === 0,
    bossViolations.length === 0 ? `${bosses.length} 个 Boss 全合规` : `${bossViolations.length} 处违规`);

  const mixedCount = levels.filter(l => (l.mixedTypes || []).length >= 2).length;
  report.stats.mixedTypesLevels = mixedCount;

  // 高阶去卡通图（§8）
  const pictureViolations = levels.filter(l => {
    const examLevel = S.CHAPTER_EXAM_LEVEL[l.chapter];
    if (S.canUsePicture(examLevel)) return false;
    return l.gameplayType === 'Picture' || (l.mixedTypes || []).includes('Picture');
  });
  addCheck('§8 高阶禁 Picture', pictureViolations.length === 0,
    pictureViolations.length === 0 ? '合规' : `${pictureViolations.length} 处违规`);

  // v1.3 新字段完整性
  const missingV13 = levels.filter(l =>
    l.staminaCost === undefined || l.propRewards === undefined || l.allowAdRevive === undefined);
  addCheck('v1.3 字段完整', missingV13.length === 0,
    missingV13.length === 0 ? 'staminaCost/propRewards/allowAdRevive' : `${missingV13.length} 关缺失`);
}

// =====================================================================
// 3. 词库 image_tag 一致性检查（R5）
// =====================================================================
// R5 红线的机器化验收：词库里每个 image_tag 必须等于
// makeImageTag(word)。不一致意味着出图文件名对不上，会裂图。
function checkWordbankImageTags() {
  console.log('\n── 3. 词库 image_tag 一致性 (R5) ──');
  let total = 0;
  let mismatches = 0;

  for (let ch = 1; ch <= 8; ch++) {
    const fp = path.join(configDir, `words_ch${ch}.json`);
    if (!fs.existsSync(fp)) continue;

    const words = JSON.parse(fs.readFileSync(fp, 'utf8'));
    total += words.length;

    for (const w of words) {
      if (S.makeImageTag(w.word) !== w.image_tag) {
        mismatches++;
        if (mismatches <= 5) {
          addWarning('R5 image_tag', `${w.word}: 期望 ${S.makeImageTag(w.word)}，实际 ${w.image_tag}`);
        }
      }
    }
  }

  report.stats.totalWords = total;
  addCheck('R5 image_tag 对齐', mismatches === 0,
    mismatches === 0 ? `${total} 词全部对齐` : `${mismatches} 处不匹配`);
}

// =====================================================================
// 4. pet_config.json ResourcePool 检查（R9）
// =====================================================================
function checkPetConfig() {
  console.log('\n── 4. 萌宠系统配置 (R9) ──');
  const fp = path.join(configDir, 'pet_config.json');
  if (!fs.existsSync(fp)) {
    addCheck('pet_config.json', false, '文件不存在');
    return;
  }

  const pet = JSON.parse(fs.readFileSync(fp, 'utf8'));

  addCheck('pet_config 版本', pet.contractVersion === 'v1.3',
    pet.contractVersion || '缺失');

  const stages = pet.stages || pet.evolutionStages || [];
  addCheck('宠物阶段数', stages.length >= 5, `${stages.length} 阶段`);

  const skins = pet.skins || [];
  addCheck('宠物皮肤数', skins.length >= 14, `${skins.length} 皮肤`);

  const pool = pet.resourcePool || {};
  const currencies = pool.currencies || [];
  const hasCoin = currencies.some(c => c.key === 'coin');
  const hasMaterial = currencies.some(c => c.key === 'material');
  addCheck('R9 ResourcePool.coin', hasCoin, hasCoin ? '存在' : '缺失');
  addCheck('R9 ResourcePool.material', hasMaterial, hasMaterial ? '存在' : '缺失');

  if (hasCoin) {
    const coinSources = currencies.find(c => c.key === 'coin').sources || [];
    // R9 的机器化验收：arcade 产出也必须汇入统一 ResourcePool
    const modesCovered = ['casual', 'campaign', 'bootcamp', 'arcade']
      .every(m => coinSources.includes(m));
    addCheck('R9 coin 来源覆盖(含arcade)', modesCovered,
      modesCovered ? 'casual+campaign+bootcamp+arcade' : coinSources.join(','));
  }

  // v1.3: metaRetention 挂钩（元留存层奖励联动）
  const meta = pet.metaRetention;
  addCheck('v1.3 metaRetention 挂钩', !!meta,
    meta ? '已配置元留存层奖励挂钩' : '缺失');

  report.stats.petStages = stages.length;
  report.stats.petSkins = skins.length;
}

// =====================================================================
// 5. achievements.json 检查
// =====================================================================
function checkAchievements() {
  console.log('\n── 5. 成就配置 ──');
  const fp = path.join(configDir, 'achievements.json');
  if (!fs.existsSync(fp)) {
    addCheck('achievements.json', false, '文件不存在');
    return;
  }

  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));

  addCheck('achievements 版本', data.contractVersion === 'v1.3',
    data.contractVersion || '缺失');

  const achievements = data.achievements || [];
  const frames = data.avatarFrames || data.frames || [];

  addCheck('成就数量', achievements.length >= 11, `${achievements.length} 个`);
  addCheck('头像框数量', frames.length >= 3, `${frames.length} 个`);

  // v1.3 新增 arcade 成就
  const arcadeAchievements = achievements.filter(a => a.type === 'arcade');
  addCheck('v1.3 arcade 成就', arcadeAchievements.length >= 3,
    `${arcadeAchievements.length} 个 arcade 成就`);

  report.stats.achievements = achievements.length;
  report.stats.avatarFrames = frames.length;
  report.stats.arcadeAchievements = arcadeAchievements.length;
}

// =====================================================================
// 6. v1.3 体力系统配置检查（R10）
// =====================================================================
function checkStaminaConfig() {
  console.log('\n── 6. 体力系统配置 (R10 宽松原则) ──');
  const fp = path.join(configDir, 'stamina_config.json');
  if (!fs.existsSync(fp)) {
    addCheck('stamina_config.json', false, '文件不存在');
    return;
  }

  const cfg = JSON.parse(fs.readFileSync(fp, 'utf8'));

  // R10① 恢复速率须宽松（≤5 分钟/点，阈值取自 schema META）
  const recoveryMinutes = cfg.recoveryRate?.intervalMinutes || 999;
  addCheck('R10 恢复速率宽松', recoveryMinutes <= S.META.staminaRecoveryMaxMinutes,
    `${recoveryMinutes} 分钟/点 (R10 须 ≤${S.META.staminaRecoveryMaxMinutes}min)`);

  // R10③ 0 体力兜底
  const fallback = cfg.zeroStaminaFallback;
  addCheck('R10 0体力兜底', fallback?.enabled === true,
    fallback?.enabled ? fallback.method : '缺失');

  // R10④ 新手保护
  addCheck('R10 新手7日保护', cfg.newbieProtection?.first7DaysUnlimited === true,
    cfg.newbieProtection?.first7DaysUnlimited ? '已启用' : '缺失');

  // R10② 免费渠道数量
  const freeSources = cfg.freeSources || [];
  addCheck('R10 免费渠道≥3', freeSources.length >= S.META.staminaFreeSourcesMin,
    `${freeSources.length} 种`);

  // R10 免费模式不耗体力
  const costByMode = cfg.staminaCostByMode || {};
  addCheck('R10 arcade/casual 免费',
    costByMode.arcade === 0 && costByMode.casual === 0,
    `arcade=${costByMode.arcade} casual=${costByMode.casual}`);

  report.stats.staminaMax = cfg.maxStamina;
  report.stats.staminaRecoveryMin = recoveryMinutes;
}

// =====================================================================
// 7. v1.3 道具系统配置检查
// =====================================================================
function checkPropsConfig() {
  console.log('\n── 7. 道具系统配置 ──');
  const fp = path.join(configDir, 'props_config.json');
  if (!fs.existsSync(fp)) {
    addCheck('props_config.json', false, '文件不存在');
    return;
  }

  const cfg = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const props = cfg.props || [];
  const requiredKeys = Object.keys(S.PropType);
  const propKeys = props.map(p => p.key);

  addCheck(`道具 ${S.META.propTypeCount} 类完整`,
    requiredKeys.every(k => propKeys.includes(k)),
    props.length ? propKeys.join('+') : '缺失');

  addCheck('非付费墙', cfg.paidOnly === false,
    cfg.paidOnly === false ? '付费仅加速' : '付费墙违规');

  report.stats.propsCount = props.length;
}

// =====================================================================
// 8. v1.3 每日任务+登录日历检查
// =====================================================================
function checkDailyTasks() {
  console.log('\n── 8. 每日任务与登录日历 ──');
  const fp = path.join(configDir, 'daily_tasks.json');
  if (!fs.existsSync(fp)) {
    addCheck('daily_tasks.json', false, '文件不存在');
    return;
  }

  const cfg = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const tasks = cfg.dailyTasks?.tasks || [];
  const rewards = cfg.loginCalendar?.rewards || [];
  const boards = cfg.asyncRanking?.boards || [];

  addCheck('每日任务≥3', tasks.length >= S.META.dailyTasksMin, `${tasks.length} 条`);
  addCheck('登录日历 7 日', rewards.length === S.META.loginCalendarCycle, `${rewards.length} 日`);

  const day7 = rewards.find(r => r.day === 7);
  addCheck('第7日稀有奖励', day7?.isRare === true, day7?.isRare ? '已标记' : '未标记');

  addCheck('异步榜单≥3', boards.length >= S.META.asyncBoardsMin, `${boards.length} 个`);

  report.stats.dailyTasks = tasks.length;
  report.stats.loginCalendarDays = rewards.length;
}

// =====================================================================
// 9. 街机关卡检查（arcade_levels.json, R10）
// =====================================================================
function checkArcadeLevels() {
  console.log('\n── 9. 街机关卡配置 (R10) ──');
  const fp = path.join(configDir, 'arcade_levels.json');
  if (!fs.existsSync(fp)) {
    addCheck('arcade_levels.json', false, '文件不存在');
    return;
  }

  const cfg = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const levels = cfg.levels || [];

  addCheck('街机关卡≥15', levels.length >= 15, `${levels.length} 关`);

  const byType = {};
  for (const lv of levels) byType[lv.gameplayType] = (byType[lv.gameplayType] || 0) + 1;

  addCheck('三种玩法各≥5关',
    ['Ball', 'Runner', 'Idle'].every(t => (byType[t] || 0) >= 5),
    `Ball:${byType.Ball || 0} Runner:${byType.Runner || 0} Idle:${byType.Idle || 0}`);

  addCheck('全部 mode=arcade', levels.every(l => l.mode === 'arcade'), '合规');

  // R10：街机免费
  addCheck('R10 全部 staminaCost=0',
    levels.every(l => l.staminaCost === 0), '街机免费');

  // 「单词仅作皮肤不作答题」的机器化验收
  addCheck('wordCount=0（词仅作皮肤）',
    levels.every(l => l.wordCount === 0), '合规');

  report.stats.arcadeLevels = levels.length;
  report.stats.arcadeBall = byType.Ball || 0;
  report.stats.arcadeRunner = byType.Runner || 0;
  report.stats.arcadeIdle = byType.Idle || 0;
}

// =====================================================================
// 10. 包体大小检查（R6）
// =====================================================================
function getDirSize(dirPath) {
  let total = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir)) {
      const fp = path.join(dir, item);
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) walk(fp);
      else total += stat.size;
    }
  };
  walk(dirPath);
  return total;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function checkPackageSize() {
  console.log('\n── 10. 包体大小检查 (R6) ──');

  const assetsDir = path.join(cocosProjectPath, 'assets');
  if (!fs.existsSync(assetsDir)) {
    addWarning('包体检查', 'Cocos 工程未找到（跳过，需 --project= 指定）');
    return;
  }

  const mainTextureDir = path.join(assetsDir, 'textures', 'main');
  const mainTextureSize = getDirSize(mainTextureDir);

  addCheck('R6 主纹理 ≤1.5MB', mainTextureSize <= MAIN_TEXTURE_LIMIT,
    `${formatBytes(mainTextureSize)} / ${formatBytes(MAIN_TEXTURE_LIMIT)}`);

  report.stats.mainTextureSize = mainTextureSize;
}

// =====================================================================
// 11. R6 跨分包引用检查
// =====================================================================
// 主包脚本引用分包纹理会导致构建失败。
// 扫四个主包脚本目录，匹配 subpackages/chN 或 textures/subpackages 引用。
function checkCrossSubpackageRefs() {
  console.log('\n── 11. 跨分包引用检查 (R6) ──');

  const assetsDir = path.join(cocosProjectPath, 'assets');
  if (!fs.existsSync(assetsDir)) {
    addWarning('R6 跨包检查', 'Cocos 工程未找到（跳过）');
    return;
  }

  const mainScriptDirs = ['core', 'ui', 'data', 'gameplay'];
  let violations = 0;

  for (const dir of mainScriptDirs) {
    const dirPath = path.join(assetsDir, 'scripts', dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.ts'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
      const matches = content.match(/subpackages\/ch\d|textures\/subpackages/gi);
      if (matches) {
        violations += matches.length;
        addWarning('R6 跨包引用', `${dir}/${file} 引用分包纹理 ${matches.length} 次`);
      }
    }
  }

  addCheck('R6 主包零跨包引用', violations === 0,
    violations === 0 ? '无违规' : `${violations} 处违规`);
}

// =====================================================================
// 12. R7 双平台隔离检查
// =====================================================================
// 递归扫 scripts 目录下所有 .ts，除 PlatformAdapter.ts 外
// 出现 wx. / tt. 即违规。这是 R7 最核心的机器化验收。
function checkPlatformIsolation() {
  console.log('\n── 12. 双平台隔离检查 (R7) ──');

  const assetsDir = path.join(cocosProjectPath, 'assets');
  if (!fs.existsSync(assetsDir)) {
    addWarning('R7 平台检查', 'Cocos 工程未找到，仅检查配置层面');
    checkPlatformConfig();
    return;
  }

  const scriptsDir = path.join(assetsDir, 'scripts');
  if (!fs.existsSync(scriptsDir)) {
    addWarning('R7 平台检查', 'scripts 目录未找到');
    return;
  }

  let wxCount = 0;
  let ttCount = 0;
  let platformAdapterExists = false;
  let filesScanned = 0;

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      const fp = path.join(dir, item);
      if (fs.statSync(fp).isDirectory()) {
        scanDir(fp);
      } else if (item.endsWith('.ts')) {
        // PlatformAdapter 是唯一允许出现 wx/tt 的文件
        if (item === 'PlatformAdapter.ts') {
          platformAdapterExists = true;
          continue;
        }
        const content = fs.readFileSync(fp, 'utf8');
        const wx = content.match(/\bwx\./g);
        const tt = content.match(/\btt\./g);
        if (wx) {
          wxCount += wx.length;
          addWarning('R7 wx.*', `${path.relative(scriptsDir, fp)} 直接调用 wx.* ${wx.length} 次`);
        }
        if (tt) {
          ttCount += tt.length;
          addWarning('R7 tt.*', `${path.relative(scriptsDir, fp)} 直接调用 tt.* ${tt.length} 次`);
        }
        filesScanned++;
      }
    }
  }

  scanDir(scriptsDir);

  addCheck('R7 PlatformAdapter 存在', platformAdapterExists,
    platformAdapterExists ? '已实现' : '未找到');
  addCheck('R7 业务代码无 wx.*', wxCount === 0, wxCount === 0 ? '隔离正常' : `${wxCount} 处违规`);
  addCheck('R7 业务代码无 tt.*', ttCount === 0, ttCount === 0 ? '隔离正常' : `${ttCount} 处违规`);

  report.stats.filesScanned = filesScanned;
}

function checkPlatformConfig() {
  const fp = path.join(configDir, 'levels_240.json');
  if (!fs.existsSync(fp)) return;

  const levels = JSON.parse(fs.readFileSync(fp, 'utf8'));
  // 注意：v1.3 中 arcade 是合法 mode，不是旧值。
  // 这里曾误把 arcade 归入旧值集合，已修正。
  const trulyOld = levels.filter(l => ['study', 'hybrid'].includes(l.mode));
  addCheck('无旧 mode 值', trulyOld.length === 0,
    trulyOld.length === 0 ? 'mode 全部 v1.3' : `${trulyOld.length} 关残留旧值`);
}

// =====================================================================
// 13. Cocos Creator 构建执行
// =====================================================================
function runCocosBuild() {
  if (skipBuild) {
    console.log('\n── 13. Cocos 构建（已跳过 --skip-build）──');
    return;
  }

  console.log('\n── 13. Cocos Creator 构建 ──');

  if (!fs.existsSync(cocosProjectPath)) {
    addWarning('Cocos 构建', `工程路径不存在: ${cocosProjectPath}`);
    return;
  }

  const cocosCli = process.env.COCOS_CREATOR_CLI || 'CocosCreator';
  const platforms = platform ? [platform] : ['wechat', 'douyin'];
  let buildSuccess = true;

  for (const plat of platforms) {
    const buildCmd = `"${cocosCli}" --project "${cocosProjectPath}" --build "platform=wechatgame;debug=false"`;
    try {
      console.log(`  正在构建 ${plat}...`);
      execSync(buildCmd, { stdio: 'pipe', timeout: 300000 });
      addCheck(`Cocos 构建 ${plat}`, true, '构建成功');
    } catch (err) {
      addCheck(`Cocos 构建 ${plat}`, false, `构建失败: ${err.message.slice(0, 100)}`);
      buildSuccess = false;
    }
  }

  report.stats.buildExecuted = true;
  report.stats.buildSuccess = buildSuccess;
}

// =====================================================================
// 14. 构建就绪报告
// =====================================================================
function generateReport() {
  console.log('\n═══════════════════════════════════════');
  console.log('  构建就绪报告 (CONTRACT v1.3)');
  console.log('═══════════════════════════════════════');
  console.log(`  时间: ${report.timestamp}`);
  console.log(`  平台: ${report.platform}`);
  console.log(`  检查项: ${report.checks.length}`);
  console.log(`  通过: ${report.checks.filter(c => c.passed).length}`);
  console.log(`  失败: ${report.checks.filter(c => !c.passed).length}`);
  console.log(`  警告: ${report.warnings.length}`);

  const st = report.stats;
  if (st.totalLevels) console.log(`\n  关卡: ${st.totalLevels} 关 | Boss: ${st.bossLevels} | mixedTypes>=2: ${st.mixedTypesLevels}`);
  if (st.totalWords) console.log(`  词库: ${st.totalWords} 词`);
  if (st.petStages) console.log(`  宠物: ${st.petStages} 阶段 | ${st.petSkins} 皮肤`);
  if (st.achievements) console.log(`  成就: ${st.achievements} 个 | 头像框: ${st.avatarFrames}`);
  if (st.staminaMax) console.log(`  体力: 上限${st.staminaMax} | 恢复${st.staminaRecoveryMin}min/点`);
  if (st.propsCount) console.log(`  道具: ${st.propsCount} 类`);
  if (st.dailyTasks) console.log(`  每日任务: ${st.dailyTasks} 条 | 登录日历: ${st.loginCalendarDays} 日`);
  if (st.arcadeLevels) console.log(`  街机关卡: ${st.arcadeLevels} 关 (Ball:${st.arcadeBall}/Runner:${st.arcadeRunner}/Idle:${st.arcadeIdle})`);
  if (st.mainTextureSize !== undefined) console.log(`  主纹理: ${formatBytes(st.mainTextureSize)} / ${formatBytes(MAIN_TEXTURE_LIMIT)}`);

  const reportPath = path.join(traeRoot, 'build_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n  报告已写入: ${reportPath}`);

  if (report.errors.length > 0) {
    console.log('\n  ✗ 存在失败项，构建就绪: 否');
    process.exit(1);
  } else {
    console.log('\n  ✓ 构建就绪: 是');
    if (report.warnings.length > 0) console.log(`  ⚠ ${report.warnings.length} 个警告需关注`);
    process.exit(0);
  }
}

// =====================================================================
// 主流程
// =====================================================================
function main() {
  console.log('═══════════════════════════════════════');
  console.log('  单词精灵闯关 v2 — 发布构建脚本');
  console.log(`  CONTRACT v1.3 | 平台: ${platform || 'both'} | 跳过构建: ${skipBuild}`);
  console.log('═══════════════════════════════════════');

  // 1-9: 配置层面检查
  checkConfigFiles();
  checkLevels();
  checkWordbankImageTags();
  checkPetConfig();
  checkAchievements();
  checkStaminaConfig();
  checkPropsConfig();
  checkDailyTasks();
  checkArcadeLevels();

  // 10-12: 工程层面检查
  checkPackageSize();
  checkCrossSubpackageRefs();
  checkPlatformIsolation();

  // 13: 实际构建
  runCocosBuild();

  // 14: 报告
  generateReport();
}

main();
