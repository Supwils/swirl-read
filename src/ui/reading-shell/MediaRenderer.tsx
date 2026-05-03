/**
 * MediaRenderer (M7.6).
 *
 * Page-level renderer for image / video / audio files routed through the
 * dispatcher's `media` kind. The browser does the heavy lifting; we just
 * load a blob URL via `vault.getBlobURL()` and hand it to the right native
 * element with reading-shell-friendly framing.
 *
 * Reuses the shared `useBlobURL` hook so EmbedNode (inline media inside
 * markdown) and this surface stay in lockstep on cancellation, error
 * surfacing, and cache invalidation.
 */

import { useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, ZoomIn } from 'lucide-react'
import { basename } from '@/core/vault'
import type { VaultFile, VaultFileSystem } from '@/core/vault'
import type { MediaKind } from '@/core/render/dispatcher'
import { formatSize } from './file-renderer-utils'
import { useBlobURL } from './use-blob-url'

interface MediaRendererProps {
  vault: VaultFileSystem
  file: VaultFile
  media: MediaKind
}

export function MediaRenderer({
  vault,
  file,
  media,
}: MediaRendererProps): ReactNode {
  const { url, error } = useBlobURL(vault, file.path)
  const altText = basename(file.path) || file.path

  if (error) {
    return (
      <section
        className="swirlread-media swirlread-media--broken"
        role="alert"
        data-testid="media-renderer-broken"
      >
        <p className="swirlread-media__title">Couldn&apos;t load the file</p>
        <p className="swirlread-media__body">{error}</p>
        <p className="swirlread-media__path">{file.path}</p>
      </section>
    )
  }

  if (!url) {
    return (
      <section
        className="swirlread-media swirlread-media--pending"
        role="status"
        data-testid="media-renderer-pending"
      >
        <p className="swirlread-media__body">Loading {altText}…</p>
      </section>
    )
  }

  return (
    <figure
      className={`swirlread-media swirlread-media--${media}`}
      data-testid="media-renderer"
      data-media={media}
    >
      {media === 'image' && <ImageWithLightbox url={url} altText={altText} />}
      {media === 'video' && (
        <video
          src={url}
          controls
          preload="metadata"
          className="swirlread-media__video"
        />
      )}
      {media === 'audio' && (
        <div className="swirlread-media__audio-wrap">
          <audio
            src={url}
            controls
            preload="metadata"
            className="swirlread-media__audio"
          />
        </div>
      )}
      <figcaption className="swirlread-media__caption">
        <span className="swirlread-media__name">{altText}</span>
        <span className="swirlread-media__size">{formatSize(file.size)}</span>
      </figcaption>
    </figure>
  )
}

/**
 * Click-to-zoom wrapper for image media (M7 polish). Wraps the inline
 * image in a `<button>` so keyboard users can also open the lightbox
 * (Enter / Space). The dialog uses Radix's portal + focus management
 * so dismiss flows (Esc, outside-click, close button) all behave.
 */
function ImageWithLightbox({
  url,
  altText,
}: {
  url: string
  altText: string
}): ReactNode {
  const [open, setOpen] = useState(false)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="swirlread-media__image-trigger"
          aria-label={`Open ${altText} in full view`}
          data-testid="media-renderer-lightbox-trigger"
        >
          <img
            src={url}
            alt={altText}
            loading="lazy"
            className="swirlread-media__image"
          />
          <span className="swirlread-media__zoom-hint" aria-hidden="true">
            <ZoomIn size={14} />
          </span>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="swirlread-lightbox__overlay" />
        <Dialog.Content
          className="swirlread-lightbox"
          aria-describedby={undefined}
          data-testid="media-renderer-lightbox"
        >
          <Dialog.Title className="sr-only">{altText}</Dialog.Title>
          <img src={url} alt={altText} className="swirlread-lightbox__image" />
          <Dialog.Close asChild>
            <button
              type="button"
              className="swirlread-lightbox__close"
              aria-label="Close"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </Dialog.Close>
          <p className="swirlread-lightbox__caption">{altText}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
