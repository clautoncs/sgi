'use client';

import { useState, useEffect } from 'react';

export default function ConfigMetas() {
  const [mesSelecionado, setMesSelecionado] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [metaGeral, setMetaGeral] = useState('');
  const [metasVendedores, setMetasVendedores] = useState<Record<string, string>>({
    'CLAUTON': '',
    'FLÁVIA': '',
    'YASMIN': '',
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [novoVendedor, setNovoVendedor] = useState('');

  useEffect(() => {
    fetchMetas();
  }, [mesSelecionado]);

  const fetchMetas = async () => {
    try {
      const res = await fetch(`/api/metas?month=${mesSelecionado}`);
      if (res.ok) {
        const data = await res.json();
        setMetaGeral(data.metaGeral?.toString() || '');
        const metas: Record<string, string> = { 'CLAUTON': '', 'FLÁVIA': '', 'YASMIN': '' };
        Object.entries(data.metasPorVendedor || {}).forEach(([k, v]) => {
          metas[k] = (v as number).toString();
        });
        setMetasVendedores(metas);
      }
    } catch (err) {
      console.error('Erro ao buscar metas:', err);
    }
  };

  const salvarMetas = async () => {
    setLoading(true);
    setSaved(false);
    try {
      const metasPorVendedor: Record<string, number> = {};
      Object.entries(metasVendedores).forEach(([k, v]) => {
        if (v) metasPorVendedor[k] = parseFloat(v);
      });

      const res = await fetch('/api/metas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: mesSelecionado,
          metaGeral: metaGeral ? parseFloat(metaGeral) : 0,
          metasPorVendedor,
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error('Erro ao salvar metas:', err);
    } finally {
      setLoading(false);
    }
  };

  const adicionarVendedor = () => {
    if (novoVendedor.trim()) {
      setMetasVendedores(prev => ({
        ...prev,
        [novoVendedor.trim().toUpperCase()]: '',
      }));
      setNovoVendedor('');
    }
  };

  const removerVendedor = (nome: string) => {
    setMetasVendedores(prev => {
      const novo = { ...prev };
      delete novo[nome];
      return novo;
    });
  };

  // Meses do mês atual pra trás e 12 à frente, pra dar pra definir meta de
  // mês futuro (antes era uma lista fixa travada em agosto/2026).
  const mesesDisponiveis = [];
  {
    const hoje = new Date();
    for (let i = 12; i >= -24; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      mesesDisponiveis.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      });
    }
  }

  return (
    <div className="config-metas">
      <style>{`
        .config-metas { padding: 0; }
        .config-metas h1 { font-size: 1.5rem; color: #f1f5f9; margin: 0 0 8px 0; }
        .config-metas p.subtitle { color: #64748b; margin: 0 0 24px 0; font-size: 0.9rem; }
        
        .config-section {
          background: #1e293b;
          border-radius: 12px;
          padding: 24px;
          border: 1px solid #334155;
          margin-bottom: 20px;
        }
        
        .config-section h2 {
          font-size: 1rem;
          color: #f1f5f9;
          margin: 0 0 16px 0;
          font-weight: 600;
        }
        
        .form-group {
          margin-bottom: 16px;
        }
        
        .form-group label {
          display: block;
          font-size: 0.8rem;
          color: #94a3b8;
          margin-bottom: 6px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .form-group input, .form-group select {
          width: 100%;
          padding: 10px 14px;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 8px;
          color: #f1f5f9;
          font-size: 0.9rem;
        }
        
        .form-group input:focus, .form-group select:focus {
          outline: none;
          border-color: #3b82f6;
        }
        
        .vendedor-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        
        .vendedor-row .nome {
          min-width: 120px;
          font-weight: 600;
          color: #e2e8f0;
          font-size: 0.9rem;
        }
        
        .vendedor-row input {
          flex: 1;
          padding: 10px 14px;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 8px;
          color: #f1f5f9;
          font-size: 0.9rem;
        }
        
        .vendedor-row input:focus {
          outline: none;
          border-color: #3b82f6;
        }
        
        .btn-remove {
          padding: 8px 12px;
          background: #7f1d1d;
          color: #fca5a5;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.8rem;
        }
        
        .btn-remove:hover { background: #991b1b; }
        
        .add-vendedor-row {
          display: flex;
          gap: 8px;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #334155;
        }
        
        .add-vendedor-row input {
          flex: 1;
          padding: 10px 14px;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 8px;
          color: #f1f5f9;
        }
        
        .btn-add {
          padding: 10px 20px;
          background: #1e3a5f;
          color: #60a5fa;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.85rem;
        }
        
        .btn-add:hover { background: #1e40af; color: white; }
        
        .btn-salvar {
          padding: 12px 32px;
          background: #10b981;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 1rem;
          width: 100%;
          margin-top: 8px;
        }
        
        .btn-salvar:hover { background: #059669; }
        .btn-salvar:disabled { opacity: 0.5; cursor: not-allowed; }
        
        .saved-msg {
          text-align: center;
          color: #10b981;
          font-weight: 600;
          margin-top: 12px;
          font-size: 0.9rem;
        }
      `}</style>

      <h1>Configuração de Metas</h1>
      <p className="subtitle">Defina as metas mensais por vendedor e meta geral da equipe.</p>

      <div className="config-section">
        <h2>Período</h2>
        <div className="form-group">
          <label>Mês de Referência</label>
          <select value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)}>
            {mesesDisponiveis.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="config-section">
        <h2>Meta Geral da Equipe</h2>
        <div className="form-group">
          <label>Valor Total da Meta (R$)</label>
          <input
            type="number"
            value={metaGeral}
            onChange={(e) => setMetaGeral(e.target.value)}
            placeholder="Ex: 100000"
          />
        </div>
      </div>

      <div className="config-section">
        <h2>Metas por Vendedor</h2>
        {Object.entries(metasVendedores).map(([nome, valor]) => (
          <div key={nome} className="vendedor-row">
            <span className="nome">{nome}</span>
            <input
              type="number"
              value={valor}
              onChange={(e) => setMetasVendedores(prev => ({ ...prev, [nome]: e.target.value }))}
              placeholder="Meta individual (R$)"
            />
            <button className="btn-remove" onClick={() => removerVendedor(nome)}>✕</button>
          </div>
        ))}
        
        <div className="add-vendedor-row">
          <input
            type="text"
            value={novoVendedor}
            onChange={(e) => setNovoVendedor(e.target.value)}
            placeholder="Nome do vendedor"
            onKeyDown={(e) => e.key === 'Enter' && adicionarVendedor()}
          />
          <button className="btn-add" onClick={adicionarVendedor}>+ Adicionar</button>
        </div>
      </div>

      <button className="btn-salvar" onClick={salvarMetas} disabled={loading}>
        {loading ? 'Salvando...' : 'Salvar Metas'}
      </button>
      
      {saved && <p className="saved-msg">Metas salvas com sucesso!</p>}
    </div>
  );
}
