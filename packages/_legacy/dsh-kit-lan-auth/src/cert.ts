/** TLS certificate management for the dsh-kit-lan-auth gateway. */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import path from 'node:path'

export interface CertBundle {
  key: string
  cert: string
}

export interface PrivateCaResult {
  /** Where the root CA cert was written (share this with trusted devices). */
  caPath: string
  /** Where the leaf key/cert live. */
  keyPath: string
  certPath: string
  /** SAN entries the leaf covers (normalized hostname/IP strings). */
  sans: string[]
}

/**
 * Enumerate this host's usable IPv4 addresses a LAN client might reach the
 * gateway by: private (RFC1918) and v4 link-local. SAN entries cover every
 * candidate so a DHCP renumber or a second uplink does not break the cert.
 */
export function lanIpv4Addresses(): string[] {
  const out = new Set<string>()
  const ifaces = networkInterfaces()
  for (const list of Object.values(ifaces)) {
    for (const iface of list ?? []) {
      if (iface.family !== 'IPv4' || iface.internal) continue
      const parts = iface.address.split('.')
      const first = Number(parts[0])
      const second = Number(parts[1])
      if (first === 10
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 168)
        || first === 169) {
        out.add(iface.address)
      }
    }
  }
  return [...out].sort()
}

/**
 * Ensure a usable TLS key/cert pair exists under `dir` and return it.
 *
 * Priority:
 *   1. Existing `key.pem` + `cert.pem` — used verbatim (user-provided or
 *      earlier output), never overwritten.
 *   2. Automatic private CA (zero-config): mint a root `ca.pem` + leaf
 *      `key.pem`/`cert.pem`. The leaf serves HTTPS; a client that installs
 *      `ca.pem` into its trust store is then permanently warning-free. A
 *      client that does NOT install it still works — browsers show a one-time
 *      "not trusted / continue" per session, exactly like a self-signed cert.
 *   3. Bare self-signed fallback if openssl is unavailable.
 * @throws when generation fails and no usable cert exists.
 */
export function ensureCertBundle(dir: string): CertBundle {
  mkdirSync(dir, { recursive: true })
  const keyPath = path.join(dir, 'key.pem')
  const certPath = path.join(dir, 'cert.pem')
  if (existsSync(keyPath) && existsSync(certPath)) {
    return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') }
  }

  try {
    initPrivateCa(dir)
    return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') }
  } catch {
    const cn = 'dsh-kit-lan-auth'
    const tmpKey = keyPath + '.tmp'
    const san = ['IP:127.0.0.1', 'DNS:localhost', ...lanIpv4Addresses().map(ip => `IP:${ip}`)].join(',')
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256',
      '-keyout', tmpKey, '-out', certPath,
      '-days', '825', '-subj', `/CN=${cn}`, '-addext', `subjectAltName=${san}`])
    writeFileSync(keyPath, readFileSync(tmpKey, 'utf8'))
    try { execFileSync('rm', ['-f', tmpKey]) } catch { /* best-effort cleanup */ }
    return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') }
  }
}

/** Format a SAN entry list for `-addext subjectAltName=...` (comma-joined). */

/**
 * Create a private CA (root cert) and a leaf certificate signed by it whose
 * SAN covers this host's LAN IPv4 addresses plus any extra `--ip`/host inputs,
 * then write both under `dir`:
 *
 *   ca.pem        root CA certificate (import into trusted-device stores)
 *   key.pem|cert.pem   leaf private key / certificate (gateway serves these)
 *
 * The gateway trusts a browser that trusts `ca.pem`, so installing the root
 * into a device's trust store removes the self-signed warning and the
 * first-contact trust cliff (no per-device "continue anyway" step).
 *
 * @param sans extra hostnames/IPs to add beyond the auto-detected LAN set.
 * @returns the artifact paths and the full SAN list.
 */
export function initPrivateCa(dir: string, sans: string[] = []): PrivateCaResult {
  mkdirSync(dir, { recursive: true })
  const keyPath = path.join(dir, 'key.pem')
  const certPath = path.join(dir, 'cert.pem')
  const caPath = path.join(dir, 'ca.pem')

  const all: string[] = []
  const add = (s: string) => { if (s && !all.includes(s)) all.push(s) }
  for (const ip of lanIpv4Addresses()) add(`IP:${ip}`)
  add('IP:127.0.0.1')
  add('DNS:localhost')
  for (const s of sans) add(isIpLiteral(s) ? `IP:${s}` : `DNS:${s}`)

  // Root CA (long-lived, self-signed, CA:TRUE).
  const caKey = path.join(dir, 'ca.key.pem')
  const caKeyTmp = caKey + '.tmp'
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-sha256',
    '-keyout', caKeyTmp, '-out', caPath,
    '-days', '3650', '-subj', '/CN=dsh-kit-lan-auth-private-ca',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign'])
  writeFileSync(caKey, readFileSync(caKeyTmp, 'utf8'))
  try { execFileSync('rm', ['-f', caKeyTmp]) } catch { /* best-effort */ }

  // Leaf CSR then sign with the CA.
  const leafKey = keyPath + '.tmp'
  const csr = path.join(dir, 'leaf.csr.pem.tmp')
  const ext = path.join(dir, 'leaf.ext.cnf.tmp')
  execFileSync('openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', leafKey, '-out', csr, '-subj', '/CN=dsh-kit-lan-auth'])
  writeFileSync(ext, `basicConstraints=CA:FALSE\nsubjectAltName=${all.join(',')}\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`)
  execFileSync('openssl', ['x509', '-req', '-in', csr, '-CA', caPath, '-CAkey', caKey,
    '-CAcreateserial', '-sha256', '-days', '825', '-extfile', ext,
    '-out', certPath])
  writeFileSync(keyPath, readFileSync(leafKey, 'utf8'))
  for (const f of [leafKey, csr, ext]) { try { execFileSync('rm', ['-f', f]) } catch { /* best-effort */ } }

  return { caPath, keyPath, certPath, sans: all }
}

/** Whether a string is an IPv4/IPv6 literal (vs a hostname). */
function isIpLiteral(s: string): boolean {
  return /^[0-9.]+$/.test(s) || s.includes(':')
}
