/**
 * Copy text with the modern Clipboard API and a legacy fallback for browsers
 * or local HTTP contexts where navigator.clipboard is unavailable.
 */
export async function copyText(text) {
  const value = String(text ?? '')

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Fall through to the textarea + execCommand fallback.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)

  const previousFocus = document.activeElement
  textarea.select()
  textarea.setSelectionRange(0, value.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
    if (previousFocus instanceof HTMLElement) previousFocus.focus()
  }

  if (!copied) {
    throw new Error('copy failed')
  }
}
