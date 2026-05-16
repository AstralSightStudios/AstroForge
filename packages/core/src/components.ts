// AstroForge 源码侧内置组件声明。
//
// 这些导出只作为类型声明与编译期标记使用。前端转换会将 PascalCase 组件名
// 映射为目标快应用标签，目标后端负责生成对应运行时代码。

import type { FC, PropsWithChildren } from "./jsx-runtime";

export type StyleValue = string | number | boolean | null | undefined;
export type StyleObject = Record<string, StyleValue>;
export type EventHandler<T = Event> = (evt: T) => void;

export interface CommonProps extends PropsWithChildren {
  id?: string;
  className?: string;
  class?: string;
  style?: StyleObject;
  show?: boolean;
  tid?: string;
  onClick?: EventHandler;
}

export interface AProps extends CommonProps {
  href?: string;
}

export interface BarcodeProps extends CommonProps {
  value?: string;
}

export interface CanvasProps extends CommonProps {}

export interface ChartProps extends CommonProps {
  datasets?: unknown;
  option?: unknown;
  type?: string;
}

export interface ViewProps extends CommonProps {
  renderOffsetBottom?: string | number;
  renderOffsetTop?: string | number;
  scrollSnapX?: unknown;
  scrollSnapY?: unknown;
  onScroll?: EventHandler;
  onScrollBegin?: EventHandler;
  onScrollEnd?: EventHandler;
  onScrollTouchUp?: EventHandler;
  onTouchDown?: EventHandler;
}

export interface TextProps extends CommonProps {
  value?: string;
}

export interface ImageProps extends CommonProps {
  src: string;
  alt?: string;
}

export interface ImageAnimatorProps extends CommonProps {
  duration?: number;
  fillmode?: string;
  fixedsize?: boolean;
  images?: unknown[];
  iteration?: number | string;
  reverse?: boolean;
}

export interface InputProps extends CommonProps {
  autocomplete?: string | boolean;
  checked?: boolean;
  enterkeytype?: string;
  maxlength?: number;
  name?: string;
  placeholder?: string;
  show?: boolean;
  type?: string;
  value?: string | number | boolean;
}

export interface LabelProps extends CommonProps {}

export interface ListProps extends CommonProps {
  scrollElastic?: boolean;
  scrollIndex?: number;
  scrollPage?: number;
  scrollbar?: boolean;
  scrollbarType?: string;
  type?: string;
  onScroll?: EventHandler;
  onScrollBegin?: EventHandler;
  onScrollEnd?: EventHandler;
  onScrollFly?: EventHandler;
  onTouchDown?: EventHandler;
  onTouchUp?: EventHandler;
}

export interface ListItemProps extends CommonProps {
  type?: string;
}

export interface MarqueeProps extends CommonProps {
  autoplay?: boolean;
  loop?: boolean;
  scrollStartPosition?: number;
  scrollamount?: number;
  textOffset?: number;
  textValue?: string;
  onChange?: EventHandler;
  onUpdate?: EventHandler;
}

export interface MediaProps extends CommonProps {
  current?: number;
  screenShape?: string;
  uris?: string[];
}

export interface OptionProps extends CommonProps {}

export interface PickerProps extends CommonProps {
  range?: unknown[];
  selected?: number | string | unknown;
  type?: string;
}

export interface PopupProps extends CommonProps {}

export interface ProgressProps extends CommonProps {
  percent?: number;
  type?: string;
}

export interface PromptProps extends CommonProps {
  buttons?: unknown[];
  duration?: number;
  msg?: string;
  position?: string;
  title?: string;
  type?: string;
}

export interface QRProps extends CommonProps {
  type?: string;
  value?: string;
}

export interface RatingProps extends CommonProps {}

export interface RefreshProps extends CommonProps {
  animationDuration?: number;
  enablePulldown?: boolean;
  enablePullup?: boolean;
  gesture?: string;
  offset?: number;
  pulldownRefreshing?: boolean;
  pullupRefreshing?: boolean;
  reboundable?: boolean;
  refreshing?: boolean;
  type?: string;
  onPulldown?: EventHandler;
  onPullup?: EventHandler;
}

