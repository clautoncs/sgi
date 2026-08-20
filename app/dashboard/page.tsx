"use client";
import { useSession } from "next-auth/react";
import { useRole } from "@/app/contexts/RoleContext";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const { hasPermission } = useRole();
  if (!hasPermission("dashboard.painel")) return <div style={{padding: "2rem", color: "#94a3b8", textAlign: "center"}}><h2>Acesso Restrito</h2><p>Você não tem permissão para acessar este painel.</p></div>;
  const { data: session } = useSession();
  const user = session?.user as any;
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(
        new Date().toLocaleString("pt-BR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Welcome */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>
          Bem-vindo, {user?.name?.split(" ")[0] || "Usuário"}
        </h1>
        <p style={{ fontSize: "13px", color: "var(--muted)" }}>
          {currentTime} &middot; Aqui está o resumo do seu sistema.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="stat-card__header">
            <span className="stat-card__label">Usuários Ativos</span>
            <div className="stat-card__icon stat-card__icon--blue">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
              </svg>
            </div>
          </div>
          <div className="stat-card__value">1</div>
          <span className="stat-card__change stat-card__change--up">Sistema inicializado</span>
        </div>

        <div className="stat-card">
          <div className="stat-card__header">
            <span className="stat-card__label">Integrações</span>
            <div className="stat-card__icon stat-card__icon--purple">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
          </div>
          <div className="stat-card__value">0</div>
          <span className="stat-card__change">Nenhuma configurada</span>
        </div>

        <div className="stat-card">
          <div className="stat-card__header">
            <span className="stat-card__label">Dashboards</span>
            <div className="stat-card__icon stat-card__icon--green">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18"/>
                <path d="M9 21V9"/>
              </svg>
            </div>
          </div>
          <div className="stat-card__value">0</div>
          <span className="stat-card__change">Pronto para criar</span>
        </div>

        <div className="stat-card">
          <div className="stat-card__header">
            <span className="stat-card__label">Uptime</span>
            <div className="stat-card__icon stat-card__icon--orange">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
            </div>
          </div>
          <div className="stat-card__value">99.9%</div>
          <span className="stat-card__change stat-card__change--up">Servidor estável</span>
        </div>
      </div>

      {/* Two Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {/* Activity */}
        <div className="widget-panel">
          <div className="widget-panel__header">
            <span className="widget-panel__title">Atividade Recente</span>
            <button className="widget-panel__action">Ver tudo</button>
          </div>
          <ul className="activity-list">
            <li className="activity-item">
              <span className="activity-item__dot activity-item__dot--green"></span>
              <div className="activity-item__content">
                <p className="activity-item__text">Sistema SGI inicializado</p>
                <span className="activity-item__time">Agora</span>
              </div>
            </li>
            <li className="activity-item">
              <span className="activity-item__dot activity-item__dot--blue"></span>
              <div className="activity-item__content">
                <p className="activity-item__text">Usuário SYS ADMIN criado</p>
                <span className="activity-item__time">Hoje</span>
              </div>
            </li>
            <li className="activity-item">
              <span className="activity-item__dot activity-item__dot--blue"></span>
              <div className="activity-item__content">
                <p className="activity-item__text">SSO Google configurado</p>
                <span className="activity-item__time">Hoje</span>
              </div>
            </li>
            <li className="activity-item">
              <span className="activity-item__dot activity-item__dot--orange"></span>
              <div className="activity-item__content">
                <p className="activity-item__text">Deploy automático ativado</p>
                <span className="activity-item__time">Hoje</span>
              </div>
            </li>
          </ul>
        </div>

        {/* System Info */}
        <div className="widget-panel">
          <div className="widget-panel__header">
            <span className="widget-panel__title">Informações do Sistema</span>
            <a href="/status" className="widget-panel__action">Status completo</a>
          </div>
          <div className="system-info">
            <div className="system-info__item">
              <span className="system-info__label">Versão</span>
              <span className="system-info__value">v0.4.0</span>
            </div>
            <div className="system-info__item">
              <span className="system-info__label">Ambiente</span>
              <span className="system-info__value">Produção</span>
            </div>
            <div className="system-info__item">
              <span className="system-info__label">Servidor</span>
              <span className="system-info__value">VMX-DOCKER</span>
            </div>
            <div className="system-info__item">
              <span className="system-info__label">Banco</span>
              <span className="system-info__value">TiDB Cloud</span>
            </div>
            <div className="system-info__item">
              <span className="system-info__label">Runtime</span>
              <span className="system-info__value">Next.js 16</span>
            </div>
            <div className="system-info__item">
              <span className="system-info__label">Node</span>
              <span className="system-info__value">v22.x</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="widget-panel" style={{ marginTop: "16px" }}>
        <div className="widget-panel__header">
          <span className="widget-panel__title">Ações Rápidas</span>
        </div>
        <div className="quick-actions">
          <a href="/configuracoes/integracoes" className="quick-action">
            <div className="quick-action__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </div>
            <div>
              <div className="quick-action__text">Nova Integração</div>
              <div className="quick-action__desc">Conectar fonte de dados</div>
            </div>
          </a>
          <a href="/configuracoes/usuarios" className="quick-action">
            <div className="quick-action__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </div>
            <div>
              <div className="quick-action__text">Adicionar Usuário</div>
              <div className="quick-action__desc">Gerenciar equipe</div>
            </div>
          </a>
          <a href="/configuracoes/metas" className="quick-action">
            <div className="quick-action__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33"/>
              </svg>
            </div>
            <div>
              <div className="quick-action__text">Configurações</div>
              <div className="quick-action__desc">Personalizar sistema</div>
            </div>
          </a>
        </div>
      </div>
    </>
  );
}
