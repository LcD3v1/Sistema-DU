export function formatDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10).split('-').reverse().join('/') : '—'
}
