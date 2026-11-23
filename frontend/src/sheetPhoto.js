const targetBytes = 3_500_000
const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function prepareSheetPhoto(file, type) {
  if (supportedTypes.has(type) && file.size <= targetBytes) return { candidate: file, type }

  const url = URL.createObjectURL(file)
  const image = new Image()
  try {
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    for (const edge of [3000, 2200, 1600]) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
      if (jpeg && jpeg.size > 0 && jpeg.size <= targetBytes) {
        const name = file.name.replace(/\.[^.]+$/, '') || 'Worksheet photo'
        return { candidate: new File([jpeg], name + '.jpg', { type: 'image/jpeg' }), type: 'image/jpeg' }
      }
    }
  } catch {
    throw new Error('This photo could not be opened. Try taking it again or upload a JPEG, PNG, or WebP.')
  } finally {
    URL.revokeObjectURL(url)
  }
  throw new Error('This photo is too large to read reliably. Retake it with only the worksheet in view.')
}
