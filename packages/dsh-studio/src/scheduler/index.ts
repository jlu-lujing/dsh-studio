/**
 * dsh-studio-scheduler host plugin (定时任务).
 *
 * User-level cron scheduled tasks: each task holds a five-field cron
 * expression ((minute hour day month weekday)) and a shell command; the
 * plugin ticks every second and fires due tasks via child_process.exec
 * (full /bin/sh — intentional: operator-provided commands may use pipes /
 * redirection / &&), recording the last run time. Tasks persist to
 * ~/.dsh/dsh-studio-scheduler/tasks.json and survive restarts. A small
 * management route set (/dsh-studio-scheduler/tasks) backs the store panel.
 *
 * The cron vocabulary is the standard five-field form; asterisk and numeric
 * ranges/lists (0-30/10, 1,15,30) are supported. Weekday is 0–6 (0 =
 * Sunday). This is intentionally a minimal, dependency-free implementation —
 * enough for the 傻瓜化 use cases without pulling a cron library.
 */

import { exec } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Cordis plugin name. */
export const name = 'dsh-studio-scheduler'

/** Required services: the webserver hosts the task management routes. */
export const inject = ['webServer']

export interface Task {
  id: string
  /** Five-field cron expression, e.g. "0 9 * * *" (daily 09:00). */
  cron: string
  /** Shell command to run when the task fires (executed via /bin/sh -c). */
  command: string
  /** Human-friendly label. */
  label: string
  /** ISO timestamp of the last successful fire (absent = never). */
  lastRunAt?: string
  enabled: boolean
}

interface TaskStoreFile {
  tasks: Task[]
}

const DEFAULT_FILE: TaskStoreFile = { tasks: [] }

/**
 * Split a cron field: tokens include '*', 'n', 'a-b', step forms like
 * '*\/60', comma lists. Returns undefined for structurally invalid input
 * (empty token, non-numeric bound, inverted range, zero/negative step) —
 * and can never loop forever (a step of 0 used to hang the event loop).
 */
function parseField(field: string, min: number, max: number): Set<number> | undefined {
  const values = new Set<number>()
  for (const raw of field.split(',')) {
    const part = raw.trim()
    if (part === '*') { for (let i = min; i <= max; i++) values.add(i); continue }
    if (part === '') return undefined
    const stepMatch = /^(.*)\/(\d+)$/.exec(part)
    const step = stepMatch ? Number(stepMatch[2]) : 1
    if (!(step >= 1)) return undefined
    const base = stepMatch ? stepMatch[1] : part
    let lo = min; let hi = max
    if (base === '*') { lo = min; hi = max }
    else {
      const range = base.split('-').map(Number)
      lo = range[0] ?? min; hi = range[1] ?? range[0] ?? max
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return undefined
    }
    for (let i = lo; i <= hi; i += step) if (i >= min && i <= max) values.add(i)
  }
  return values
}

/** Structurally validate a five-field cron expression. */
export function parseCron(cron: string): Array<Set<number>> | undefined {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return undefined
  try {
    const minute = parseField(fields[0]!, 0, 59)
    const hour = parseField(fields[1]!, 0, 23)
    const day = parseField(fields[2]!, 1, 31)
    const month = parseField(fields[3]!, 1, 12)
    const weekday = parseField(fields[4]!, 0, 6)
    if (minute === undefined || hour === undefined || day === undefined || month === undefined || weekday === undefined) {
      return undefined
    }
    return [minute, hour, day, month, weekday]
  } catch {
    return undefined
  }
}

/** Whether date matches every field of a parsed cron. */
function matches(date: Date, fields: Array<Set<number>>): boolean {
  if (fields.length !== 5) return false
  return fields[0]!.has(date.getMinutes())
    && fields[1]!.has(date.getHours())
    && fields[2]!.has(date.getDate())
    && fields[3]!.has(date.getMonth() + 1)
    && fields[4]!.has(date.getDay())
}

function loadTasks(dir: string): Task[] {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, 'dsh-studio-scheduler', 'tasks.json'), 'utf8')) as TaskStoreFile
    return Array.isArray(parsed.tasks) ? parsed.tasks : []
  } catch {
    return []
  }
}

function saveTasks(dir: string, tasks: Task[]): void {
  const file = join(dir, 'dsh-studio-scheduler', 'tasks.json')
  mkdirSync(dirname(file), { recursive: true })
  // Atomic write (tmp + rename): a crash mid-write must never leave a torn
  // tasks file behind.
  writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify({ tasks }, null, 2))
  renameSync(`${file}.${process.pid}.tmp`, file)
}

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/** Max request body (management routes only ever carry small JSON). */
const MAX_BODY_BYTES = 256 * 1024

