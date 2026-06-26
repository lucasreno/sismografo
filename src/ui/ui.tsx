// Primitivas de UI compartilhadas: ícones (SVG, nunca emoji), botões, badges,
// modal e drawer (com Escape/clique-fora), toasts e confirmação por promessa.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------------------------------------- ícones --- */
// Traçado Lucide-style: viewBox 24, stroke currentColor. Um `d` por ícone.
const ICONS = {
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  plus: "M12 5v14 M5 12h14",
  play: "M6 4l14 8-14 8z",
  pause: "M9 5v14 M15 5v14",
  trash: "M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h6",
  settings: "M20 7h-9 M14 17H5 M17 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M7 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  x: "M18 6 6 18 M6 6l12 12",
  chevronRight: "m9 18 6-6-6-6",
  chevronDown: "m6 9 6 6 6-6",
  globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
  signal:
    "M4.9 19.1a10 10 0 0 1 0-14.2 M19.1 4.9a10 10 0 0 1 0 14.2 M7.8 16.2a6 6 0 0 1 0-8.4 M16.2 7.8a6 6 0 0 1 0 8.4 M13 12a1 1 0 1 0-2 0 1 1 0 0 0 2 0z",
  video: "M16 13l5.2 3V8L16 11z M2 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z",
  pencil: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
  sliders: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
  alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01",
  check: "M20 6 9 17l-5-5",
  checkCircle: "M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4 12 14.1l-3-3",
  inbox:
    "M22 12h-6l-2 3h-4l-2-3H2 M5.4 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.5a2 2 0 0 0-1.8-1.1H7.2a2 2 0 0 0-1.8 1.1z",
  refresh: "M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0",
  promote: "M7 17 17 7 M7 7h10v10",
  layers: "M12 2 2 7l10 5 10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
  monitor: "M3 4h18v12H3z M8 20h8 M12 16v4",
  spinner: "M21 12a9 9 0 1 1-6.2-8.6",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Icon name="spinner" size={size} className="spin" />;
}

/* -------------------------------------------------------------- botões --- */
type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size,
  icon,
  loading,
  block,
  iconOnly,
  children,
  className,
  disabled,
  ...rest
}: {
  variant?: Variant;
  size?: "sm";
  icon?: IconName;
  loading?: boolean;
  block?: boolean;
  iconOnly?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        "btn",
        `btn--${variant}`,
        size === "sm" && "btn--sm",
        block && "btn--block",
        iconOnly && "btn--icon",
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 14 : 16} /> : icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      {!iconOnly && children}
    </button>
  );
}

/* -------------------------------------------------------------- badge ---- */
export type Intent = "ok" | "warn" | "danger" | "env" | "neutral" | "brand";

export function Badge({
  intent = "neutral",
  dot,
  pulse,
  children,
}: {
  intent?: Intent;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge--${intent}`}>
      {dot && <span className={cx("badge__dot", pulse && "pulse")} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------- modal / drawer -- */
function useDismiss(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
}

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useDismiss(onClose);
  return createPortal(
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <header className="drawer__head">
          <div className="drawer__title">
            <div>{title}</div>
            {subtitle && <div className="drawer__sub">{subtitle}</div>}
          </div>
          <Button variant="ghost" iconOnly icon="x" onClick={onClose} aria-label="Fechar" />
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </>,
    document.body,
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useDismiss(onClose);
  return createPortal(
    <div className="modal" onClick={onClose}>
      <div
        className={cx("modal__card", wide && "modal__card--wide")}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <h3 className="modal__title">{title}</h3>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------------------------------------- toasts -- */
type Toast = { id: number; msg: string; intent: "ok" | "danger" | "info" };
const ToastCtx = createContext<(msg: string, intent?: Toast["intent"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

/* ----------------------------------------------------------- confirmação - */
type ConfirmOpts = { title: string; body: ReactNode; confirmLabel?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const pushToast = useCallback((msg: string, intent: Toast["intent"] = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, msg, intent }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const [confirmState, setConfirmState] = useState<
    (ConfirmOpts & { resolve: (v: boolean) => void }) | null
  >(null);
  const confirm = useCallback(
    (o: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve })),
    [],
  );
  const settle = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <ToastCtx.Provider value={pushToast}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        {toasts.length > 0 &&
          createPortal(
            <div className="toasts">
              {toasts.map((t) => (
                <div key={t.id} className={`toast toast--${t.intent}`}>
                  <Icon
                    name={t.intent === "ok" ? "checkCircle" : t.intent === "danger" ? "alert" : "activity"}
                    size={17}
                  />
                  <span className="toast__msg">{t.msg}</span>
                </div>
              ))}
            </div>,
            document.body,
          )}
        {confirmState && (
          <Modal
            title={confirmState.title}
            onClose={() => settle(false)}
            footer={
              <>
                <Button variant="ghost" onClick={() => settle(false)}>
                  Cancelar
                </Button>
                <Button variant={confirmState.danger ? "danger" : "primary"} onClick={() => settle(true)}>
                  {confirmState.confirmLabel ?? "Confirmar"}
                </Button>
              </>
            }
          >
            <div className="help">{confirmState.body}</div>
          </Modal>
        )}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}
