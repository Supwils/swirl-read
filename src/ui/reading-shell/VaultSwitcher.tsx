/**
 * VaultSwitcher (M6.1) — header dropdown listing every registered vault
 * with one-click switch + an "Open another vault" affordance.
 *
 * Custom (~80 LoC) rather than Radix DropdownMenu to avoid pulling in a
 * new package for a single small surface. Click-outside, Esc, and
 * ArrowUp/ArrowDown navigation between menuitems are handled inline.
 * Focus returns to the trigger on close.
 */

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { useNavigate, useParams } from 'react-router'
import { Check, ChevronDown, FolderOpen, Library, X } from 'lucide-react'
import { saveHandle } from '@/core/vault'
import type { FSAPIVaultAdapter, VaultId } from '@/core/vault'
import { requestConfirmation } from '@/stores/dialog-store'
import { useVaultStore } from '@/stores/vault-store'
import { FolderPicker } from '@/ui/landing/FolderPicker'

export function VaultSwitcher(): ReactNode {
  const params = useParams<{ vaultId: string }>()
  const navigate = useNavigate()
  const vaults = useVaultStore((s) => s.registeredVaults)
  const registerVault = useVaultStore((s) => s.registerVault)
  const removeVault = useVaultStore((s) => s.removeVault)

  const [open, setOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentId = params.vaultId
  const currentVault = vaults.find((v) => v.id === currentId)

  // Click outside / Esc to close + arrow-key navigation between menu
  // items. We listen on the menu element rather than the window for the
  // arrow keys so we don't fight other global handlers; the click-outside
  // and Esc paths stay window-scoped because the trigger should respond
  // to Esc no matter where focus is.
  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent): void {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const menu = menuRef.current
      if (!menu) return
      // Only intercept arrow keys when focus is on the trigger or
      // already inside the menu. Otherwise the user is typing
      // somewhere else on the page and we shouldn't steal their keys.
      const active = document.activeElement
      const trigger = triggerRef.current
      const focusInMenu = active instanceof Node && menu.contains(active)
      const focusOnTrigger = active === trigger
      if (!focusInMenu && !focusOnTrigger) return
      // Only the *primary* menu-item buttons (the switch row + the CTA
      // at the bottom) participate in arrow navigation. The destructive
      // remove buttons are reachable via Tab and don't pollute the
      // primary keyboard path.
      const items = Array.from(
        menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
      )
      if (items.length === 0) return
      event.preventDefault()
      const currentIndex = items.findIndex((el) => el === active)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex =
        currentIndex === -1
          ? event.key === 'ArrowDown'
            ? 0
            : items.length - 1
          : (currentIndex + delta + items.length) % items.length
      items[nextIndex]?.focus()
    }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleSwitch = (id: VaultId): void => {
    setOpen(false)
    if (id !== currentId) {
      void navigate(`/app/${id}`)
    }
  }

  const handleRemove = async (id: VaultId, name: string): Promise<void> => {
    const confirmed = await requestConfirmation({
      title: 'Remove vault from SwirlRead?',
      description: `“${name}” will be removed from your vault list. The folder on disk and its files are not touched — you can re-open it later from the landing page.`,
      confirmLabel: 'Remove',
      cancelLabel: 'Keep',
      destructive: true,
    })
    if (!confirmed) return
    setOpen(false)
    // If we're removing the vault the user is currently viewing, route
    // them home *before* the store mutation lands so they don't flash a
    // "vault not found" frame while AppShell re-renders against a stale
    // params.vaultId.
    if (id === currentId) {
      void navigate('/')
    }
    await removeVault(id)
  }

  const handlePicked = async (adapter: FSAPIVaultAdapter): Promise<void> => {
    await registerVault(adapter)
    try {
      await saveHandle(adapter.id, adapter.rootHandle)
    } catch {
      // Persistence failure is non-fatal — current session still works.
    }
    setPickerOpen(false)
    setOpen(false)
    void navigate(`/app/${adapter.id}`)
  }

  const triggerLabel = currentVault?.name ?? 'Choose vault'

  return (
    <>
      <div className="swirlread-vault-switcher">
        <button
          ref={triggerRef}
          type="button"
          className="swirlread-vault-switcher__trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Switch vault"
          onClick={() => setOpen((p) => !p)}
        >
          <Library size={14} aria-hidden="true" />
          <span className="swirlread-vault-switcher__name">{triggerLabel}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open && (
          <div
            ref={menuRef}
            className="swirlread-vault-switcher__menu"
            role="menu"
            aria-label="Registered vaults"
          >
            {vaults.length === 0 && (
              <p className="swirlread-vault-switcher__empty">
                No vaults registered yet.
              </p>
            )}
            {vaults.map((vault) => (
              <div
                key={vault.id}
                className={
                  vault.id === currentId
                    ? 'swirlread-vault-switcher__row is-active'
                    : 'swirlread-vault-switcher__row'
                }
              >
                <button
                  type="button"
                  role="menuitem"
                  className={
                    vault.id === currentId
                      ? 'swirlread-vault-switcher__item is-active'
                      : 'swirlread-vault-switcher__item'
                  }
                  onClick={() => handleSwitch(vault.id)}
                >
                  <span className="swirlread-vault-switcher__item-name">
                    {vault.name}
                  </span>
                  {vault.id === currentId && (
                    <Check size={14} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className="swirlread-vault-switcher__remove"
                  aria-label={`Remove ${vault.name} from your vaults`}
                  title="Remove from SwirlRead (does not delete files)"
                  onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void handleRemove(vault.id, vault.name)
                  }}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
            ))}
            <div className="swirlread-vault-switcher__separator" />
            <button
              type="button"
              role="menuitem"
              className="swirlread-vault-switcher__item swirlread-vault-switcher__item--cta"
              onClick={() => {
                // Close the dropdown first so it doesn't sit visually
                // stranded behind the FolderPicker modal.
                setOpen(false)
                setPickerOpen(true)
              }}
            >
              <FolderOpen size={14} aria-hidden="true" />
              <span>Open another vault…</span>
            </button>
          </div>
        )}
      </div>
      <FolderPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPicked={handlePicked}
      />
    </>
  )
}
