/**
 * Icon map — a curated set of icons available for landing page blocks.
 * We re-export Lucide components keyed by their string name so the
 * block renderer can look them up from the DB `icon` column.
 */
import {
  CheckCircle,
  Users,
  Star,
  Gamepad2,
  TrendingUp,
  ShoppingCart,
  MessageCircle,
  Twitter,
  Instagram,
  Github,
  Heart,
  Shield,
  Zap,
  Globe,
  Award,
  Coffee,
  Headphones,
  Compass,
  Flame,
  Swords,
  type LucideIcon,
} from "lucide-react";

export const ICON_MAP: Record<string, LucideIcon> = {
  CheckCircle,
  Users,
  Star,
  Gamepad2,
  TrendingUp,
  ShoppingCart,
  MessageCircle,
  Twitter,
  Instagram,
  Github,
  Heart,
  Shield,
  Zap,
  Globe,
  Award,
  Coffee,
  Headphones,
  Compass,
  Flame,
  Swords,
};

export const ICON_NAMES = Object.keys(ICON_MAP);
