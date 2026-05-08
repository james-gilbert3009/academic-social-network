/**
 * Centralized icon exports for the TSI CONNECT app.
 *
 * Goal: every icon in the app comes from one place (lucide-react), at one
 * stroke weight, with one shared set of sizes. This keeps icons visually
 * cohesive across navbar, feed, messages, modals, dark mode, etc.
 *
 * Usage:
 *   import { Heart, Bell, ICON_SIZE } from "../utils/icons";
 *   <Heart size={ICON_SIZE.md} aria-hidden />
 *
 * Notes:
 * - Lucide icons render with `stroke="currentColor"` and `strokeWidth={2}`
 *   by default, so they inherit text color and look right in dark mode.
 * - For "filled" looks (e.g. liked Heart), set `fill="currentColor"` on the
 *   element; otherwise leave it as the default outline.
 */

export {
  // Navigation / chrome
  House,
  MessageCircle,
  Bell,
  Search,
  Settings,
  UserRound,
  LogOut,
  Menu,
  X,
  Filter,
  ArrowLeft,
  ChevronRight,
  EllipsisVertical,
  Sun,
  Moon,
  // Post / engagement
  Heart,
  Share2,
  MessagesSquare,
  Plus,
  Pencil,
  Trash2,
  Bookmark,
  // Categories
  CircleQuestionMark,
  FlaskConical,
  Megaphone,
  BookOpenText,
  CalendarDays,
  FileText,
  Layers,
  // Roles
  GraduationCap,
  BookUser,
  ShieldUser,
  // Messages composer / actions
  Paperclip,
  SendHorizontal,
  Image as ImageIcon,
  Video as VideoIcon,
  Inbox,
  ShieldBan,
  Ban,
  Unlock,
  Check,
  // Misc / relationship
  UserPlus,
  UserCheck,
  UserX,
} from "lucide-react";

/**
 * Standard icon sizes (px). Prefer one of these instead of arbitrary numbers.
 * - sm: inline pills, tight rows, small badges.
 * - md: default for buttons and stats.
 * - lg: top-bar nav icons, primary actions.
 * - xl: hero / loud accents.
 */
export const ICON_SIZE = Object.freeze({
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
});
