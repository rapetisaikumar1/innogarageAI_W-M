import { v2 as cloudinary } from 'cloudinary'
import https from 'https'
import zlib from 'zlib'

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

// Minimal ZIP local-file extractor — reads first file entry from a ZIP buffer.
// Handles both DEFLATE (method 8) and STORED (method 0) entries.
function extractFirstFileFromZip(buf: Buffer): Buffer {
  // Local file header signature: 0x04034b50 (little-endian: 50 4b 03 04)
  const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04])
  const idx = buf.indexOf(sig)
  if (idx === -1) throw new Error('ZIP: no local file header found')
  const method = buf.readUInt16LE(idx + 8)
  const compressedSize = buf.readUInt32LE(idx + 18)
  const filenameLen = buf.readUInt16LE(idx + 26)
  const extraLen = buf.readUInt16LE(idx + 28)
  const dataStart = idx + 30 + filenameLen + extraLen
  const compressedData = buf.slice(dataStart, dataStart + compressedSize)
  if (method === 0) return compressedData // STORED
  if (method === 8) return zlib.inflateRawSync(compressedData) // DEFLATE
  throw new Error(`ZIP: unsupported compression method ${method}`)
}

// Download a Cloudinary raw resource via the Archive Admin API.
// The CDN URL (res.cloudinary.com) is blocked from Railway datacenter IPs,
// but api.cloudinary.com (Admin API) works fine with Basic Auth.
// We generate a signed archive URL, download the ZIP, and extract the file.
export async function downloadCloudinaryRaw(publicUrlOrId: string): Promise<Buffer> {
  ensureConfig()

  let publicId = publicUrlOrId
  const match = publicUrlOrId.match(/\/upload\/(?:v\d+\/)?(.+)$/)
  if (match) publicId = match[1]

  console.log(`[Cloudinary] downloadCloudinaryRaw — publicId: ${publicId}`)

  // download_archive_url generates a signed URL to api.cloudinary.com (not CDN)
  // that returns a ZIP archive of the requested resource.
  const archiveUrl = cloudinary.utils.download_archive_url({
    public_ids: [publicId],
    resource_type: 'raw',
    type: 'upload',
    target_format: 'zip',
    expires_at: Math.floor(Date.now() / 1000) + 300
  })
  console.log(`[Cloudinary] archive URL (first 100): ${(archiveUrl as string).slice(0, 100)}`)

  // Fetch the ZIP via Admin API
  const zipBuf = await new Promise<Buffer>((resolve, reject) => {
    const get = (u: string) => {
      const urlObj = new URL(u)
      https.get({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search }, (res) => {
        console.log(`[Cloudinary] archive fetch → status=${res.statusCode} content-type=${res.headers['content-type']} size=${res.headers['content-length'] || '?'}`)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location)
        }
        if (res.statusCode && res.statusCode >= 400) return reject(new Error(`Archive HTTP ${res.statusCode}`))
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }).on('error', reject)
    }
    get(archiveUrl as string)
  })

  console.log(`[Cloudinary] ZIP downloaded — ${zipBuf.length} bytes`)
  const fileBuf = extractFirstFileFromZip(zipBuf)
  console.log(`[Cloudinary] extracted file — ${fileBuf.length} bytes, first4=${fileBuf.slice(0, 4).toString()}`)
  return fileBuf
}

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
