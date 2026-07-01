import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import {
  buildGeneratePrompt,
  buildProfilePrompt,
  buildPromptProfilePrompt,
  buildStylePrompt,
  runCodexTask,
} from '../lib/runner.mjs';

test('builds a structured reusable style task from one user prompt', () => {
  const prompt = buildStylePrompt({ rootDir: '/repo', description: '柔和雨夜人像', stagingPath: '/repo/.control/style.json' });
  assert.match(prompt, /system\/rules\/style_base\.md/);
  assert.match(prompt, /柔和雨夜人像/);
  assert.match(prompt, /\/repo\/\.control\/style\.json/);
  assert.match(prompt, /真实重大伤亡|恐怖袭击/);
  assert.match(prompt, /rejected/);
  assert.match(prompt, /不得.*五官|删除.*五官/);
});

function childResult({ code = 0, stderr = '', stdout = '' } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  queueMicrotask(() => {
    child.stdout.end(stdout);
    child.stderr.end(stderr);
    child.emit('close', code, null);
  });
  return child;
}

test('uses codex exec with workspace-write and never passes an API key', async () => {
  const calls = [];
  await runCodexTask({
    prompt: 'task',
    rootDir: '/workspace',
    codexPath: '/usr/bin/codex',
    miniModel: 'gpt-5-mini',
    env: { PATH: '/bin', OPENAI_API_KEY: 'must-not-leak' },
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return childResult();
    },
  });
  assert.equal(calls[0].command, '/usr/bin/codex');
  assert.deepEqual(calls[0].args.slice(0, 7), ['exec', '--skip-git-repo-check', '-C', '/workspace', '-s', 'workspace-write', '--json']);
  assert.equal(calls[0].args.includes('gpt-5-mini'), true);
  assert.equal('OPENAI_API_KEY' in calls[0].options.env, false);
});

test('uses the Codex executable supplied by bootstrap', async () => {
  const calls = [];
  await runCodexTask({
    prompt: 'task', rootDir: '/workspace', miniModel: '',
    env: { PHOTO_CODEX_PATH: '/portable/Codex/codex' },
    spawnImpl: (command) => {
      calls.push(command);
      return childResult();
    },
  });
  assert.deepEqual(calls, ['/portable/Codex/codex']);
});

test('tries the configured mini model before default fallback', async () => {
  const calls = [];
  await runCodexTask({
    prompt: 'task', rootDir: '/workspace', miniModel: 'missing-mini',
    spawnImpl: (_command, args) => {
      calls.push(args);
      return calls.length === 1
        ? childResult({ code: 1, stderr: 'unknown model missing-mini' })
        : childResult();
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].includes('missing-mini'), true);
  assert.equal(calls[1].includes('-m'), false);
});

test('uses the low-token orchestration model by default and reports usage', async () => {
  let args;
  const result = await runCodexTask({
    prompt: 'task', rootDir: '/workspace', env: {},
    spawnImpl: (_command, received) => {
      args = received;
      return childResult({ stdout: '{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":3}}\n' });
    },
  });
  assert.equal(args.includes('gpt-5.4-mini'), true);
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 3, totalTokens: 15 });
});

test('classifies quota exhaustion for resumable generation', async () => {
  await assert.rejects(
    runCodexTask({ prompt: 'task', rootDir: '/workspace', miniModel: '', spawnImpl: () => childResult({ code: 1, stderr: 'usage limit reached' }) }),
    { code: 'CODEX_QUOTA_EXHAUSTED' },
  );
});

test('requires image_gen and gpt-image-2-or-newer in image prompts', () => {
  for (const prompt of [
    buildGeneratePrompt({ profileIds: ['mama'], styleId: 'sticker', format: { id: 'l', width: 1051, height: 1500 }, extraPrompt: '', quantity: 1, outputPaths: ['/repo/output/1.png'] }),
    buildProfilePrompt({ inputId: 'mama', imagePaths: ['/repo/input/mama/1.jpg'] }),
    buildPromptProfilePrompt({ profileId: '角色1', description: '虚构外星人', outputPath: '/repo/profiles/角色1/multiview_reference.png' }),
  ]) {
    assert.match(prompt, /内置 image_gen/);
    assert.match(prompt, /gpt-image-2/);
    assert.match(prompt, /OPENAI_API_KEY/);
  }
});

