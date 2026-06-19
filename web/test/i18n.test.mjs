import test from 'node:test';
import assert from 'node:assert/strict';

import { LANGUAGE_LOCALES, normalizeLanguage, translate } from '../i18n.mjs';

test('translates core UI labels in Chinese Japanese and English', () => {
  assert.equal(translate('zh', 'button.generate'), '生成照片');
  assert.equal(translate('ja', 'button.generate'), '写真を生成');
  assert.equal(translate('en', 'button.generate'), 'Generate photos');
  assert.equal(LANGUAGE_LOCALES.ja, 'ja-JP');
});

test('interpolates dynamic values and falls back safely', () => {
  assert.equal(translate('en', 'count.people', { count: 3 }), '3 people');
  assert.equal(translate('ja', 'aria.deleteProfile', { name: 'mama' }), '人物 mama を削除');
  assert.equal(normalizeLanguage('fr'), 'zh');
  assert.equal(translate('fr', 'field.portrait'), '纵向');
});

test('translates live dynamic interface text', () => {
  assert.equal(translate('ja', 'aria.deleteProfile', { name: 'mama' }), '人物 mama を削除');
  assert.equal(translate('en', 'summary.noPeople'), 'No people selected');
  assert.equal(translate('en', 'count.stylesOne', { count: 1 }), '1 style');
  assert.equal(translate('zh', 'connection.retrying'), '事件连接正在重试');
});

test('translates explicit service shutdown controls', () => {
  assert.equal(translate('zh', 'button.shutdown'), '关闭服务');
  assert.equal(translate('ja', 'button.shutdown'), 'サービスを終了');
  assert.equal(translate('en', 'button.shutdown'), 'Shut down service');
  assert.match(translate('en', 'confirm.shutdown'), /running task/i);
});
