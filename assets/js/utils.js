export function formatUkuran(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// localStorage bisa melempar error (mode privat, data situs diblokir), jadi selalu dibungkus.
export const simpan = {
  baca(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  tulis(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  hapus(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};
