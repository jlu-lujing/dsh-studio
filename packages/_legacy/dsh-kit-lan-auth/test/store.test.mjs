import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore, lanAuthRoot } from '../src/store.ts'

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

const stateFile = (dir) => join(dir, 'dsh-kit-lan-auth', 'state.json')
const readState = (dir) => JSON.parse(readFileSync(stateFile(dir), 'utf8'))

test('lanAuthRoot 解析：$DSH_HOME 优先，缺省 $HOME/.dsh', () => {
  assert.equal(lanAuthRoot('/x/dsh'), '/x/dsh')
  assert.equal(lanAuthRoot(), join(process.env.HOME ?? '.', '.dsh'))
})

test('createUser / checkLogin / loginToken：scrypt 哈希往返', async () => {
  const dir = tempDir('lan-auth-store-1-')
  try {
    const s = createStore(dir)
    s.load()
    const u = await s.createUser('alice', 'correct horse battery')
    assert.ok(u)
    assert.equal(await s.checkLogin('alice', 'correct horse battery'), true)
    assert.equal(await s.checkLogin('alice', 'wrong'), false)
    assert.equal(await s.checkLogin('nobody', 'x'), false)

    // 落盘是 scrypt 形态（salt:key），不是 64-hex sha256
    const hash = readState(dir).users[0].passwordHash
    assert.equal(/^[0-9a-f]{64}$/.test(hash), false)
    assert.ok(hash.includes(':'))

    const tok = await s.loginToken('alice', 'correct horse battery')
    assert.ok(tok)
    assert.equal(s.checkToken(tok), true)
    // 同密码不能创建重名用户
    assert.equal(await s.createUser('alice', 'x'), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('迁移：旧 sha256 哈希登录成功即原地升级为 scrypt', async () => {
  const dir = tempDir('lan-auth-store-2-')
  try {
    const s = createStore(dir)
    s.load()
    await s.createUser('bob', 'firstpass') // 生成 scrypt
    const legacy = createHash('sha256').update('oldpass').digest('hex')
    const st = readState(dir)
    st.users[0].passwordHash = legacy
    writeFileSync(stateFile(dir), JSON.stringify(st, null, 2))

    const migrated = createStore(dir)
    migrated.load()
    assert.equal(await migrated.checkLogin('bob', 'oldpass'), true)
    assert.equal(await migrated.checkLogin('bob', 'wrong'), false)

    const tok = await migrated.loginToken('bob', 'oldpass') // 触发升级
    assert.ok(tok)
    const after = readState(dir)
    assert.notEqual(after.users[0].passwordHash, legacy) // 已替换
    assert.ok(after.users[0].passwordHash.includes(':'))
    assert.equal(migrated.checkToken(tok), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('token：静态/会话 token 持久化与注销', async () => {
  const dir = tempDir('lan-auth-store-3-')
  try {
    const s = createStore(dir)
    s.load()
    const t = s.createToken('ci', 60 * 1000)
    assert.equal(s.checkToken(t.token), true)
    assert.equal(s.checkToken('nope'), false)
    assert.equal(s.revokeToken(t.token), true)
    assert.equal(s.checkToken(t.token), false)
    // session token 登录
    await s.createUser('carol', 'pw')
    const tok = await s.loginToken('carol', 'pw')
    assert.ok(tok)
    assert.ok(readState(dir).tokens.some((x) => x.name === 'session:carol'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
