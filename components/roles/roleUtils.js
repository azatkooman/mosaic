export const PRIVILEGES = [
  { key: 'can_view', label: 'privView', locked: true },
  { key: 'can_scholarship', label: 'privScholarship' },
  { key: 'can_add_registrants', label: 'privAddRegistrants' },
  { key: 'can_manage_payments', label: 'privManagePayments' },
  { key: 'can_checkin', label: 'privCheckin' },
  { key: 'can_update_event', label: 'privUpdateEvent' },
  { key: 'can_delete_registrants', label: 'privDeleteRegistrants' },
  { key: 'can_manage_team', label: 'privManageTeam' },
]

const PRESET_LABEL_KEYS = {
  view: 'levelView',
  scholarship: 'levelScholarship',
  checkin: 'levelCheckin',
  update: 'levelUpdate',
  full: 'levelFull',
}

/** Display name for a role: presets are translated, custom roles use their name. */
export function roleLabel(role, t) {
  if (role?.preset_key) return t(PRESET_LABEL_KEYS[role.preset_key])
  return role?.name ?? '—'
}

/** Sort: presets first (ladder order), then customs alphabetically. */
export function sortRoles(roles) {
  const order = ['view', 'scholarship', 'checkin', 'update', 'full']
  return [...roles].sort((a, b) => {
    const ai = a.preset_key ? order.indexOf(a.preset_key) : order.length
    const bi = b.preset_key ? order.indexOf(b.preset_key) : order.length
    if (ai !== bi) return ai - bi
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}
