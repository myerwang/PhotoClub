import { spawn } from 'node:child_process';
import path from 'node:path';

import { AppError } from './errors.mjs';

const DEFAULT_CODEX_PATH = '/Applications/Codex.app/Contents/Resources/codex';

function noApiKeyEnvironment(env) {
  const sanitized = { ...env };
  delete sanitized.OPENAI_API_KEY;
  return sanitized;
}

function invoke({ codexPath, args, env, spawnImpl, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const child = spawnImpl(codexPath, args, {
      cwd: args[args.indexOf('-C') + 1],
      env: noApiKeyEnvironment(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });

    const abort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', (error) => {
      signal?.removeEventListener('abort', abort);
      reject(error);
    });
    child.once('close', (code, exitSignal) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(signal.reason);
      resolve({ code, signal: exitSignal, stdout, stderr });
    });
  });
}

export async function runCodexTask({
  prompt,
  rootDir,
  codexPath = DEFAULT_CODEX_PATH,
  miniModel = process.env.PHOTO_CODEX_MINI_MODEL || '',
  env = process.env,
  spawnImpl = spawn,
  signal,
}) {
  const baseArgs = [
    'exec', '--skip-git-repo-check', '-C', rootDir,
    '-s', 'workspace-write', '--json',
  ];
  const firstArgs = [...baseArgs, ...(miniModel ? ['-m', miniModel] : []), prompt];
  let result = await invoke({ codexPath, args: firstArgs, env, spawnImpl, signal });

  if (result.code !== 0 && miniModel && /unknown\s+model|model.+not found/i.test(result.stderr)) {
    result = await invoke({ codexPath, args: [...baseArgs, prompt], env, spawnImpl, signal });
  }
  if (result.code !== 0) {
    throw new AppError('CODEX_TASK_FAILED', '独立 Codex 任务执行失败', 500, {
      exitCode: result.code,
      log: result.stderr.slice(-4_000),
    });
  }
  return result;
}

function imageGenerationRequirements() {
  return `执行要求：\n- 必须使用 Codex 内置 image_gen 生图能力，图像能力不得低于 gpt-image-2。\n- 不得调用 API、不得读取或要求 OPENAI_API_KEY、不得使用需要 API key 的脚本。\n- 必须把最终图片复制或移动到指定项目路径，并验证文件存在且可读。`;
}

function standardMultiviewRequirements() {
  return `只生成一张专业人物转面参考表：标准横向 2 x 3 接触表，六个视图在同一次生成中共享同一身份约束。将左上正面视图作为正面身份锚点，再以该锚点约束其余角度。
视图按固定相机 yaw 排列：左上正面 yaw 0°；上中左前侧 yaw -45°；上右右前侧 yaw +45°；下左左侧 yaw -90°；下中右侧 yaw +90°；下右背面 yaw 180°。所有视图 pitch 0°、roll 0°，眼平机位，约 85mm 等效焦段，固定相机距离。
六格必须使用完全一致的头部尺寸、胸像裁切、肩线高度、姿态、发型状态、素色衣服、自然中性表情、闭嘴、柔和均匀正面光和近白背景。只允许绕垂直轴转动人物，不得镜像复制左右视图；耳朵、发际线、发量、配饰和头部轮廓必须跨视图几何一致。
禁止全身、半身、腰部以上、纯脸部、广角透视、俯拍、仰拍、混合比例、文字标签、边框、分隔线、道具和装饰。人物设定中不得包含任何风格内容或提示词。`;
}

