"use client";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { useRole } from "@/app/contexts/RoleContext";
import "@/styles/sidebar.css";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const user = session?.user as any;

  const {
    canSimulate,
    isSimulating,
    simulatedRole,
    setSimulatedRole,
    allRoles,
    activeRole,
    hasPermission,
  } = useRole();

  const showDashboard = hasPermission('dashboard.painel');
  const showVendas = hasPermission('dashboard.vendas');
  const showEstoque = hasPermission('estoque.catalogo');
  const showMetas = hasPermission('config.metas');
  const showIntegracoes = hasPermission('config.integracoes');
  const showUsuarios = hasPermission('admin.usuarios');
  const showPermissoes = hasPermission('admin.permissoes');
  const showConfigSection = showMetas || showIntegracoes;
  const showAdminSection = showUsuarios || showPermissoes;

  return (
    <div className={`dashboard-container ${isSimulating ? 'simulating' : ''}`}>
      {/* Banner de simulação */}
      {isSimulating && (
        <div className="sim-banner">
          <span>Simulando perfil: <strong>{activeRole?.label || simulatedRole}</strong></span>
          <button onClick={() => setSimulatedRole('')}>Sair da simulação</button>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : "sidebar--closed"}`}>
        <div className="sidebar__header">
          <div className="sidebar__logo">
            <span className="sidebar__logo-text">SGI</span>
            <span className="sidebar__logo-dot">.</span>
          </div>
          {sidebarOpen && <span className="sidebar__version">v0.4.1</span>}
        </div>

        <nav className="sidebar__nav">
          <div className="nav-section">
            <span className="nav-section__title">Principal</span>
            {showDashboard && (
              <a href="/dashboard" className="nav-item">
                <svg className="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
                {sidebarOpen && <span>Painel</span>}
              </a>
            )}
            {showVendas && (
              <a href="/dashboard/vendas" className="nav-item">
                <svg className="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>
                </svg>
                {sidebarOpen && <span>Vendas</span>}
              </a>
            )}
            {showEstoque && (
              <a href="/estoque" className="nav-item">
                <svg className="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
                {sidebarOpen && <span>Estoque</span>}
              </a>
            )}
          </div>

          {showConfigSection && (
            <div className="nav-section">
              <span className="nav-section__title">Configurações</span>
              <button
                className="nav-item nav-item--expandable"
                onClick={() => setConfigOpen(!configOpen)}
              >
                <svg className="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                {sidebarOpen && (
                  <>
                    <span>Configurações</span>
                    <svg className={`nav-item__arrow ${configOpen ? "nav-item__arrow--open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </>
                )}
              </button>
              {configOpen && sidebarOpen && (
                <div className="nav-submenu">
                  {showMetas && (
                    <a href="/configuracoes/metas" className="nav-item nav-item--sub">
                      <svg className="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/>
                      </svg>
                      <span>Metas</span>
                    </a>
                  )}
                  {showIntegracoes && (
                    <a href="/configuracoes/integracoes" className="nav-item nav-item--sub">
                      <svg className="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                        <path d="M2 17l10 5 10-5"/>
                        <path d="M2 12l10 5 10-5"/>
                      </svg>
                      <span>Integrações</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {showAdminSection && (
            <div className="nav-section">
              <span className="nav-section__title">Administração</span>
              {showUsuarios && (
                <a href="/configuracoes/usuarios" className="nav-item">
                  <svg className="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  {sidebarOpen && <span>Usuários</span>}
                </a>
              )}
              {showPermissoes && (
                <a href="/configuracoes/permissoes" className="nav-item">
                  <svg className="nav-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  {sidebarOpen && <span>Permissões</span>}
                </a>
              )}
            </div>
          )}
        </nav>

        <div className="sidebar__footer">
          {/* Simulador de Perfil */}
          {canSimulate && sidebarOpen && (
            <div className="sim-selector">
              <label className="sim-selector__label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                Simular Perfil
              </label>
              <select
                className="sim-selector__select"
                value={simulatedRole}
                onChange={e => setSimulatedRole(e.target.value)}
              >
                <option value="">Meu perfil ({user?.role === 'sysadmin' ? 'SYS ADMIN' : 'Admin'})</option>
                {allRoles.map(r => (
                  <option key={r.name} value={r.name}>{r.label}</option>
                ))}
              </select>
            </div>
          )}
          <button
            className="sidebar__toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-item__icon">
              {sidebarOpen ? (
                <path d="M15 18l-6-6 6-6"/>
              ) : (
                <path d="M9 18l6-6-6-6"/>
              )}
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <header className="topbar">
          <div className="topbar__left">
            <h2 className="topbar__title">Painel de Controle</h2>
          </div>
          <div className="topbar__right">
            <div className="topbar__user">
              <div className="topbar__avatar">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="topbar__user-info">
                <span className="topbar__user-name">{user?.name || "Usuário"}</span>
                <span className="topbar__user-role">{isSimulating ? `${activeRole?.label} (simulado)` : (user?.roleLabel || user?.role || "—")}</span>
              </div>
            </div>
            <button
              className="topbar__logout"
              onClick={() => signOut({ callbackUrl: "/" })}
              title="Sair"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16,17 21,12 16,7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
