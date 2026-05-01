/**
 * Type augmentations for File System Access API features that aren't yet
 * (or aren't reliably) in TypeScript's `lib.dom`.
 *
 * Spec: https://wicg.github.io/file-system-access/
 *
 * `FileSystemDirectoryHandle` and `FileSystemFileHandle` ARE in lib.dom;
 * we only declare the global picker entry point and the permission modes.
 */

declare global {
  interface ShowDirectoryPickerOptions {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?:
      | 'desktop'
      | 'documents'
      | 'downloads'
      | 'music'
      | 'pictures'
      | 'videos'
      | FileSystemHandle
  }

  interface Window {
    showDirectoryPicker(
      options?: ShowDirectoryPickerOptions,
    ): Promise<FileSystemDirectoryHandle>
  }

  interface FileSystemHandle {
    queryPermission(descriptor?: {
      mode?: 'read' | 'readwrite'
    }): Promise<PermissionState>
    requestPermission(descriptor?: {
      mode?: 'read' | 'readwrite'
    }): Promise<PermissionState>
  }
}

export {}
