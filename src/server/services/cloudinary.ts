import { v2 as cloudinary } from 'cloudinary'
import https from 'https'

let configured = false

function ensureConfig(): void {
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    })
    configured = true
  }
}

// Download a Cloudinary raw resource using the Admin API with Basic Auth.
// This bypasses CDN access control restrictions entirely.
export async function downloadCloudinaryRaw(publicUrlOrId: string): Promise<Buffer> {
  ensureConfig()

  let publicId = publicUrlOrId
  let version: number | undefined
  const match = publicUrlOrId.match(/\/upload\/(?:v(\d+)\/)?(.+)$/)
  if (match) {
    version = match[1] ? parseInt(match[1], 10) : undefined
    publicId = match[2]
  }

  const cfg = cloudinary.config()
  const credentials = Buffer.from(`${cfg.api_key}:${cfg.api_secret}`).toString('base64')
  const url = `https://api.cloudinary.com/v1_1/${cfg.cloud_name}/resources/raw/upload/${publicId.split('/').map(encodeURIComponent).join('/')}`

  console.log(`[Cloudinary] downloadCloudinaryRaw — publicId: ${publicId}`)
  console.log(`[Cloudinary] Admin API URL: ${url}`)

  // Step 1: get resource metadata (secure_url + access_mode)
  const meta = await new Promise<{ secure_url: string; access_mode: string }>((resolve, reject) => {
    https.get(url, { headers: { Authorization: `Basic ${credentials}` } }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString()
        console.log(`[Cloudinary] resource metadata status=${res.statusCode} body=${body.slice(0, 300)}`)
        if (res.statusCode !== 200) return reject(new Error(`Admin API status ${res.statusCode}`))
        try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Failed to parse Cloudinary metadata')) }
      })
      res.on('error', reject)
    }).on('error', reject)
  })

  console.log(`[Cloudinary] resource secure_url: ${meta.secure_url} | access_mode: ${meta.access_mode}`)

  // Step 2: download the actual file — try multiple strategies
  // Strategy 1: CDN URL with no auth (works if resource is public)
  // Strategy 2: CDN URL with Basic Auth header
  // Strategy 3: CDN URL with signed path (sign_url)
  const secureUrl: string = meta.secure_url

  const tryFetch = (u: string, headers: Record<string, string> = {}): Promise<Buffer> => {
    return new Promise<Buffer>((resolve, reject) => {
      const get = (fetchUrl: string) => {
        const urlObj = new URL(fetchUrl)
        const reqHeaders: Record<string, string> = {
          'User-Agent': 'InnoGarageServer/1.0',
          ...headers
        }
        https.get({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, headers: reqHeaders }, (res) => {
          console.log(`[Cloudinary] fetch ${fetchUrl.slice(0, 80)} → status=${res.statusCode} www-auth=${res.headers['www-authenticate'] || 'none'}`)
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return get(res.headers.location)
          }
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}`))
          }
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => resolve(Buffer.concat(chunks)))
          res.on('error', reject)
        }).on('error', reject)
      }
      get(u)
    })
  }

  // Try 1: plain CDN URL
  try {
    const buf = await tryFetch(secureUrl)
    console.log(`[Cloudinary] Strategy 1 (plain) succeeded — bytes=${buf.length}`)
    return buf
  } catch (e1) {
    console.log(`[Cloudinary] Strategy 1 failed: ${(e1 as Error).message}`)
  }

  // Try 2: CDN URL + Basic Auth header
  try {
    const buf = await tryFetch(secureUrl, { Authorization: `Basic ${credentials}` })
    console.log(`[Cloudinary] Strategy 2 (basic auth) succeeded — bytes=${buf.length}`)
    return buf
  } catch (e2) {
    console.log(`[Cloudinary] Strategy 2 failed: ${(e2 as Error).message}`)
  }

  // Try 3: SDK signed CDN URL
  const signedUrl = cloudinary.url(publicId, { resource_type: 'raw', type: 'upload', sign_url: true, secure: true, version })
  console.log(`[Cloudinary] Strategy 3 signed URL: ${signedUrl}`)
  const buf = await tryFetch(signedUrl)
  console.log(`[Cloudinary] Strategy 3 (signed CDN) succeeded — bytes=${buf.length}`)
  return buf

export async function uploadResume(
  fileBuffer: Buffer,
  filename: string
): Promise<{ url: string; publicId: string }> {
  ensureConfig()
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: 'innogarage-resumes',
        public_id: `${Date.now()}-${filename}`,
        allowed_formats: ['pdf', 'doc', 'docx']
      },
      (error, result) => {
        if (error) reject(error)
        else resolve({ url: result!.secure_url, publicId: result!.public_id })
      }
    )
    uploadStream.end(fileBuffer)
  })
}

export function getResumeSignedUrl(publicUrlOrId: string): string {
  ensureConfig()
  // Extract public_id from secure_url if a full URL was stored
  // e.g. https://res.cloudinary.com/<cloud>/raw/upload/v123/innogarage-resumes/file.pdf
  // Extract version and public_id from the stored secure_url
  // e.g. https://res.cloudinary.com/<cloud>/raw/upload/v1234567/innogarage-resumes/file.pdf
  let publicId = publicUrlOrId
  let version: number | undefined
  const match = publicUrlOrId.match(/\/upload\/(?:v(\d+)\/)?(.+)$/)
  if (match) {
    version = match[1] ? parseInt(match[1], 10) : undefined
    publicId = match[2]
  }
  console.log(`[Cloudinary] getResumeSignedUrl — publicId: ${publicId} | version: ${version}`)

  // cloudinary.url() with sign_url:true embeds the signature in the URL path (s--SIG--)
  // This works for type:'upload' raw resources and uses a different signature than private_download_url
  return cloudinary.url(publicId, {
    resource_type: 'raw',
    type: 'upload',
    sign_url: true,
    secure: true,
    ...(version ? { version } : {})
  })
}
