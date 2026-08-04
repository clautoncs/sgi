const VERSAO = "0.2.0";

export default function StatusPage() {
  return (
    <main className="screen">
      <div className="panel">
        <div className="panel__head">
          <span className="eyebrow">Sistema de Gerenciamento</span>
          <h1 className="title">
            SGI<span className="title__dot">.</span>
          </h1>
          <p className="subtitle">iLinked — Plataforma de Dashboards</p>
        </div>

        <div className="readout">
          <div className="row">
            <span className="row__label">Status</span>
            <span className="row__value row__value--ok">
              <span className="dot"></span>
              Online
            </span>
          </div>
          <div className="row">
            <span className="row__label">Ambiente</span>
            <span className="row__value">Produção</span>
          </div>
          <div className="row">
            <span className="row__label">Infra</span>
            <span className="row__value">VPS · Docker</span>
          </div>
          <div className="row">
            <span className="row__label">Versão</span>
            <span className="row__value">{VERSAO}</span>
          </div>
        </div>

        <p className="note">
          Todos os serviços operacionais. Sistema disponível para acesso.
        </p>

        <footer className="panel__foot">
          R. Malaga, 53 — Santa Cruz Industrial, Contagem · MG
        </footer>
      </div>
    </main>
  );
}