export interface RefreshFooterProps extends CommonProps {}

export interface RefreshHeaderProps extends CommonProps {
  autoRefresh?: boolean;
  dragRate?: number;
  maxDragRatio?: number;
  maxDragSize?: number;
  refreshDisplayRadio?: number;
  refreshDisplaySize?: number;
  spinnerStyle?: string;
  translationWithContent?: boolean;
  triggerRatio?: number;
  triggerSize?: number;
}

export interface RichTextProps extends CommonProps {
  value?: string;
}

export interface ScreenProps extends CommonProps {}

export interface ScrollProps extends CommonProps {
  bounces?: boolean;
  scrollBottom?: number;
  scrollLeft?: number;
  scrollRight?: number;
  scrollTop?: number;
  scrollX?: boolean;
  scrollY?: boolean;
}

export interface SelectProps extends CommonProps {}

export interface SliderProps extends CommonProps {
  disabled?: boolean;
  max?: number;
  min?: number;
  step?: number;
  value?: number;
  onChange?: EventHandler;
  onUpdate?: EventHandler;
}

export interface SpanProps extends CommonProps {}

export interface StackProps extends CommonProps {}

export interface SwiperProps extends CommonProps {
  autoPlay?: boolean;
  bounces?: boolean;
  duration?: number;
  enableSwipe?: boolean;
  index?: number;
  indicator?: boolean;
  interval?: number;
  loop?: boolean;
  nextMargin?: string | number;
  previousMargin?: string | number;
  reportSwipeRightOnLeftEdge?: boolean;
  vertical?: boolean;
  onChange?: EventHandler;
  onUpdate?: EventHandler;
}

export interface SwitchProps extends CommonProps {
  checked?: boolean;
}

export interface TabContentProps extends CommonProps {}
export interface TabBarProps extends CommonProps {}
export interface TabsProps extends CommonProps {}

export interface TextareaProps extends CommonProps {
  value?: string;
  placeholder?: string;
}

export interface VideoProps extends CommonProps {
  autoPlay?: boolean;
  muted?: boolean;
  option?: unknown;
  playCount?: number;
  poster?: string;
  src?: string;
}

const NOT_REACHABLE =
  "AstroForge: 内置组件在运行时不应被实际调用。请确认已启用 @astroforge/rsbuild-plugin。";

function component<P>(): FC<P> {
  return () => {
    throw new Error(NOT_REACHABLE);
  };
}

export const A = component<AProps>();
export const Barcode = component<BarcodeProps>();
export const Canvas = component<CanvasProps>();
export const Chart = component<ChartProps>();
export const View = component<ViewProps>();
export const Div = View;
export const Text = component<TextProps>();
export const Image = component<ImageProps>();
export const ImageAnimator = component<ImageAnimatorProps>();
export const Input = component<InputProps>();
export const Label = component<LabelProps>();
export const List = component<ListProps>();
export const ListItem = component<ListItemProps>();
export const Marquee = component<MarqueeProps>();
export const Media = component<MediaProps>();
export const Option = component<OptionProps>();
export const Picker = component<PickerProps>();
export const Popup = component<PopupProps>();
export const Progress = component<ProgressProps>();
export const Prompt = component<PromptProps>();
export const QR = component<QRProps>();
export const Qr = QR;
export const Rating = component<RatingProps>();
export const Refresh = component<RefreshProps>();
export const RefreshFooter = component<RefreshFooterProps>();
export const RefreshHeader = component<RefreshHeaderProps>();
export const RichText = component<RichTextProps>();
export const Screen = component<ScreenProps>();
export const Scroll = component<ScrollProps>();
export const Select = component<SelectProps>();
export const Slider = component<SliderProps>();
export const Span = component<SpanProps>();
export const Stack = component<StackProps>();
export const Swiper = component<SwiperProps>();
export const Switch = component<SwitchProps>();
export const TabContent = component<TabContentProps>();
export const TabBar = component<TabBarProps>();
export const Tabs = component<TabsProps>();
export const Textarea = component<TextareaProps>();
export const Video = component<VideoProps>();
