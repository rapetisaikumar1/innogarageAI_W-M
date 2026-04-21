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
  let publicId = publicUrlOrId
  const match = publicUrlOrId.match(/\/upload\/(?:v\d+\/)?(.+)$/)
  if (match) publicId = match[1]

  // private_download_url generates a temporarily signed URL using API key+secret
  // works for type:'upload' resources (unlike cloudinary.url + expires_at which needs type:'authenticated')
  return cloudinary.utils.private_download_url(publicId, 'pdf', {
    resource_type: 'raw',
    expires_at: Math.floor(Date.now() / 1000) + 300 // 5 min
  })
}
