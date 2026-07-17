import {
  BookOpen,
  Braces,
  BriefcaseBusiness,
  ChartColumn,
  Code2,
  GraduationCap,
  LayoutTemplate,
  Megaphone,
  Network,
  PenTool,
  ShieldCheck,
  Smartphone,
  SquareTerminal,
  Users,
  Video
} from "lucide-react";

export const programIconMap = {
  "book-open": BookOpen,
  braces: Braces,
  briefcase: BriefcaseBusiness,
  chart: ChartColumn,
  code: Code2,
  "graduation-cap": GraduationCap,
  layout: LayoutTemplate,
  megaphone: Megaphone,
  network: Network,
  "pen-tool": PenTool,
  shield: ShieldCheck,
  smartphone: Smartphone,
  terminal: SquareTerminal,
  users: Users,
  video: Video
};

export function getProgramIcon(iconName) {
  return programIconMap[iconName] || BookOpen;
}
