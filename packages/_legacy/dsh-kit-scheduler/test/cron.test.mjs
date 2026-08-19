import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCron } from '../src/index.ts'

test('parseCron：标准五字段表达式可解析（锚定既有行为）', () => {
  const f = parseCron('0 9 * * 1-5')
  assert.ok(f)
  assert.deepEqual([...f[0]], [0])
  assert.deepEqual([...f[1]], [9])
  assert.equal(f[2].size, 31)
  assert.equal(f[3].size, 12)
  assert.deepEqual([...f[4]], [1, 2, 3, 4, 5])
})

test('parseCron：步长 / 区间 / 列表 / 单值语法', () => {
  assert.deepEqual([...parseCron('*/15 * * * *')[0]], [0, 15, 30, 45])
  assert.deepEqual([...parseCron('0-30/10 * * * *')[0]], [0, 10, 20, 30])
  assert.deepEqual([...parseCron('1,15,30 * * * *')[0]], [1, 15, 30])
  assert.deepEqual([...parseCron('45 * * * *')[0]], [45])
  assert.deepEqual([...parseCron('* * * * *')[0]], Array.from({ length: 60 }, (_, i) => i))
})

test('parseCron：step=0 必须被拒绝（回归：曾死循环挂起事件循环）', () => {
  // 这些输入修复前会让 `for (i = lo; i <= hi; i += 0)` 无限循环：
  assert.equal(parseCron('*/0 * * * *'), undefined)
  assert.equal(parseCron('0 */0 * * *'), undefined)
  assert.equal(parseCron('5/0 * * * *'), undefined)
  assert.equal(parseCron('0-30/0 * * * *'), undefined)
})

test('parseCron：非法输入被拒绝且不挂起', () => {
  assert.equal(parseCron('abc * * * *'), undefined) // 非数字
  assert.equal(parseCron('5-1 * * * *'), undefined) // 反向区间
  assert.equal(parseCron(',, * * * *'), undefined)  // 空 token
  assert.equal(parseCron('* * * *'), undefined)     // 4 字段
  assert.equal(parseCron('* * * * * *'), undefined) // 6 字段
  assert.equal(parseCron(''), undefined)            // 空串
})
