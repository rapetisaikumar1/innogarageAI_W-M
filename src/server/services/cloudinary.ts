import { v2 as cloudinary } from 'cloudinary'

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
