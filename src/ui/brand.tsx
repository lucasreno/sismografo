// Marca do Sismógrafo: um sismograma — linha de base estável com um tremor.
// O traço usa um gradiente azul→ciano (sinal vivo do instrumento).

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="brand__mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sismo-grad" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="#4f8cff" />
          <stop offset="1" stopColor="#38d9e0" />
        </linearGradient>
      </defs>
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8.5" fill="#10161f" stroke="#243044" strokeWidth="1.5" />
      <path
        d="M4 16 H10 L12.5 16 L14.5 8 L17.5 24 L19.5 12 L21.5 16 H28"
        stroke="url(#sismo-grad)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <Logo />
      <div>
        <span className="brand__name">Sismógrafo</span>
        <span className="brand__tag">Sente o tremor antes da queda</span>
      </div>
    </div>
  );
}
