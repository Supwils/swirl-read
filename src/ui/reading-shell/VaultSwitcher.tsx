/**
 * VaultSwitcher (M6.1) — header dropdown listing every registered vault
 * with one-click switch + an "Open another vault" affordance.
 *
 * Custom (~80 LoC) rather than Radix DropdownMenu to avoid pulling in a
 * new package for a single small surface. Click-outside + Esc + arrow
 * navigation are handled inline. Focus returns to the trigger on close.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Check, ChevronDown, FolderOpen, Library } from 'lucide-react'
import { saveHandle } from '@/core/vault'
import type { FSAPIVaultAdapter, VaultId } from '@/core/vault'
import { useVaultStore } from '@/stores/vault-store'
import { FolderPicker } from '@/ui/landing/FolderPicker'

export function VaultSwitcher(): ReactNode {
  const params = useParams<{ vaultId: string }>()
  const navigate = useNavigate()
  const vaults = useVaultStore((s) => s.registeredVaults)
  const registerVault = useVaultStore((s) => s.registerVault)

  const [open, setOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentId = params.vaultId
  const currentVault = vaults.find((v) => v.id === currentId)

  // Click outside / Esc to close
  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent | TouchEvent): void {
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
      }
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
      <div className="swilread-vault-switcher">
        <button
          ref={triggerRef}
          type="button"
          className="swilread-vault-switcher__trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Switch vault"
          onClick={() => setOpen((p) => !p)}
        >
          <Library size={14} aria-hidden="true" />
          <span className="swilread-vault-switcher__name">{triggerLabel}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open && (
          <div
            ref={menuRef}
            className="swilread-vault-switcher__menu"
            role="menu"
            aria-label="Registered vaults"
          >
            {vaults.length === 0 && (
              <p className="swilread-vault-switcher__empty">
                No vaults registered yet.
              </p>
            )}
            {vaults.map((vault) => (
              <button
                key={vault.id}
                type="button"
                role="menuitem"
                className={
                  vault.id === currentId
                    ? 'swilread-vault-switcher__item is-active'
                    : 'swilread-vault-switcher__item'
                }
                onClick={() => handleSwitch(vault.id)}
              >
                <span className="swilread-vault-switcher__item-name">
                  {vault.name}
                </span>
                {vault.id === currentId && (
                  <Check size={14} aria-hidden="true" />
                )}
              </button>
            ))}
            <div className="swilread-vault-switcher__separator" />
            <button
              type="button"
              role="menuitem"
              className="swilread-vault-switcher__item swilread-vault-switcher__item--cta"
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
