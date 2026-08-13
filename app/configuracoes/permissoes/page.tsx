'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './permissoes.css';

interface Permission {
  page: string;
  view: boolean;
  edit: boolean;
  manage: boolean;
}

interface Role {
  id: string;
  name: string;
  label: string;
  description: string;
  isSystem: boolean;
  estoqueProfile: string;
  permissions: Permission[];
  createdAt: string;
}

interface PageDef {
  code: string;
  label: string;
  module: string;
}

interface EstoqueProfile {
  code: string;
  label: string;
  description: string;
}

interface RolesDB {
  defaultRole: string;
  defaultEstoqueProfile: string;
  pages: PageDef[];
  estoqueProfiles: EstoqueProfile[];
  roles: Role[];
}

export default function PermissoesPage() {
  const [db, setDb] = useState<RolesDB | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPageModal, setShowPageModal] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', label: '', description: '', estoqueProfile: 'varejo' });
  const [newPage, setNewPage] = useState({ code: '', label: '', module: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/permissoes');
      const data: RolesDB = await res.json();
      setDb(data);
      if (!selectedRole && data.roles?.length > 0) {
        setSelectedRole(data.roles[0]);
      } else if (selectedRole) {
        const updated = data.roles.find(r => r.id === selectedRole.id);
        if (updated) setSelectedRole(updated);
      }
    } catch (err) {
      console.error('Erro:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = (pageCode: string, level: 'view' | 'edit' | 'manage') => {
    if (!selectedRole) return;
    const updated = { ...selectedRole, permissions: [...selectedRole.permissions] };
    const permIdx = updated.permissions.findIndex(p => p.page === pageCode);
    if (permIdx === -1) return;
    const perm = { ...updated.permissions[permIdx] };
    updated.permissions[permIdx] = perm;

    if (level === 'manage') {
      perm.manage = !perm.manage;
      if (perm.manage) { perm.edit = true; perm.view = true; }
    } else if (level === 'edit') {
      perm.edit = !perm.edit;
      if (perm.edit) { perm.view = true; }
      if (!perm.edit) { perm.manage = false; }
    } else {
      perm.view = !perm.view;
      if (!perm.view) { perm.edit = false; perm.manage = false; }
    }
    setSelectedRole(updated);
  };

  const handleEstoqueProfileChange = (profile: string) => {
    if (!selectedRole) return;
    setSelectedRole({ ...selectedRole, estoqueProfile: profile });
  };

  const handleSave = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      const res = await fetch('/api/permissoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_role',
          id: selectedRole.id,
          permissions: selectedRole.permissions,
          estoqueProfile: selectedRole.estoqueProfile,
        }),
      });
      const result = await res.json();
      if (result.success) {
        showToast('Permissões salvas com sucesso!');
        fetchData();
      } else {
        alert(result.error || 'Erro ao salvar');
      }
    } catch {
      alert('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async () => {
    try {
      const res = await fetch('/api/permissoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_role', ...newRole }),
      });
      const result = await res.json();
      if (result.success) {
        showToast('Perfil criado com sucesso!');
        fetchData();
        setShowCreateModal(false);
        setNewRole({ name: '', label: '', description: '', estoqueProfile: 'varejo' });
        setSelectedRole(result.role);
      } else {
        alert(result.error);
      }
    } catch {
      alert('Erro de conexão');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('Excluir este perfil? Usuários associados perderão acesso.')) return;
    try {
      const res = await fetch('/api/permissoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_role', id: roleId }),
      });
      const result = await res.json();
      if (result.success) {
        setSelectedRole(null);
        showToast('Perfil excluído');
        fetchData();
      } else {
        alert(result.error);
      }
    } catch {
      alert('Erro de conexão');
    }
  };

  const handleUpdateDefaults = async (field: string, value: string) => {
    try {
      const res = await fetch('/api/permissoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_defaults', [field]: value }),
      });
      const result = await res.json();
      if (result.success) {
        showToast('Configuração padrão atualizada!');
        fetchData();
      }
    } catch {
      alert('Erro de conexão');
    }
  };

  const handleAddPage = async () => {
    if (!newPage.code || !newPage.label || !newPage.module) return;
    try {
      const res = await fetch('/api/permissoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_page', ...newPage }),
      });
      const result = await res.json();
      if (result.success) {
        showToast('Página adicionada!');
        setShowPageModal(false);
        setNewPage({ code: '', label: '', module: '' });
        fetchData();
      } else {
        alert(result.error);
      }
    } catch {
      alert('Erro de conexão');
    }
  };

  const handleRemovePage = async (code: string) => {
    if (!confirm(`Remover a página "${code}" de todos os perfis?`)) return;
    try {
      const res = await fetch('/api/permissoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_page', code }),
      });
      const result = await res.json();
      if (result.success) {
        showToast('Página removida');
        fetchData();
      }
    } catch {
      alert('Erro de conexão');
    }
  };

  const handleToggleAll = (module: string, level: 'view' | 'edit' | 'manage', enable: boolean) => {
    if (!selectedRole || !db) return;
    const moduleCodes = db.pages.filter(p => p.module === module).map(p => p.code);
    const updated = { ...selectedRole, permissions: [...selectedRole.permissions] };
    for (let i = 0; i < updated.permissions.length; i++) {
      if (moduleCodes.includes(updated.permissions[i].page)) {
        const perm = { ...updated.permissions[i] };
        if (level === 'manage') {
          perm.manage = enable;
          if (enable) { perm.edit = true; perm.view = true; }
        } else if (level === 'edit') {
          perm.edit = enable;
          if (enable) { perm.view = true; }
          if (!enable) { perm.manage = false; }
        } else {
          perm.view = enable;
          if (!enable) { perm.edit = false; perm.manage = false; }
        }
        updated.permissions[i] = perm;
      }
    }
    setSelectedRole(updated);
  };

  // Agrupar páginas por módulo
  const groupedPages = db?.pages.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {} as Record<string, PageDef[]>) || {};

  if (loading || !db) {
    return (
      <div className="permissoes-loading">
        <div className="spinner" />
        <p>Carregando permissões...</p>
      </div>
    );
  }

  return (
    <div className="permissoes-page">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast-notification"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="page-header">
        <div>
          <h1>Perfis e Permissões</h1>
          <p className="page-subtitle">Configure o acesso de cada perfil às páginas e funcionalidades do sistema</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowPageModal(true)}>
            + Página
          </button>
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            + Novo Perfil
          </button>
        </div>
      </div>

      {/* Configurações Padrão */}
      <div className="defaults-section">
        <h3>Configurações Padrão para Novos Usuários</h3>
        <div className="defaults-grid">
          <div className="default-item">
            <label>Perfil padrão:</label>
            <select
              value={db.defaultRole}
              onChange={(e) => handleUpdateDefaults('defaultRole', e.target.value)}
            >
              {db.roles.map(r => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="default-item">
            <label>Perfil de estoque padrão:</label>
            <select
              value={db.defaultEstoqueProfile}
              onChange={(e) => handleUpdateDefaults('defaultEstoqueProfile', e.target.value)}
            >
              {db.estoqueProfiles.map(ep => (
                <option key={ep.code} value={ep.code}>{ep.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="permissoes-layout">
        {/* Sidebar de Perfis */}
        <div className="roles-sidebar">
          <h3>Perfis</h3>
          {db.roles.map(role => (
            <motion.div
              key={role.id}
              className={`role-item ${selectedRole?.id === role.id ? 'active' : ''}`}
              onClick={() => setSelectedRole(role)}
              whileHover={{ x: 4 }}
            >
              <div className="role-item-info">
                <span className="role-item-label">{role.label}</span>
                <span className="role-item-desc">{role.description}</span>
                <span className="role-estoque-badge">{
                  db.estoqueProfiles.find(ep => ep.code === role.estoqueProfile)?.label || role.estoqueProfile
                }</span>
              </div>
              {role.isSystem && <span className="system-badge">Sistema</span>}
              {!role.isSystem && (
                <button
                  className="role-delete-btn"
                  onClick={e => { e.stopPropagation(); handleDeleteRole(role.id); }}
                >
                  ✕
                </button>
              )}
            </motion.div>
          ))}
        </div>

        {/* Configurador de Permissões */}
        <div className="permissions-editor">
          {selectedRole ? (
            <>
              <div className="editor-header">
                <div>
                  <h2>{selectedRole.label}</h2>
                  <p className="editor-desc">{selectedRole.description}</p>
                </div>
                <button
                  className="btn-save"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>

              {/* Perfil de Estoque */}
              <div className="estoque-profile-section">
                <h3>Perfil de Visualização do Estoque</h3>
                <p className="section-desc">Define quais informações de preço este perfil pode ver no catálogo</p>
                <div className="estoque-profiles-grid">
                  {db.estoqueProfiles.map(ep => (
                    <motion.div
                      key={ep.code}
                      className={`estoque-profile-card ${selectedRole.estoqueProfile === ep.code ? 'active' : ''}`}
                      onClick={() => handleEstoqueProfileChange(ep.code)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="ep-radio">
                        <div className={`ep-radio-dot ${selectedRole.estoqueProfile === ep.code ? 'checked' : ''}`} />
                      </div>
                      <div className="ep-info">
                        <span className="ep-label">{ep.label}</span>
                        <span className="ep-desc">{ep.description}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Permissões por Módulo */}
              <div className="permissions-table">
                <div className="permissions-header-row">
                  <span className="col-page">Página</span>
                  <span className="col-perm">Visualizar</span>
                  <span className="col-perm">Editar</span>
                  <span className="col-perm">Gerenciar</span>
                  <span className="col-action"></span>
                </div>

                {Object.entries(groupedPages).map(([module, modulePages]) => (
                  <div key={module} className="permission-module">
                    <div className="module-header">
                      <span className="module-name">{module}</span>
                      <div className="module-toggles">
                        <button
                          className="module-toggle-btn"
                          onClick={() => handleToggleAll(module, 'view', true)}
                          title="Ativar todas visualizações"
                        >
                          Todos ✓
                        </button>
                        <button
                          className="module-toggle-btn off"
                          onClick={() => handleToggleAll(module, 'view', false)}
                          title="Desativar todas"
                        >
                          Nenhum ✕
                        </button>
                      </div>
                    </div>
                    {modulePages.map(page => {
                      const perm = selectedRole.permissions.find(p => p.page === page.code);
                      return (
                        <motion.div
                          key={page.code}
                          className="permission-row"
                          whileHover={{ backgroundColor: 'rgba(30, 41, 59, 0.5)' }}
                        >
                          <span className="col-page">{page.label}</span>
                          <span className="col-perm">
                            <label className="toggle">
                              <input
                                type="checkbox"
                                checked={perm?.view || false}
                                onChange={() => handleToggle(page.code, 'view')}
                              />
                              <span className="toggle-slider view" />
                            </label>
                          </span>
                          <span className="col-perm">
                            <label className="toggle">
                              <input
                                type="checkbox"
                                checked={perm?.edit || false}
                                onChange={() => handleToggle(page.code, 'edit')}
                              />
                              <span className="toggle-slider edit" />
                            </label>
                          </span>
                          <span className="col-perm">
                            <label className="toggle">
                              <input
                                type="checkbox"
                                checked={perm?.manage || false}
                                onChange={() => handleToggle(page.code, 'manage')}
                              />
                              <span className="toggle-slider manage" />
                            </label>
                          </span>
                          <span className="col-action">
                            {!['dashboard.painel', 'dashboard.vendas', 'estoque.catalogo', 'admin.usuarios', 'admin.permissoes'].includes(page.code) && (
                              <button
                                className="page-remove-btn"
                                onClick={() => handleRemovePage(page.code)}
                                title="Remover página"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="permissions-legend">
                <span><strong>Visualizar:</strong> Pode ver a página</span>
                <span><strong>Editar:</strong> Pode modificar dados</span>
                <span><strong>Gerenciar:</strong> Controle total (aprovar pedidos, excluir, etc.)</span>
              </div>
            </>
          ) : (
            <div className="no-selection">
              <p>Selecione um perfil para configurar suas permissões</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Criar Perfil */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              className="modal-content"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <h2>Novo Perfil de Acesso</h2>
              <div className="form-group">
                <label>Identificador (slug)</label>
                <input
                  type="text"
                  value={newRole.name}
                  onChange={e => setNewRole({ ...newRole, name: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                  placeholder="ex: supervisor"
                />
              </div>
              <div className="form-group">
                <label>Nome de Exibição</label>
                <input
                  type="text"
                  value={newRole.label}
                  onChange={e => setNewRole({ ...newRole, label: e.target.value })}
                  placeholder="ex: Supervisor de Vendas"
                />
              </div>
              <div className="form-group">
                <label>Descrição</label>
                <input
                  type="text"
                  value={newRole.description}
                  onChange={e => setNewRole({ ...newRole, description: e.target.value })}
                  placeholder="Breve descrição do perfil"
                />
              </div>
              <div className="form-group">
                <label>Perfil de Estoque</label>
                <select
                  value={newRole.estoqueProfile}
                  onChange={e => setNewRole({ ...newRole, estoqueProfile: e.target.value })}
                >
                  {db.estoqueProfiles.map(ep => (
                    <option key={ep.code} value={ep.code}>{ep.label}</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                <button
                  className="btn-primary"
                  onClick={handleCreateRole}
                  disabled={!newRole.name || !newRole.label}
                >
                  Criar Perfil
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Adicionar Página */}
      <AnimatePresence>
        {showPageModal && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPageModal(false)}
          >
            <motion.div
              className="modal-content"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <h2>Adicionar Nova Página ao Sistema</h2>
              <p className="modal-desc">Adicione uma nova página/funcionalidade para controlar permissões</p>
              <div className="form-group">
                <label>Código (identificador único)</label>
                <input
                  type="text"
                  value={newPage.code}
                  onChange={e => setNewPage({ ...newPage, code: e.target.value.toLowerCase().replace(/\s/g, '.') })}
                  placeholder="ex: relatorios.comissoes"
                />
              </div>
              <div className="form-group">
                <label>Nome de Exibição</label>
                <input
                  type="text"
                  value={newPage.label}
                  onChange={e => setNewPage({ ...newPage, label: e.target.value })}
                  placeholder="ex: Relatório de Comissões"
                />
              </div>
              <div className="form-group">
                <label>Módulo</label>
                <input
                  type="text"
                  value={newPage.module}
                  onChange={e => setNewPage({ ...newPage, module: e.target.value })}
                  placeholder="ex: Relatórios"
                  list="modules-list"
                />
                <datalist id="modules-list">
                  {Object.keys(groupedPages).map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setShowPageModal(false)}>Cancelar</button>
                <button
                  className="btn-primary"
                  onClick={handleAddPage}
                  disabled={!newPage.code || !newPage.label || !newPage.module}
                >
                  Adicionar Página
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
