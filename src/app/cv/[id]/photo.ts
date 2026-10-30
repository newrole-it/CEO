const MAX_PHOTO_PX = 360

/**
 * A picked image as a small square JPEG data URL: centre-cropped (the CV shows it in a circle),
 * at most 360 px, on white in case the source has transparency. Throws if it cannot be read.
 */
export async function photoToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    if (!side) throw new Error("empty image")
    const size = Math.min(side, MAX_PHOTO_PX)
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) throw new Error("no canvas")
    context.fillStyle = "#fff"
    context.fillRect(0, 0, size, size)
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size
    )
    return canvas.toDataURL("image/jpeg", 0.86)
  } finally {
    URL.revokeObjectURL(url)
  }
}
