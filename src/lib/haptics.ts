// Tiny haptic taps. Android Chrome honors navigator.vibrate; iOS Safari
// ignores it silently — harmless everywhere. Keep patterns subtle.

export function tapHaptic(ms = 10) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported — no-op */
  }
}

export function successHaptic() {
  try {
    navigator.vibrate?.([12, 50, 12])
  } catch {
    /* unsupported — no-op */
  }
}
