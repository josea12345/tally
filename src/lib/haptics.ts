// Tiny haptic taps. Android Chrome honors navigator.vibrate; iOS Safari
// ignores it silently — harmless everywhere. Keep patterns subtle.

export function tapHaptic(ms = 10) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported — no-op */
  }
}

/** The full build — reserved for hitting a 10 (a peak). */
export function peakHaptic() {
  try {
    navigator.vibrate?.([16, 40, 16, 40, 24])
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
