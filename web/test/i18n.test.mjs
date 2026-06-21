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

test('translates new batch generation and custom format labels without falling back', () => {
  const expected = {
    zh: {
      'button.selectAllStyles': '全选可见风格',
      'button.clearVisibleStyles': '清空可见风格',
      'button.onlyUngenerated': '仅看未生成',
      'style.neverGenerated': '从未生成',
      'summary.styleCount': '已选 2 种风格',
      'summary.styleOrder': '顺序：film -> sticker',
      'loading.batchProgress': '2 / 5',
      'task.batchComplete': '批次生成完成',
      'task.batchPartialFailure': '批次部分生成失败',
      'error.STYLES_INVALID': '请至少选择一个风格',
      'error.BATCH_NOT_FOUND': '批次不存在或已结束',
      'format.custom': '自定义尺寸',
      'field.shortEdge': '短边',
      'field.longEdge': '长边',
      'field.pixels': '像素',
      'hint.customFormat': '短边和长边均需为 256–8192 像素，总像素不超过 4000 万；方向由照片方向控制。',
      'error.CUSTOM_FORMAT_REQUIRED': '请选择自定义尺寸并填写短边与长边',
      'error.CUSTOM_FORMAT_INVALID': '自定义尺寸必须为 256 到 8192 的整数，短边不能大于长边，且总像素不超过 4000 万',
      'help.step2': '生成照片：选择一个或多个人物、一个或多个风格、打印格式、照片方向和数量。风格按选择顺序依次生成，数量对每个风格分别生效，可填写本次额外要求。',
    },
    ja: {
      'button.selectAllStyles': '表示中を全選択',
      'button.clearVisibleStyles': '表示中を全解除',
      'button.onlyUngenerated': '未生成のみ',
      'style.neverGenerated': '未生成',
      'summary.styleCount': '2件のスタイルを選択中',
      'summary.styleOrder': '順序: film -> sticker',
      'loading.batchProgress': '2 / 5',
      'task.batchComplete': 'バッチ生成が完了しました',
      'task.batchPartialFailure': 'バッチ生成は一部失敗しました',
      'error.STYLES_INVALID': 'スタイルを1件以上選択してください',
      'error.BATCH_NOT_FOUND': 'バッチが存在しないか、すでに終了しています',
      'format.custom': 'カスタムサイズ',
      'field.shortEdge': '短辺',
      'field.longEdge': '長辺',
      'field.pixels': 'px',
      'hint.customFormat': '短辺と長辺は各 256〜8192 px、合計 4000 万画素以下です。向きは写真の向き設定で制御します。',
      'error.CUSTOM_FORMAT_REQUIRED': 'カスタムサイズを選択し、短辺と長辺を入力してください',
      'error.CUSTOM_FORMAT_INVALID': 'カスタムサイズは 256 から 8192 の整数で、短辺は長辺以下、合計 4000 万画素以下にしてください',
      'help.step2': '写真生成：1人以上の人物、1件以上のスタイル、プリント形式、写真の向き、枚数を選びます。スタイルは選択順に生成され、枚数は各スタイルごとに適用されます。必要なら今回の追加要望も入力できます。',
    },
    en: {
      'button.selectAllStyles': 'Select visible',
      'button.clearVisibleStyles': 'Clear visible',
      'button.onlyUngenerated': 'Only new',
      'style.neverGenerated': 'Never generated',
      'summary.styleCount': '2 styles selected',
      'summary.styleOrder': 'Order: film -> sticker',
      'loading.batchProgress': '2 / 5',
      'task.batchComplete': 'Batch complete',
      'task.batchPartialFailure': 'Batch completed with some failures',
      'error.STYLES_INVALID': 'Select at least one style',
      'error.BATCH_NOT_FOUND': 'Batch not found or already finished',
      'format.custom': 'Custom size',
      'field.shortEdge': 'Short edge',
      'field.longEdge': 'Long edge',
      'field.pixels': 'px',
      'hint.customFormat': 'Each edge must be 256–8192 px with at most 40 million pixels total; orientation follows the photo orientation setting.',
      'error.CUSTOM_FORMAT_REQUIRED': 'Choose custom size and enter both short and long edges',
      'error.CUSTOM_FORMAT_INVALID': 'Custom size must use integers from 256 to 8192, the short edge cannot exceed the long edge, and the total cannot exceed 40 million pixels',
      'help.step2': 'Photo generation: choose one or more people, one or more styles, a print format, photo orientation, and quantity. Styles run in selection order, and quantity applies to each style. You can also add a one-time request for this run.',
    },
  };

  for (const [language, entries] of Object.entries(expected)) {
    for (const [key, value] of Object.entries(entries)) {
      if (key === 'summary.styleCount') {
        assert.equal(translate(language, key, { count: 2 }), value);
        continue;
      }
      if (key === 'summary.styleOrder') {
        assert.equal(translate(language, key, { order: 'film -> sticker' }), value);
        continue;
      }
      if (key === 'loading.batchProgress') {
        assert.equal(translate(language, key, { current: 2, total: 5 }), value);
        continue;
      }
      assert.equal(translate(language, key), value);
    }
  }
});

test('keeps new batch interpolation placeholders live in every supported language', () => {
  assert.equal(translate('zh', 'summary.styleCount', { count: 3 }), '已选 3 种风格');
  assert.equal(translate('ja', 'summary.styleOrder', { order: 'A -> B -> C' }), '順序: A -> B -> C');
  assert.equal(translate('en', 'loading.batchProgress', { current: 4, total: 9 }), '4 / 9');
  assert.equal(translate('en', 'task.batchPartialFailure'), 'Batch completed with some failures');
});

test('localizes registered print format labels in every supported language', () => {
  assert.equal(translate('zh', 'format.jp_711_photo_l_1051x1500'), '7-Eleven L 相纸');
  assert.equal(translate('ja', 'format.jp_photo_mutsugiri_2398x3000'), '六切');
  assert.equal(translate('en', 'format.intl_photo_8x10_2400x3000'), '8 × 10 inch');
});
