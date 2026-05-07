export function getStoredTheme() {
  const raw = localStorage.getItem("theme");
  return raw === "dark" ? "dark" : "light";
}

export function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  if (next === "dark") {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.remove("dark-mode");
  }
  localStorage.setItem("theme", next);
  return next;
}

export function applyStoredTheme() {
  return applyTheme(getStoredTheme());
}

export function toggleTheme() {
  const next = getStoredTheme() === "dark" ? "light" : "dark";
  return applyTheme(next);
}
