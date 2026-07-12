//
// lws10-notifications: webhook subscriptions, AS2 notification envelopes,
// and RFC 9421 HTTP Message Signatures (ES256, key published in the
// storage description as a CID verificationMethod).
//

import { promises as fs } from 'fs'
import { createHash, createSign, generateKeyPairSync, randomUUID, createPrivateKey } from 'crypto'
import path from 'path'

export class Notifier {
  constructor (dir, log) {
    this.dir = dir
    this.log = log
    this.subsFile = path.join(dir, 'subscriptions.json')
    this.keyFile = path.join(dir, 'signing-key.json')
    this.subs = {}
    this.key = null
  }

  async init () {
    await fs.mkdir(this.dir, { recursive: true })
    try { this.subs = JSON.parse(await fs.readFile(this.subsFile, 'utf8')) } catch { this.subs = {} }
    try {
      this.key = JSON.parse(await fs.readFile(this.keyFile, 'utf8'))
    } catch {
      const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      this.key = {
        kid: 'key-' + Date.now().toString(36),
        privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        publicJwk: publicKey.export({ format: 'jwk' }),
      }
      await fs.writeFile(this.keyFile, JSON.stringify(this.key))
    }
  }

  // The storage description fragments this module contributes.
  descriptionFragment (storageId, endpoint) {
    return {
      verificationMethod: [{
        id: storageId + '#' + this.key.kid,
        type: 'JsonWebKey',
        controller: storageId,
        publicKeyJwk: { kid: this.key.kid, alg: 'ES256', ...this.key.publicJwk },
      }],
      authentication: [storageId + '#' + this.key.kid],
      service: [{
        type: 'NotificationService',
        serviceEndpoint: endpoint,
        subscriptionType: ['WebhookSubscription'],
      }],
    }
  }

  async persist () { await fs.writeFile(this.subsFile, JSON.stringify(this.subs)) }

  async create ({ topic, inbox, expires, subscriber }) {
    const id = randomUUID()
    this.subs[id] = { id, type: 'WebhookSubscription', topic, inbox, expires: expires || null, subscriber, created: new Date().toISOString() }
    await this.persist()
    return this.subs[id]
  }

  list (subscriber) {
    return Object.values(this.subs).filter((s) => !subscriber || s.subscriber === subscriber)
  }

  get (id) { return this.subs[id] }
  async remove (id) { delete this.subs[id]; await this.persist() }

  // Container topics are recursive; data-resource topics are exact.
  matches (sub, resourceUri) {
    if (sub.expires && Date.parse(sub.expires) < Date.now()) return false
    return sub.topic.some((t) => t.endsWith('/') ? (resourceUri === t || resourceUri.startsWith(t)) : resourceUri === t)
  }

  // Emit an activity; deliver to every matching subscription (fire-and-forget).
  emit (storageId, activity) {
    const full = { id: randomUUID(), published: new Date().toISOString(), ...activity }
    for (const sub of Object.values(this.subs)) {
      if (!this.matches(sub, full.object.id)) continue
      this.deliver(sub, storageId, full).catch((err) => this.log?.warn(`lws notify: delivery to ${sub.inbox} failed: ${err.message}`))
    }
    return full
  }

  async deliver (sub, storageId, activity) {
    const body = JSON.stringify({
      '@context': ['https://www.w3.org/ns/lws/v1', 'https://www.w3.org/ns/activitystreams'],
      type: 'Notification',
      storage: storageId,
      activity,
    })
    const url = new URL(sub.inbox)
    const digest = 'sha-256=:' + createHash('sha256').update(body).digest('base64') + ':'
    const created = Math.floor(Date.now() / 1000)
    const keyid = storageId + '#' + this.key.kid
    const components = [
      ['"@method"', 'POST'],
      ['"@scheme"', url.protocol.replace(':', '')],
      ['"@authority"', url.host],
      ['"@path"', url.pathname],
      ['"content-type"', 'application/lws+json'],
      ['"content-digest"', digest],
    ]
    const params = `("@method" "@scheme" "@authority" "@path" "content-type" "content-digest");created=${created};keyid="${keyid}"`
    const base = components.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n"@signature-params": ${params}`
    // RFC 9421 ecdsa-p256-sha256 uses the raw r||s form, not DER
    const signer = createSign('SHA256')
    signer.update(base)
    const sig = signer.sign({ key: createPrivateKey(this.key.privatePem), dsaEncoding: 'ieee-p1363' })
    const res = await fetch(sub.inbox, {
      method: 'POST',
      headers: {
        'content-type': 'application/lws+json',
        'content-digest': digest,
        'signature-input': `sig1=${params}`,
        signature: `sig1=:${sig.toString('base64')}:`,
      },
      body,
    })
    if (!res.ok) throw new Error(`inbox answered ${res.status}`)
  }
}