test('builds final jobs from every selected profile and session prompt only', () => {
  const prompt = buildGeneratePrompt({
    rootDir: '/repo', profileIds: ['mama', 'baba'], styleId: 'sticker', quantity: 2,
    format: { id: 'jp_l', width: 1051, height: 1500 }, extraPrompt: '生成合照',
    outputPaths: ['/repo/output/one.png', '/repo/output/two.png'],
  });
  assert.match(prompt, /profiles\/mama\/multiview_reference\.png/);
  assert.match(prompt, /profiles\/baba\/multiview_reference\.png/);
  assert.match(prompt, /styles\/sticker\.md/);
  assert.match(prompt, /1051 x 1500/);
  assert.match(prompt, /生成合照/);
  assert.match(prompt, /2 张/);
  assert.match(prompt, /one\.png/);
  assert.match(prompt, /two\.png/);
  assert.match(prompt, /每个人只能对应自己的多视图参考/);
  assert.match(prompt, /身份一致性硬要求/);
  assert.match(prompt, /不能只是相似/);
  assert.match(prompt, /通用模特脸/);
  assert.match(prompt, /禁止参照人物设定中的服饰/);
  assert.match(prompt, /严格使用 style 的服饰语言/);
  assert.match(prompt, /不得替换、弱化、重解释/);
  assert.match(prompt, /最适合该照片风格的服饰/);
  assert.match(prompt, /style_id、文件名和文件路径只是内部标识/);
  assert.match(prompt, /不得从标识里的 woman、girl、man、group/);
  assert.match(prompt, /Source Prompt 只作为来源记录/);
  assert.match(prompt, /最终照片必须保留足够清晰可见的人脸/);
  assert.doesNotMatch(prompt, /input\/mama/);
});

test('builds native landscape generation instructions', () => {
  const prompt = buildGeneratePrompt({
    rootDir: '/repo', profileIds: ['mama'], styleId: 'sticker', orientation: 'landscape',
    format: { id: 'jp_l', width: 1500, height: 1051 }, quantity: 1,
    outputPaths: ['/repo/output/landscape.png'],
  });
  assert.match(prompt, /照片方向为横向/);
  assert.match(prompt, /1500 x 1051/);
  assert.match(prompt, /不得先按另一方向生成后旋转或裁切/);
  assert.match(prompt, /不要因照片方向增加白边或通用安全边距/);
});

test('builds profile jobs from every image in one input directory', () => {
  const prompt = buildProfilePrompt({
    rootDir: '/repo', inputId: 'mama',
    imagePaths: ['/repo/input/mama/a.jpg', '/repo/input/mama/b.png'],
  });
  assert.match(prompt, /a\.jpg/);
  assert.match(prompt, /b\.png/);
  assert.match(prompt, /同一个人/);
  assert.match(prompt, /2 x 3/);
  assert.match(prompt, /胸像/);
  assert.match(prompt, /直接覆盖/);
  assert.match(prompt, /profiles\/mama\/multiview_reference\.png/);
  assert.match(prompt, /yaw 0/);
  assert.match(prompt, /yaw -45/);
  assert.match(prompt, /yaw \+90/);
  assert.match(prompt, /85mm/);
  assert.match(prompt, /正面身份锚点/);
});

test('builds described profile jobs with real and fictional branches', () => {
  const prompt = buildPromptProfilePrompt({
    profileId: '角色1',
    description: '一位电影中的虚构外星人',
    outputPath: '/repo/profiles/角色1/multiview_reference.png',
  });
  assert.match(prompt, /先判断.*真实存在/);
  assert.match(prompt, /互联网搜索/);
  assert.match(prompt, /直接作为图像参考/);
  assert.match(prompt, /不是现实人物/);
  assert.match(prompt, /虚构外星人/);
  assert.match(prompt, /2 x 3/);
  assert.match(prompt, /胸像/);
  assert.match(prompt, /profiles\/角色1\/multiview_reference\.png/);
  assert.match(prompt, /不得保存提示词/);
});

test('lets the AI name an unnamed described profile and report the chosen id', () => {
  const prompt = buildPromptProfilePrompt({
    rootDir: '/repo',
    description: '一位来自木星的虚构外交官',
    stagingPath: '/repo/.control/profile-job.png',
    manifestPath: '/repo/.control/profile-job.json',
    existingProfileIds: ['mama', '星河'],
  });
  assert.match(prompt, /自行确定一个简短、明确的名称/);
  assert.match(prompt, /真实人物使用能够确认的常用姓名/);
  assert.match(prompt, /原创虚构人物根据设定命名/);
  assert.match(prompt, /不得使用这些已有名称：mama、星河/);
  assert.match(prompt, /临时路径 \/repo\/\.control\/profile-job\.png/);
  assert.match(prompt, /不要自行创建或修改任何 profiles 子目录/);
  assert.match(prompt, /profile-job\.json/);
});
