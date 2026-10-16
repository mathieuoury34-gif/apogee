// Déclarations minimales (pas de @types/react dans l'outillage hors ligne) : suffisent au contrôle de types
// du code de l'app ; les composants React sont typés côté appelant.
declare module 'react' {
  export type ReactNode = any;
  export type CSSProperties = Record<string, any>;
  export type FormEvent = any;
  export type PointerEvent<T = any> = any;
  export type MouseEvent<T = any> = any;
  export type ChangeEvent<T = any> = any;
  export type KeyboardEvent<T = any> = any;
  export type RefObject<T> = { current: T };
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(fn: () => void | (() => void), deps?: any[]): void;
  export function useLayoutEffect(fn: () => void | (() => void), deps?: any[]): void;
  export function useMemo<T>(fn: () => T, deps: any[]): T;
  export function useCallback<T>(fn: T, deps: any[]): T;
  export function useRef<T>(initial: T): { current: T };
  export function useRef<T>(initial: T | null): { current: T | null };
  export function useSyncExternalStore<T>(sub: (cb: () => void) => () => void, get: () => T, getServer?: () => T): T;
  export function useId(): string;
  export const Fragment: any;
  const React: any;
  export default React;
}
declare module 'react/jsx-runtime' { export const jsx: any; export const jsxs: any; export const Fragment: any; }
declare module 'react-dom/client' { export function createRoot(el: Element): { render(node: any): void }; }
declare module 'jszip' { export default class JSZip { constructor(); [k: string]: any; static [k: string]: any } }
declare module '*.css';
declare namespace React {
  type TouchEvent<T = any> = any;
  type ReactNode = any;
  type CSSProperties = Record<string, any>;
  type PointerEvent<T = any> = any;
  type MouseEvent<T = any> = any;
  type FormEvent = any;
  type RefObject<T> = { current: T };
}
/** Événement DOM simplifié : suffit à typer les paramètres des gestionnaires. */
interface IronEvent { target: any; currentTarget: any; clientX: number; clientY: number; key: string; deltaY: number; touches: any; preventDefault(): void; stopPropagation(): void; [k: string]: any }
type IronHandler = (e: IronEvent) => void;
interface IronDomProps {
  [k: string]: any;
  onClick?: IronHandler; onChange?: IronHandler; onInput?: IronHandler; onBlur?: IronHandler; onFocus?: IronHandler;
  onKeyDown?: IronHandler; onKeyUp?: IronHandler; onSubmit?: IronHandler; onScroll?: IronHandler; onWheel?: IronHandler;
  onPointerDown?: IronHandler; onPointerMove?: IronHandler; onPointerUp?: IronHandler; onPointerLeave?: IronHandler; onPointerCancel?: IronHandler; onPointerEnter?: IronHandler;
  onMouseMove?: IronHandler; onMouseLeave?: IronHandler; onMouseEnter?: IronHandler; onMouseDown?: IronHandler;
  onTouchStart?: IronHandler; onTouchMove?: IronHandler; onTouchEnd?: IronHandler;
}
declare namespace JSX {
  interface IntrinsicElements { [name: string]: IronDomProps }
  interface Element {}
  interface IntrinsicAttributes { key?: any }
}