export function buildGeneratePrompt({ rootDir = '/Users/yohji/photo', profileIds, styleId, format, orientation = 'portrait', extraPrompt = '', quantity = 1, outputPaths }) {
  const identities = profileIds.map((profileId, index) =>
    `${index + 1}. 人物 ${profileId}：${path.join(rootDir, 'profiles', profileId, 'multiview_reference.png')}`,
  ).join('\n');
  const stylePath = path.join(rootDir, 'styles', `${styleId}.md`);
  const targets = outputPaths.map((outputPath, index) => `${index + 1}. ${outputPath}`).join('\n');
  const orientationLabel = orientation === 'landscape' ? '横向' : '纵向';
  return `在照片项目中生成最终风格照片。\n\n${imageGenerationRequirements()}\n\n身份输入：只使用以下人物多视图文件，禁止读取或使用 input 目录原图：\n${identities}\n\n每个人只能对应自己的多视图参考。直接把所有列出的多视图参考图一并喂给图像模型；不要用文字描写或重建五官；不得混合、互换、复制或遗漏人物身份。每张结果都必须让所有选中人物同时出现在同一张照片中，形成多人物合照。\n风格规则：读取并严格执行 ${stylePath}。风格规则不得限制人物属性。\n输出格式：${format.id}，照片方向为${orientationLabel}，每张最终文件必须原生构图并精确生成为 ${format.width} x ${format.height} 像素。不得先按另一方向生成后旋转或裁切。不要因照片方向增加白边或通用安全边距；安全边距仅在所选风格规则明确要求时应用。\n本次临时要求：${extraPrompt.trim() || '无'}。本次要求只用于当前任务，不得写回风格文件。\n生成数量：严格生成 ${quantity} 张。每张图片必须分别调用一次内置 image_gen，不能把多张结果拼成一张图。\n最终路径按顺序保存：\n${targets}\n验证每个目标文件均存在且可读后才能结束任务。`;
}

export function buildProfilePrompt({ rootDir = '/Users/yohji/photo', inputId, imagePaths, outputPath }) {
  const finalPath = outputPath ?? path.join(rootDir, 'profiles', inputId, 'multiview_reference.png');
  const references = imagePaths.map((imagePath, index) => `${index + 1}. ${imagePath}`).join('\n');
  return `为人物 ${inputId} 生成人物设定多视图。\n\n${imageGenerationRequirements()}\n\n以下所有图片都是同一个人，必须逐一作为直接图片参考输入并明确按编号关联到同一身份，不得从文字描述五官：\n${references}\n\n${standardMultiviewRequirements()}\n最终路径：${finalPath}。同名重新生成时直接覆盖该 multiview_reference.png；只保存这一张成果图。`;
}

export function buildPromptProfilePrompt({ rootDir = '/Users/yohji/photo', profileId, description, outputPath, stagingPath, manifestPath, existingProfileIds = [] }) {
  const naming = profileId
    ? `人物名称已指定为 ${profileId}，不得改名。`
    : `用户未指定人物名称。请在判断人物身份后自行确定一个简短、明确的名称：真实人物使用能够确认的常用姓名；原创虚构人物根据设定命名。名称必须是单个连续标识，只能包含中文、英文字母、数字或日文假名，不能包含空格、下划线、连字符或标点。不得使用这些已有名称：${existingProfileIds.join('、') || '无'}；如冲突需另选名称。`;
  const destination = profileId
    ? `最终路径：${outputPath}。同名重新生成时直接覆盖该 multiview_reference.png；只保存这一张成果图。`
    : `把唯一成果图保存到临时路径 ${stagingPath}，不要自行创建或修改任何 profiles 子目录。随后将严格 JSON {"profileId":"<你确定的名称>"} 写入 ${manifestPath}，不得添加 Markdown 或其他字段。必须验证临时图片和名称结果文件都存在且可读；后台校验名称后会把图片放入正式人物目录。`;
  return `根据用户描述生成人物设定多视图。\n\n${imageGenerationRequirements()}\n\n用户原始描述：\n${description}\n\n${naming}\n\n先判断描述对象是否是真实存在的人物，再严格二选一执行：
1. 如果是真实存在的人物：必须先使用互联网搜索该特定人物的公开图片素材。选择多张清晰、身份可靠、角度互补、无遮挡且适合身份参照的照片；把选中的图片直接作为图像参考喂给 image_gen，并明确它们是同一个人。不得仅凭姓名、常识或文字描述重建其五官。搜索结果只用于当前任务，不得保存进人物目录。
2. 如果不是现实人物：不要搜索或借用现实人物照片，直接以用户描述作为虚构人物的视觉设计依据。此分支允许用户描述外观、长相、物种和虚构设定。

已有电影、游戏、动漫或文学中的虚构角色仍属于非现实人物，按第 2 分支直接生成。无法确认是真实人物时也按第 2 分支处理，不得随意套用网络上同名者的照片。

${standardMultiviewRequirements()}
人物目录中只允许保留最终图片，不得保存提示词、判断记录、网页素材、来源图片、文字设定或其他文件。
${destination}`;
}
