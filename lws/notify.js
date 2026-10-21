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

  // Container topics are recursive; data-resource topics are exact. An
  // expired or deactivated subscription matches nothing.
  matches (sub, resourceUri) {
    if (sub.active === false) return false
    if (sub.expires && Date.parse(sub.expires) < Date.now()) return false
    return sub.topic.some((t) => t.endsWith('/') ? (resourceUri === t || resourceUri.startsWith(t)) : resourceUri === t)
  }

  // Emit an activity; deliver to every matching subscription whose
  // subscriber may still read the resource — `allow(sub, resourceUri)` is
  // asked at delivery time, so a revoked grant silences a subscription
  // without anyone having to delete it. Fire-and-forget.
  // `alsoUris` are further identifiers the activity concerns — a Move's
  // former identifier, so a subscription to the container it left hears it.
  emit (storageId, activity, allow = async () => true, alsoUris = []) {
    const full = { id: randomUUID(), published: new Date().toISOString(), ...activity }
    for (const sub of Object.values(this.subs)) {
      if (![full.object.id, ...alsoUris].some((u) => this.matches(sub, u))) continue
      Promise.resolve(allow(sub, full.object.id))
        .then((ok) => ok && this.deliverWithRetry(sub, storageId, full))
        .catch((err) => this.log?.warn(`lws notify: delivery to ${sub.inbox} failed: ${err.message}`))
    }
    return full
  }

  // Announce something to a standalone inbox — an access request's or
  // grant's `inbox` (lws-access-requests.html). Same envelope and
  // signature as a subscription delivery; no subscription involved.
  notifyInbox (inbox, storageId, activity) {
    const full = { id: randomUUID(), published: new Date().toISOString(), ...activity }
    this.deliver({ inbox }, storageId, full).catch((err) => this.log?.warn(`lws notify: announcement to ${inbox} failed: ${err.message}`))
    return full
  }

  // "On failure, the server MAY retry delivery": a 5xx or a network error
  // is tried again, backing off. An inbox that answers 410 Gone, or that
  // fails FAILURE_LIMIT deliveries in a row, deactivates the subscription;
  // a success resets the count.
  async deliverWithRetry (sub, storageId, activity) {
    const delays = [500, 2000, 5000]
    for (let attempt = 0; ; attempt++) {
      let status
      try {
        status = await this.deliver(sub, storageId, activity)
      } catch (err) {
        status = 0
        this.log?.warn(`lws notify: ${sub.inbox}: ${err.message}`)
      }
      if (status >= 200 && status < 300) { sub.failures = 0; await this.persist(); return }
      if (status === 410) { sub.active = false; await this.persist(); return }
      const retryable = status === 0 || status >= 500 || status === 429
      if (!retryable || attempt >= delays.length) {
        sub.failures = (sub.failures || 0) + 1
        if (sub.failures >= Notifier.FAILURE_LIMIT) sub.active = false
        await this.persist()
        return
      }
      await new Promise((r) => setTimeout(r, delays[attempt]))
    }
  }

  // One signed POST; resolves to the inbox's status (throws on a network error).
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
    return res.status
  }
}
Notifier.FAILURE_LIMIT = 5
