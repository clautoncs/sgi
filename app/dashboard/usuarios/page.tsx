'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './usuarios.css';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  provider: 'local' | 'google';
  role: string;
  isActive: boolean;
  isApproved: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

interface Role {
  id: string;
  name: string;
  label: string;
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'blocked'>('all');
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'viewer' });

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch('/api/usuarios'),
        fetch('/api/permissoes'),
      ]);
      const usersData = await usersRes.json();
      const rolesData = await rolesRes.json();
      setUsers(usersData.users || []);
      setRoles(rolesData.roles || []);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = async (action: string, data: any) => {
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data }),
      });
      const result = await res.json();
      if (result.success) {
        fetchData();
        setShowCreateModal(false);
        setEditingUser(null);
        setNewUser({ name: '', email: '', role: 'viewer' });
      } else {
        alert(result.error || 'Erro ao processar');
      }
    } catch (err) {
      alert('Erro de conexão');
    }
  };

  const filteredUsers = users.filter(u => {
    if (filter === 'active') return u.isActive && u.isApproved;
    if (filter === 'pending') return !u.isApproved;
    if (filter === 'blocked') return !u.isActive;
    return true;
  });

  const pendingCount = users.filter(u => !u.isApproved).length;

  const getRoleLabel = (roleName: string) => {
    const role = roles.find(r => r.name === roleName);
    return role?.label || roleName;
  };

  if (loading) {
    return (
      <div className="usuarios-loading">
        <div className="spinner" />
        <p>Carregando usuários...</p>
      </div>
    );
  }

  return (
    <div className="usuarios-page">
      <div className="page-header">
        <div>
          <h1>Gerenciar Usuários</h1>
          <p className="page-subtitle">{users.length} usuários cadastrados</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          + Novo Usuário
        </button>
      </div>

      {/* Filtros */}
      <div className="filter-tabs">
        <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Todos ({users.length})
        </button>
        <button className={`filter-tab ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>
          Ativos ({users.filter(u => u.isActive && u.isApproved).length})
        </button>
        <button className={`filter-tab ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>
          Pendentes ({pendingCount})
          {pendingCount > 0 && <span className="pending-badge">{pendingCount}</span>}
        </button>
        <button className={`filter-tab ${filter === 'blocked' ? 'active' : ''}`} onClick={() => setFilter('blocked')}>
          Bloqueados ({users.filter(u => !u.isActive).length})
        </button>
      </div>

      {/* Lista de Usuários */}
      <div className="users-grid">
        <AnimatePresence>
          {filteredUsers.map((user, idx) => (
            <motion.div
              key={user.id}
              className={`user-card ${!user.isActive ? 'blocked' : ''} ${!user.isApproved ? 'pending' : ''}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: idx * 0.05 }}
            >
              <div className="user-card-header">
                <div className="user-avatar">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} />
                  ) : (
                    <span>{user.name.charAt(0).toUpperCase()}</span>
                  )}
                  <span className={`status-dot ${user.isActive && user.isApproved ? 'online' : !user.isApproved ? 'pending' : 'offline'}`} />
                </div>
                <div className="user-info">
                  <h3>{user.name}</h3>
                  <p className="user-email">{user.email}</p>
                </div>
                <span className={`provider-badge ${user.provider}`}>
                  {user.provider === 'google' ? '🔵 Google' : '🔒 Local'}
                </span>
              </div>

              <div className="user-card-body">
                <div className="user-meta">
                  <span className="role-tag">{getRoleLabel(user.role)}</span>
                  <span className="user-date">
                    Criado: {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                {user.lastLoginAt && (
                  <p className="last-login">
                    Último acesso: {new Date(user.lastLoginAt).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>

              <div className="user-card-actions">
                {!user.isApproved && (
                  <button className="btn-approve" onClick={() => handleAction('approve', { id: user.id })}>
                    ✓ Aprovar
                  </button>
                )}
                {user.isActive && user.isApproved && (
                  <button className="btn-edit" onClick={() => setEditingUser(user)}>
                    Editar
                  </button>
                )}
                {user.isActive ? (
                  <button className="btn-block" onClick={() => handleAction('block', { id: user.id })}>
                    Bloquear
                  </button>
                ) : (
                  <button className="btn-approve" onClick={() => handleAction('approve', { id: user.id })}>
                    Reativar
                  </button>
                )}
                <button className="btn-delete" onClick={() => {
                  if (confirm(`Excluir ${user.name}?`)) handleAction('delete', { id: user.id });
                }}>
                  ✕
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filteredUsers.length === 0 && (
        <p className="no-results">Nenhum usuário encontrado com este filtro</p>
      )}

      {/* Modal Criar Usuário */}
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
              <h2>Novo Usuário</h2>
              <div className="form-group">
                <label>Nome</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="Nome completo"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="form-group">
                <label>Perfil de Acesso</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                >
                  {roles.map(r => (
                    <option key={r.id} value={r.name}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                <button
                  className="btn-primary"
                  onClick={() => handleAction('create', { ...newUser, provider: 'local' })}
                  disabled={!newUser.name || !newUser.email}
                >
                  Criar Usuário
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Editar Usuário */}
      <AnimatePresence>
        {editingUser && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditingUser(null)}
          >
            <motion.div
              className="modal-content"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <h2>Editar Usuário</h2>
              <div className="form-group">
                <label>Nome</label>
                <input
                  type="text"
                  value={editingUser.name}
                  onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={editingUser.email} disabled className="disabled" />
              </div>
              <div className="form-group">
                <label>Perfil de Acesso</label>
                <select
                  value={editingUser.role}
                  onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}
                >
                  {roles.map(r => (
                    <option key={r.id} value={r.name}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setEditingUser(null)}>Cancelar</button>
                <button
                  className="btn-primary"
                  onClick={() => handleAction('update', { id: editingUser.id, name: editingUser.name, role: editingUser.role })}
                >
                  Salvar Alterações
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
