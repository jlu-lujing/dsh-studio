#!/usr/bin/env node
/** dsh-kit-lan-auth CLI: init / inspect the private CA for the HTTPS gateway. */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

import { initPrivateCa, lanIpv4Addresses } from '../lib/cert.js'

const [cmd, ...rest] = process.argv.slice(2)
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const dir = join(home, 'dsh-kit-lan-auth', 'certs')
const keyPath = join(dir, 'key.pem')
const certPath = join(dir, 'cert.pem')
const caPath = join(dir, 'ca.pem')

if (cmd === 'status') {
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    console.error(`dsh-kit-lan-auth: no certificate generated yet in ${dir}.
Run \`dsh-kit-lan-auth init-ca\` first.`)
    process.exit(1)
  }
  console.log(`dsh-kit-lan-auth: certificate status`)
  console.log(`  root CA : ${existsSync(caPath) ? caPath : '(missing — leaf is self-signed or external)'}`)
  console.log(`  leaf key: ${keyPath}`)
  console.log(`  leaf cert: ${certPath}`)
  try {
    const san = execFileSync('openssl', ['x509', '-in', certPath, '-noout', '-ext', 'subjectAltName'], { encoding: 'utf8' }).trim()
    console.log(`  SAN:\n${san.split('\n').map(l => '    ' + l).join('\n')}`)
    const dates = execFileSync('openssl', ['x509', '-in', certPath, '-noout', '-dates'], { encoding: 'utf8' }).trim()
    console.log(`  validity:\n${dates.split('\n').map(l => '    ' + l).join('\n')}`)
    const issuer = execFileSync('openssl', ['x509', '-in', certPath, '-noout', '-issuer'], { encoding: 'utf8' }).trim()
    console.log(`  issuer: ${issuer}`)
  } catch {
    console.error('  (openssl unavailable — cannot inspect)')
  }
  const current = lanIpv4Addresses()
  console.log(`  current LAN IPs: ${current.length ? current.join(', ') : '(none)'}`)
  process.exit(0)
}

if (cmd !== 'init-ca') {
  console.error(`dsh-kit-lan-auth: unknown command "${cmd ?? ''}".
Usage:
  dsh-kit-lan-auth init-ca [--ip <addr>]...   generate a private CA + leaf cert
  dsh-kit-lan-auth status                      show cert paths / SAN / trust state
`)
  process.exit(1)
}

// ── init-ca ────────────────────────────────────────────────────────────
const extra = []
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--ip') { extra.push(rest[++i]); continue }
  console.error(`dsh-kit-lan-auth: unknown flag "${rest[i]}"`)
  process.exit(1)
}

const autoIps = lanIpv4Addresses()
console.log(`dsh-kit-lan-auth: detected LAN IPv4: ${autoIps.length ? autoIps.join(', ') : '(none)'}`)

const result = initPrivateCa(dir, extra)
console.log('dsh-kit-lan-auth: private CA + leaf certificate generated.')
console.log(`  root CA      : ${result.caPath}`)
console.log(`  leaf key     : ${result.keyPath}`)
console.log(`  leaf cert    : ${result.certPath}`)
console.log(`  subjectAltName: ${result.sans.join(', ')}`)
console.log('')
console.log('Next: install the root CA into every device that will access the gateway,')
console.log('so browsers stop warning and trust is established once, centrally.')
console.log(`  macOS : sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${result.caPath}`)
console.log(`  Linux : sudo cp ${result.caPath} /usr/local/share/ca-certificates/dsh-kit-lan-auth.crt && sudo update-ca-certificates`)
console.log('  iOS   : AirDrop/email the .pem to the device, open it, install profile, enable full trust')
console.log('  Android: Settings > Security > Install a certificate > CA certificate')
console.log('Then restart dsh web so the gateway serves the new leaf certificate.')
console.log('')
console.log('To re-issue with extra addresses:  dsh-kit-lan-auth init-ca --ip 192.168.30.10 --ip myhost.lan')
