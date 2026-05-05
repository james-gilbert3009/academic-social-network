import { FaChalkboardTeacher, FaUserGraduate, FaUserShield } from "react-icons/fa";
import { MdMenuBook } from "react-icons/md";

const ROLE_LABELS = {
  student: "Student",
  lecturer: "Lecturer",
  professor: "Professor",
  admin: "Admin",
};

export default function RoleBadge({ role, className = "" }) {
  const key = typeof role === "string" ? role.trim().toLowerCase() : "";
  const label = ROLE_LABELS[key];
  if (!label) return null;

  const roleClass = key === "student" || key === "lecturer" || key === "professor" || key === "admin" ? key : "";
  const Icon =
    roleClass === "student"
      ? FaUserGraduate
      : roleClass === "lecturer"
        ? MdMenuBook
        : roleClass === "professor"
          ? FaChalkboardTeacher
          : roleClass === "admin"
            ? FaUserShield
            : null;
  const classes = ["badge", roleClass, className].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      {Icon ? <Icon aria-hidden="true" focusable="false" /> : null}
      <span>{label}</span>
    </span>
  );
}

