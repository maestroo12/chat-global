// Dipasang sebelum halaman tampil supaya tema tidak berkedip.
// Berupa file terpisah (bukan inline) agar CSP tidak perlu 'unsafe-inline'.
(function () {
  var t = null;
  try {
    t = localStorage.getItem("chatTheme");
  } catch (e) {}
  if (t !== "dark" && t !== "light") {
    t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = t;
})();
