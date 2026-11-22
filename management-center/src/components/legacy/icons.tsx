import type { SVGProps } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  AccessIcon,
  Add01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowExpand01Icon,
  ArrowLeft01Icon,
  ArrowShrink01Icon,
  ArrowUp01Icon,
  BookOpen01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  CubeIcon,
  DashboardSpeed01Icon,
  DashboardSquare01Icon,
  DashboardSquare02Icon,
  Delete02Icon,
  DollarCircleIcon,
  Download01Icon,
  FavouriteIcon,
  File01Icon,
  GithubIcon,
  HierarchySquare02Icon,
  InboxIcon,
  InformationCircleIcon,
  Key01Icon,
  LinkSquare02Icon,
  Loading03Icon,
  PencilEdit02Icon,
  Plug01Icon,
  RefreshIcon,
  Robot01Icon,
  Rocket01Icon,
  SatelliteIcon,
  Search01Icon,
  SecurityCheckIcon,
  ServerStack01Icon,
  Settings01Icon,
  Shield01Icon,
  SlidersHorizontalIcon,
  SourceCodeIcon,
  Store01Icon,
  Tick02Icon,
  Timer01Icon,
  Upload01Icon,
  ViewIcon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons';

// The app's icon names, drawn with Hugeicons like VM Bridge. Provider brand marks live in
// assets/icons and are not part of this set.

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number;
}

function hugeicon(icon: IconSvgElement) {
  return function Icon({ size = 20, strokeWidth = 1.75, ...props }: IconProps) {
    return (
      <HugeiconsIcon
        icon={icon}
        size={size}
        strokeWidth={Number(strokeWidth)}
        aria-hidden="true"
        focusable="false"
        {...props}
      />
    );
  };
}

export const IconCopy = hugeicon(Copy01Icon);
export const IconSlidersHorizontal = hugeicon(SlidersHorizontalIcon);
export const IconKey = hugeicon(Key01Icon);
export const IconBot = hugeicon(Robot01Icon);
export const IconModelCluster = hugeicon(CubeIcon);
export const IconFilterAll = hugeicon(DashboardSquare01Icon);
export const IconFileText = hugeicon(File01Icon);
export const IconShield = hugeicon(Shield01Icon);
export const IconSettings = hugeicon(Settings01Icon);
export const IconPlug = hugeicon(Plug01Icon);
export const IconScrollText = hugeicon(File01Icon);
export const IconInfo = hugeicon(InformationCircleIcon);
export const IconRefreshCw = hugeicon(RefreshIcon);
export const IconDownload = hugeicon(Download01Icon);
export const IconUpload = hugeicon(Upload01Icon);
export const IconTrash2 = hugeicon(Delete02Icon);
export const IconMaximize2 = hugeicon(ArrowExpand01Icon);
export const IconMinimize2 = hugeicon(ArrowShrink01Icon);
export const IconPlus = hugeicon(Add01Icon);
export const IconPencil = hugeicon(PencilEdit02Icon);
export const IconAlertTriangle = hugeicon(Alert02Icon);
export const IconCheckCircle2 = hugeicon(CheckmarkCircle02Icon);
export const IconNetwork = hugeicon(HierarchySquare02Icon);
export const IconLoader2 = hugeicon(Loading03Icon);
export const IconChevronUp = hugeicon(ArrowUp01Icon);
export const IconChevronDown = hugeicon(ArrowDown01Icon);
export const IconChevronLeft = hugeicon(ArrowLeft01Icon);
export const IconSearch = hugeicon(Search01Icon);
export const IconX = hugeicon(Cancel01Icon);
export const IconCheck = hugeicon(Tick02Icon);
export const IconEye = hugeicon(ViewIcon);
export const IconEyeOff = hugeicon(ViewOffIcon);
export const IconInbox = hugeicon(InboxIcon);
export const IconSatellite = hugeicon(SatelliteIcon);
export const IconTimer = hugeicon(Timer01Icon);
export const IconDollarSign = hugeicon(DollarCircleIcon);
export const IconSidebarUsage = IconDollarSign;
export const IconGithub = hugeicon(GithubIcon);
export const IconHeart = hugeicon(FavouriteIcon);
export const IconExternalLink = hugeicon(LinkSquare02Icon);
export const IconBookOpen = hugeicon(BookOpen01Icon);
export const IconCode = hugeicon(SourceCodeIcon);
export const IconSidebarDashboard = hugeicon(DashboardSquare02Icon);
export const IconSidebarQuickStart = hugeicon(Rocket01Icon);
export const IconSidebarConfig = IconSlidersHorizontal;
export const IconSidebarPlugins = IconPlug;
export const IconSidebarStore = hugeicon(Store01Icon);
export const IconSidebarProviders = IconNetwork;
export const IconSidebarAuthFiles = hugeicon(SecurityCheckIcon);
export const IconSidebarOauth = hugeicon(AccessIcon);
export const IconSidebarQuota = hugeicon(DashboardSpeed01Icon);
export const IconSidebarLogs = IconScrollText;
export const IconSidebarSystem = hugeicon(ServerStack01Icon);
