"use client";

export default function IntegracoesPage() {
  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>
        Integrações
      </h1>
      <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "24px" }}>
        Gerencie as fontes de dados conectadas ao SGI.
      </p>

      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "10px",
        padding: "24px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <div style={{
            width: "40px",
            height: "40px",
            borderRadius: "8px",
            background: "rgba(63, 185, 80, 0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2" width="20" height="20">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>Google Sheets</h3>
            <span style={{ fontSize: "12px", color: "var(--ok)" }}>Conectado</span>
          </div>
        </div>
        <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "12px" }}>
          Planilha de vendas conectada via Service Account. Dados atualizados a cada 2 minutos.
        </p>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
          padding: "12px",
          background: "rgba(77, 159, 255, 0.04)",
          borderRadius: "6px",
          fontSize: "12px",
          color: "var(--muted)",
          fontFamily: "var(--mono)",
        }}>
          <div>
            <span style={{ display: "block", fontSize: "10px", textTransform: "uppercase", marginBottom: "4px" }}>Planilha ID</span>
            <span style={{ color: "var(--text)" }}>1lB-W_5t...rTWYN4</span>
          </div>
          <div>
            <span style={{ display: "block", fontSize: "10px", textTransform: "uppercase", marginBottom: "4px" }}>Service Account</span>
            <span style={{ color: "var(--text)" }}>shetts@golden-shine...</span>
          </div>
          <div>
            <span style={{ display: "block", fontSize: "10px", textTransform: "uppercase", marginBottom: "4px" }}>Status</span>
            <span style={{ color: "var(--ok)" }}>Ativo</span>
          </div>
        </div>
      </div>

      <div style={{
        background: "var(--surface)",
        border: "1px dashed var(--line)",
        borderRadius: "10px",
        padding: "24px",
        marginTop: "16px",
        textAlign: "center",
      }}>
        <p style={{ fontSize: "13px", color: "var(--muted)" }}>
          Novas integrações serão adicionadas aqui conforme necessidade.
        </p>
      </div>
    </div>
  );
}
