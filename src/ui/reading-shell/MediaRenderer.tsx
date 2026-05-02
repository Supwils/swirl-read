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
        className="swilread-media swilread-media--broken"
        role="alert"
        data-testid="media-renderer-broken"
      >
        <p className="swilread-media__title">Couldn&apos;t load the file</p>
        <p className="swilread-media__body">{error}</p>
        <p className="swilread-media__path">{file.path}</p>
      </section>
    )
  }

  if (!url) {
    return (
      <section
        className="swilread-media swilread-media--pending"
        role="status"
        data-testid="media-renderer-pending"
      >
        <p className="swilread-media__body">Loading {altText}…</p>
      </section>
    )
  }

  return (
    <figure
      className={`swilread-media swilread-media--${media}`}
      data-testid="media-renderer"
      data-media={media}
    >
      {media === 'image' && <ImageWithLightbox url={url} altText={altText} />}
      {media === 'video' && (
        <video
          src={url}
          controls
          preload="metadata"
          className="swilread-media__video"
        />
      )}
      {media === 'audio' && (
        <div className="swilread-media__audio-wrap">
          <audio
            src={url}
            controls
            preload="metadata"
            className="swilread-media__audio"
          />
        </div>
      )}
      <figcaption className="swilread-media__caption">
        <span className="swilread-media__name">{altText}</span>
        <span className="swilread-media__size">{formatSize(file.size)}</span>
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
          className="swilread-media__image-trigger"
          aria-label={`Open ${altText} in full view`}
          data-testid="media-renderer-lightbox-trigger"
        >
          <img
            src={url}
            alt={altText}
            loading="lazy"
            className="swilread-media__image"
          />
          <span className="swilread-media__zoom-hint" aria-hidden="true">
            <ZoomIn size={14} />
          </span>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="swilread-lightbox__overlay" />
        <Dialog.Content
          className="swilread-lightbox"
          aria-describedby={undefined}
          data-testid="media-renderer-lightbox"
        >
          <Dialog.Title className="sr-only">{altText}</Dialog.Title>
          <img src={url} alt={altText} className="swilread-lightbox__image" />
          <Dialog.Close asChild>
            <button
              type="button"
              className="swilread-lightbox__close"
              aria-label="Close"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </Dialog.Close>
          <p className="swilread-lightbox__caption">{altText}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
