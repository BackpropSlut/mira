import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCrisis } from '../src/crisis.js';

test('острый риск: модель не нужна', () => {
  for (const t of [
    'я не хочу жить',
    'Хочу умереть',
    'думаю покончить с собой',
    'лучше бы меня не было',
    'опять режу себя',
    'мысли о суициде',
    'хочется выпилиться',
    'без меня всем будет лучше',
    'Меня бьют дома',
  ]) assert.equal(detectCrisis(t), 'acute', t);
});

test('дистресс: отвечает модель, бот добавляет контакты', () => {
  for (const t of ['мне очень плохо', 'Не могу больше', 'нет сил ни на что', 'у меня паника', 'кажется паническая атака', 'задыхаюсь'])
    assert.equal(detectCrisis(t), 'distress', t);
});

test('обычные сообщения не трогаем', () => {
  for (const t of ['завтра экзамен, тревожно', 'не могу уснуть', 'поругалась с мамой', 'Хочу разобрать мысль', 'устал после работы'])
    assert.equal(detectCrisis(t), null, t);
});

test('ё и регистр не мешают', () => {
  assert.equal(detectCrisis('ОН МЕНЯ БЬЁТ'), 'acute');
  assert.equal(detectCrisis('он меня бьет'), 'acute');
  assert.equal(detectCrisis('Мне   ОЧЕНЬ\nплохо'), 'distress');
});
