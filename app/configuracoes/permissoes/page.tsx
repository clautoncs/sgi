'use client';
import { useState, useEffect, useCallback } from 'react';
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
}

interface PageDef {
  code: string;
  label: string;
  module: string;
}

interface RolesDB {
  defaultRole: string;
  defaultEstoqueProfile: string;
  pages: PageDef[];
  estoqueProfiles: { code: string; label: string; description: string }[];
  roles: Role[];
}

export default function PermissoesPage() {
  const [db, setDb] = useState<RolesDB | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newRole, setNewRole] = useState({ label: '', description: '', estoqueProfile: 'varejo' });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/permissoes');
      const data: RolesDB = await res.json();
      setDb(data);
      if (!selectedRoleId && data.roles?.length > 0) setSelectedRoleId(data.roles[0].id);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedRole = db?.roles.find(r => r.id === selectedRoleId) || null;

  const handleToggle = (pageCode: string, level: 'view' | 'edit' | 'manage') => {
    if (!db || !selectedRole) return;
    const updatedRoles = db.roles.map(r => {
      if (r.id !== selectedRole.id) return r;
      const perms = r.permissions.map(p => {
        if (p.page !== pageCode) return p;
        return { ...p, [level]: !p[level] };
      });
      return { ...r, permissions: perms };
    });
    setDb({ ...db, roles: updatedRoles });
  };

  const handleEstoqueChange = (profile: string) => {
    if (!db || !selectedRole) return;
    const updatedRoles = db.roles.map(r => r.id === selectedRole.id ? { ...r, estoqueProfile: profile } : r);
    setDb({ ...db, roles: updatedRoles });
  };

  const handleDefaultChange = (field: string, value: string) => {
    if (!db) return;
    setDb({ ...db, [field]: value });
  };

  const handleSave = async () => {
    if (!db) return;
    setSaving(true);
    try {
      await fetch('/api/permissoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(db),
      });
      showToast('Permissões salvas com sucesso!');
      fetchData();
    } catch { showToast('Erro ao salvar'); } finally { setSaving(false); }
  };

  const handleCreateRole = async () => {
    if (!db || !newRole.label) return;
    const id = 'role_' + newRole.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const name = newRole.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const permissions = db.pages.map(p => ({ page: p.code, view: false, edit: false, manage: false }));
    const role: Role = { id, name, label: newRole.label, description: newRole.description, isSystem: false, estoqueProfile: newRole.estoqueProfile, permissions };
    const updated = { ...db, roles: [...db.roles, role] };
    setDb(updated);
    setSelectedRoleId(id);
    setShowCreate(false);
    setNewRole({ label: '', description: '', estoqueProfile: 'varejo' });
    // Salvar imediatamente
    await fetch('/api/permissoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    showToast(`Perfil "${role.label}" criado!`);
    fetchData();
  };

  const handleDeleteRole = async () => {
    if (!db || !selectedRole || selectedRole.isSystem) return;
    if (!confirm(`Excluir o perfil "${selectedRole.label}"?`)) return;
    const updated = { ...db, roles: db.roles.filter(r => r.id !== selectedRole.id) };
    setDb(updated);
    setSelectedRoleId(updated.roles[0]?.id || '');
    await fetch('/api/permissoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    showToast('Perfil excluído');
    fetchData();
  };

  if (loading) return <div className="perm-loading"><div className="spinner" /><p>Carregando...</p></div>;
  if (!db) return <div className="perm-loading"><p>Erro ao carregar dados</p></div>;

  const modules = [...new Set(db.pages.map(p => p.module))];

  return (
    <div className="perm-page">
      {toast && <div className="perm-toast">{toast}</div>}

      {/* Header */}
      <div className="perm-header">
        <div>
          <h1>Permissões</h1>
          <p className="perm-subtitle">{db.roles.length} perfis configurados</p>
        </div>
        <div className="perm-header-actions">
          <button className="btn-create" onClick={() => setShowCreate(true)}>+ Novo Perfil</button>
          <button className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* Configuração Padrão */}
      <div className="perm-defaults">
        <h3>Padrão para Novos Usuários</h3>
        <div className="perm-defaults-row">
          <div className="perm-field">
            <label>Perfil padrão</label>
            <select value={db.defaultRole} onChange={e => handleDefaultChange('defaultRole', e.target.value)}>
              {db.roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div className="perm-field">
            <label>Estoque padrão</label>
            <select value={db.defaultEstoqueProfile} onChange={e => handleDefaultChange('defaultEstoqueProfile', e.target.value)}>
              {db.estoqueProfiles.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Seletor de Perfil */}
      <div className="perm-roles-tabs">
        {db.roles.map(r => (
          <button
            key={r.id}
            className={`perm-role-tab ${selectedRoleId === r.id ? 'active' : ''}`}
            onClick={() => setSelectedRoleId(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Detalhes do Perfil Selecionado */}
      {selectedRole && (
        <div className="perm-detail">
          <div className="perm-detail-header">
            <div>
              <h2>{selectedRole.label}</h2>
              <p className="perm-desc">{selectedRole.description}</p>
            </div>
            {!selectedRole.isSystem && (
              <button className="btn-delete" onClick={handleDeleteRole}>Excluir Perfil</button>
            )}
          </div>

          {/* Perfil de Estoque */}
          <div className="perm-estoque-section">
            <h3>Visualização do Estoque</h3>
            <div className="perm-estoque-options">
              {db.estoqueProfiles.map(p => (
                <label key={p.code} className={`perm-estoque-option ${selectedRole.estoqueProfile === p.code ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="estoque"
                    checked={selectedRole.estoqueProfile === p.code}
                    onChange={() => handleEstoqueChange(p.code)}
                  />
                  <div>
                    <strong>{p.label}</strong>
                    <span>{p.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Tabela de Permissões */}
          <div className="perm-table-wrap">
            <table className="perm-table">
              <thead>
                <tr>
                  <th>Página</th>
                  <th>Ver</th>
                  <th>Editar</th>
                  <th>Gerenciar</th>
                </tr>
              </thead>
              <tbody>
                {modules.map(mod => (
                  <>
                    <tr key={mod} className="perm-module-row">
                      <td colSpan={4}>{mod === 'dashboard' ? 'Dashboard' : mod === 'estoque' ? 'Estoque' : mod === 'config' ? 'Configurações' : 'Administração'}</td>
                    </tr>
                    {db.pages.filter(p => p.module === mod).map(page => {
                      const perm = selectedRole.permissions.find(p2 => p2.page === page.code);
                      return (
                        <tr key={page.code}>
                          <td className="perm-page-name">{page.label}</td>
                          <td><input type="checkbox" checked={perm?.view || false} onChange={() => handleToggle(page.code, 'view')} /></td>
                          <td><input type="checkbox" checked={perm?.edit || false} onChange={() => handleToggle(page.code, 'edit')} /></td>
                          <td><input type="checkbox" checked={perm?.manage || false} onChange={() => handleToggle(page.code, 'manage')} /></td>
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Criar Perfil */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Novo Perfil</h2>
            <div className="form-group">
              <label>Nome do Perfil</label>
              <input type="text" value={newRole.label} onChange={e => setNewRole({ ...newRole, label: e.target.value })} placeholder="Ex: Revendedor" />
            </div>
            <div className="form-group">
              <label>Descrição</label>
              <input type="text" value={newRole.description} onChange={e => setNewRole({ ...newRole, description: e.target.value })} placeholder="Ex: Acesso ao catálogo com preço de revenda" />
            </div>
            <div className="form-group">
              <label>Perfil de Estoque</label>
              <select value={newRole.estoqueProfile} onChange={e => setNewRole({ ...newRole, estoqueProfile: e.target.value })}>
                {db.estoqueProfiles.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleCreateRole}>Criar Perfil</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