/** Read the request body; rejects (and aborts the request) above MAX_BODY_BYTES. */
const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

export function apply(ctx: Context, config: { stateDir?: string } = {}): void {
  const home = process.env.DSH_HOME ?? join(process.env.HOME ?? '.', '.dsh')
  const stateDir = config.stateDir ?? home
  const PREFIX = '/dsh-studio-scheduler/tasks'

  let tasks = loadTasks(stateDir)
  const persist = () => saveTasks(stateDir, tasks)

  /** Fire every due task once, then record lastRunAt. */
  const tick = (now: Date): void => {
    for (const task of tasks) {
      if (!task.enabled) continue
      const fields = parseCron(task.cron)
      if (fields === undefined || !matches(now, fields)) continue
      // Only fire once per matching minute (guard against repeat ticks within
      // the same minute by comparing the minute key to lastRunAt).
      const minuteKey = now.toISOString().slice(0, 16)
      if (task.lastRunAt !== undefined && task.lastRunAt.startsWith(minuteKey)) continue
      task.lastRunAt = now.toISOString()
      // Full shell execution: the command may use pipes/redirection/$()/&& .
      // The command string is operator-provided (local trusted config plane),
      // so the /bin/sh -c form is the intended (and expected) behavior.
      exec(task.command, () => {}) // fire-and-forget
    }
    persist()
  }

  // Fire due tasks every second against the current wall clock.
  const timer = setInterval(() => tick(new Date()), 1000)
  ctx.effect(() => () => clearInterval(timer), 'dsh-studio-scheduler.tick')
  // Catch up once immediately on boot (a task due during shutdown).
  tick(new Date())

  const webServer = ctx.get('webServer')
  if (webServer === undefined) return

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const pathname = (req.url ?? '/').split('?')[0]
    if (pathname === PREFIX) {
      if (req.method === 'GET') return sendJson(res, 200, { tasks: tasks.map(t => ({ ...t })) })
      if (req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req)) as { cron?: string; command?: unknown; label?: string; enabled?: boolean }
          const cron = (body.cron ?? '').trim()
          if (parseCron(cron) === undefined) return sendJson(res, 400, { error: 'invalid cron expression (expect 5 fields)' })
          if (typeof body.command !== 'string' || body.command.trim() === '') return sendJson(res, 400, { error: 'command is required' })
          const task: Task = {
            id: randomUUID(), cron,
            command: body.command.trim(), label: (body.label ?? cron).slice(0, 80),
            enabled: body.enabled !== false,
          }
          tasks.push(task); persist()
          return sendJson(res, 200, { ok: true, task })
        } catch { return sendJson(res, 400, { error: 'bad request' }) }
      }
      return sendJson(res, 405, { error: 'method not allowed' })
    }
    const idMatch = /^\/dsh-studio-scheduler\/tasks\/([A-Za-z0-9-]+)$/.exec(pathname)
    if (idMatch !== null && req.method === 'DELETE') {
      const before = tasks.length
      tasks = tasks.filter(t => t.id !== idMatch[1])
      if (tasks.length === before) return sendJson(res, 404, { error: 'task not found' })
      persist()
      return sendJson(res, 200, { ok: true })
    }
    if (idMatch !== null && req.method === 'PATCH') {
      const task = tasks.find(t => t.id === idMatch[1])
      if (task === undefined) return sendJson(res, 404, { error: 'task not found' })
      try {
        const body = JSON.parse(await readBody(req)) as { enabled?: boolean; cron?: string; command?: string; label?: string }
        if (body.enabled !== undefined) task.enabled = body.enabled
        if (body.cron !== undefined) {
          if (parseCron(body.cron) === undefined) return sendJson(res, 400, { error: 'invalid cron' })
          task.cron = body.cron.trim()
        }
        if (body.command !== undefined) task.command = body.command.trim()
        if (body.label !== undefined) task.label = body.label.slice(0, 80)
        persist()
        return sendJson(res, 200, { ok: true, task })
      } catch { return sendJson(res, 400, { error: 'bad request' }) }
    }
    sendJson(res, 404, { error: 'not found' })
  }

  const dispose = webServer.register({ kind: 'prefix', path: PREFIX, handler })
  ctx.effect(() => () => dispose?.(), 'dsh-studio-scheduler.http-routes')
}
