/**
 * Attach a local file to the MAIN chat composer from outside React — the
 * store-level twin of use-composer-actions' attachImagePath, callable from
 * plugin pages and other non-hook surfaces (SDK `host.attachFileToComposer`).
 *
 * Images attach as `kind: 'image'` (inline preview resolved best-effort);
 * everything else attaches as a `kind: 'file'` reference. The user still
 * reviews and sends — this only stages.
 */

import { attachmentId, pathLabel } from '@/lib/chat-runtime'
import { addComposerAttachment, type ComposerAttachment, updateComposerAttachment } from '@/store/composer'

import { attachmentPreviewDataUrl } from './use-composer-actions'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff'])

function isImagePath(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''

  return IMAGE_EXTENSIONS.has(ext)
}

export async function attachComposerFile(filePath: string): Promise<boolean> {
  if (!filePath) {
    return false
  }

  const image = isImagePath(filePath)

  const attachment: ComposerAttachment = {
    id: attachmentId(image ? 'image' : 'file', filePath),
    kind: image ? 'image' : 'file',
    label: pathLabel(filePath),
    detail: filePath,
    path: filePath
  }

  addComposerAttachment(attachment)

  if (image) {
    try {
      const previewUrl = await attachmentPreviewDataUrl(filePath)

      if (previewUrl) {
        updateComposerAttachment({ ...attachment, previewUrl })
      }
    } catch {
      // Preview is cosmetic — the attachment itself already landed.
    }
  }

  return true
}
