import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthModal } from '../../src/components/marketplace/AuthModal'

export function AuthDialogHarness() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <button type="button" id="dialog-opener" onClick={() => setIsOpen(true)}>Open dialog</button>
      {isOpen && <AuthModal onClose={() => setIsOpen(false)} onAuthenticated={() => setIsOpen(false)} />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<AuthDialogHarness />)
