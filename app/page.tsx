"use client";

import { useSession, signOut } from "next-auth/react";

export default function HomePage() {
  const { data: session } = useSession();

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
            <span className="row__label">Usuário</span>
            <span className="row__value">{session?.user?.name || "—"}</span>
          </div>
          <div className="row">
            <span className="row__label">Email</span>
            <span className="row__value">{session?.user?.email || "—"}</span>
          </div>
          <div className="row">
            <span className="row__label">Perfil</span>
            <span className="row__value">{(session?.user as any)?.role || "—"}</span>
          </div>
        </div>

        <p className="note">
          Autenticado com sucesso. Os módulos de dashboards serão adicionados aqui.
        </p>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            marginTop: "20px",
            width: "100%",
            padding: "10px",
            background: "rgba(248, 81, 73, 0.1)",
            border: "1px solid rgba(248, 81, 73, 0.3)",
            borderRadius: "8px",
            color: "#f85149",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--sans)",
          }}
        >
          Sair
        </button>

        <footer className="panel__foot">
          R. Malaga, 53 — Santa Cruz Industrial, Contagem · MG
        </footer>
      </div>
    </main>
  );
}
