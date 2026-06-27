const VERSAO = '0.1.0';

export default function Home() {
  return (
    <main className="screen">
      <div className="panel">
        <header className="panel__head">
          <span className="eyebrow">PCBH Informática</span>
          <h1 className="title">
            SGI<span className="title__dot">.</span>
          </h1>
          <p className="subtitle">Sistema de Gestão Integrado</p>
        </header>

        <div className="readout" role="status" aria-label="Estado do sistema">
          <div className="row">
            <span className="row__label">Estado</span>
            <span className="row__value row__value--ok">
              <span className="dot" aria-hidden="true" />
              No ar
            </span>
          </div>
          <div className="row">
            <span className="row__label">Ambiente</span>
            <span className="row__value">Produção</span>
          </div>
          <div className="row">
            <span className="row__label">Servidor</span>
            <span className="row__value">VPS · Docker</span>
          </div>
          <div className="row">
            <span className="row__label">Versão</span>
            <span className="row__value">{VERSAO}</span>
          </div>
        </div>

        <p className="note">
          Infraestrutura no ar. Próximo passo: ligar o banco e construir os módulos.
        </p>

        <footer className="panel__foot">
          R. Malaga, 53 — Santa Cruz Industrial, Contagem · MG
        </footer>
      </div>
    </main>
  );
}
