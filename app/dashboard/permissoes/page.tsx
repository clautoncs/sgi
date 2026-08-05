'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './permissoes.css';

interface Permission {
  page: string;
  label: string;
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
  permissions: Permission[];
  createdAt: string;
}

interface PageDef {
  code: string;
  label: string;
  module: string;
}

export default function PermissoesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [pages, setPages] = useState<PageDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', label: '', description: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/permissoes');
      const data = await res.json();
      setRoles(data.roles || []);
      setPages(data.pages || []);
      if (!selectedRole && data.roles?.length > 0) {
        setSelectedRole(data.roles[0]);
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
    const updated = { ...selectedRole };
    const perm = updated.permissions.find(p => p.page === pageCode);
    if (!perm) return;

    // Lógica: manage implica edit, edit implica view
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

  const handleSave = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      const res = await fetch('/api/permissoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_role', id: selectedRole.id, permissions: selectedRole.permissions }),
      });
      const result = await res.json();
      if (result.success) {
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
        fetchData();
        setShowCreateModal(false);
        setNewRole({ name: '', label: '', description: '' });
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
        fetchData();
      } else {
        alert(result.error);
      }
    } catch {
      alert('Erro de conexão');
    }
  };

  // Agrupar páginas por módulo
  const groupedPages = pages.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {} as Record<string, PageDef[]>);

  if (loading) {
    return (
      <div className="permissoes-loading">
        <div className="spinner" />
        <p>Carregando permissões...</p>
      </div>
    );
  }

  return (
    <div className="permissoes-page">
      <div className="page-header">
        <div>
          <h1>Perfis e Permissões</h1>
          <p className="page-subtitle">Configure o acesso de cada perfil às páginas do sistema</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          + Novo Perfil
        </button>
      </div>

      <div className="permissoes-layout">
        {/* Sidebar de Perfis */}
        <div className="roles-sidebar">
          <h3>Perfis</h3>
          {roles.map(role => (
            <motion.div
              key={role.id}
              className={`role-item ${selectedRole?.id === role.id ? 'active' : ''}`}
              onClick={() => setSelectedRole(role)}
              whileHover={{ x: 4 }}
            >
              <div className="role-item-info">
                <span className="role-item-label">{role.label}</span>
                <span className="role-item-desc">{role.description}</span>
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
                  <p>{selectedRole.description}</p>
                </div>
                <button
                  className="btn-save"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>

              <div className="permissions-table">
                <div className="table-header">
                  <span className="col-page">Página</span>
                  <span className="col-perm">Visualizar</span>
                  <span className="col-perm">Editar</span>
                  <span className="col-perm">Gerenciar</span>
                </div>

                {Object.entries(groupedPages).map(([module, modulePages]) => (
                  <div key={module} className="module-group">
                    <div className="module-header">{module}</div>
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
                        </motion.div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="permissions-legend">
                <span><strong>Visualizar:</strong> Pode ver a página</span>
                <span><strong>Editar:</strong> Pode modificar dados</span>
                <span><strong>Gerenciar:</strong> Controle total (inclui editar)</span>
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
    </div>
  );
}
