import { BookUser, GraduationCap, ShieldUser, ICON_SIZE } from "../utils/icons";

const ROLE_LABELS = {
  student: "Student",
  lecturer: "Lecturer",
  professor: "Professor",
  admin: "Admin",
};

const ROLE_ICONS = {
  student: GraduationCap,
  lecturer: BookUser,
  professor: GraduationCap,
  admin: ShieldUser,
};

export default function RoleBadge({ role, className = "" }) {
  const key = typeof role === "string" ? role.trim().toLowerCase() : "";
  const label = ROLE_LABELS[key];
  if (!label) return null;

  const roleClass =
    key === "student" || key === "lecturer" || key === "professor" || key === "admin"
      ? key
      : "";
  const Icon = ROLE_ICONS[key] || null;
  const classes = ["badge", roleClass, className].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      {Icon ? <Icon size={ICON_SIZE.sm} aria-hidden="true" focusable="false" /> : null}
      <span>{label}</span>
    </span>
  );
}
