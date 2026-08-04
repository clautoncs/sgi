'use client';

import { useState, useEffect, useCallback } from 'react';
import './vendas.css';

interface VendedorResumo {
  nome: string;
  totalVendas: number;
  totalCusto: number;
  lucro: number;
  margemLucro: number;
  qtdVendas: number;
  ticketMedio: number;
  diasAtivos: number;
}

interface EvolucaoDia {
  dia: string;
  valor: number;
  valorDia: number;
}

interface DadosVendas {
  mes: string;
  totalVendas: number;
  totalCusto: number;
  lucroTotal: number;
  margemLucroGeral: number;
  ticketMedio: number;
  qtdVendas: number;
  vendedores: VendedorResumo[];
  evolucaoAcumulada: EvolucaoDia[];
  diasNoMes: number;
}

interface Metas {
  metaGeral: number;
  metasPorVendedor: Record<string, number>;
}

export default function VendasDashboard() {
  const [dados, setDados] = useState<DadosVendas | null>(null);
  const [metas, setMetas] = useState<Metas | null>(null);
  const [mesSelecionado, setMesSelecionado] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);

  const fetchDados = useCallback(async () => {
    try {
      const [vendasRes, metasRes] = await Promise.all([
        fetch(`/api/sheets?month=${mesSelecionado}`),
        fetch(`/api/metas?month=${mesSelecionado}`),
      ]);
      
      if (vendasRes.ok) {
        const vendasData = await vendasRes.json();
        setDados(vendasData);
      } else {
        const err = await vendasRes.json();
        setError(err.error || 'Erro ao carregar dados');
      }
      
      if (metasRes.ok) {
        const metasData = await metasRes.json();
        setMetas(metasData);
      }
      
      setUltimaAtualizacao(new Date());
    } catch (err: any) {
      setError('Erro de conexão: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [mesSelecionado]);

  useEffect(() => {
    setLoading(true);
    fetchDados();
    
    // Auto-refresh a cada 2 minutos
    const interval = setInterval(fetchDados, 120000);
    return () => clearInterval(interval);
  }, [fetchDados]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Gerar opções de meses
  const mesesDisponiveis = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(2026, 7 - i, 1); // Agosto 2026 para trás
    mesesDisponiveis.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    });
  }

  // Calcular dados do gráfico
  const getMetaDiaria = () => {
    if (!metas?.metaGeral) return 0;
    const diasNoMes = new Date(
      parseInt(mesSelecionado.split('-')[0]),
      parseInt(mesSelecionado.split('-')[1]),
      0
    ).getDate();
    return metas.metaGeral / diasNoMes;
  };

  const getProgressoMeta = () => {
    if (!dados || !metas?.metaGeral) return 0;
    return (dados.totalVendas / metas.metaGeral) * 100;
  };

  if (loading) {
    return (
      <div className="vendas-loading">
        <div className="spinner"></div>
        <p>Carregando dados de vendas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="vendas-error">
        <h3>Erro ao carregar dados</h3>
        <p>{error}</p>
        <button onClick={fetchDados}>Tentar novamente</button>
      </div>
    );
  }

  return (
    <div className="vendas-dashboard">
      {/* Header */}
      <div className="vendas-header">
        <div className="vendas-header-left">
          <h1>Dashboard de Vendas</h1>
          <span className="vendas-update-time">
            Atualizado: {ultimaAtualizacao?.toLocaleTimeString('pt-BR')} 
            <span className="auto-refresh-badge">Auto 2min</span>
          </span>
        </div>
        <div className="vendas-header-right">
          <select 
            value={mesSelecionado} 
            onChange={(e) => setMesSelecionado(e.target.value)}
            className="mes-selector"
          >
            {mesesDisponiveis.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Cards Principais */}
      <div className="vendas-cards-grid">
        <div className="vendas-card card-total">
          <div className="card-icon">💰</div>
          <div className="card-content">
            <span className="card-label">Total Vendas</span>
            <span className="card-value">{formatCurrency(dados?.totalVendas || 0)}</span>
            <span className="card-sub">{dados?.qtdVendas || 0} vendas realizadas</span>
          </div>
        </div>

        <div className="vendas-card card-meta">
          <div className="card-icon">🎯</div>
          <div className="card-content">
            <span className="card-label">Meta do Mês</span>
            <span className="card-value">{formatCurrency(metas?.metaGeral || 0)}</span>
            <span className="card-sub">{formatPercent(getProgressoMeta())} atingido</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${Math.min(getProgressoMeta(), 100)}%` }}></div>
          </div>
        </div>

        <div className="vendas-card card-faltante">
          <div className="card-icon">📊</div>
          <div className="card-content">
            <span className="card-label">Meta Faltante</span>
            <span className="card-value">
              {formatCurrency(Math.max((metas?.metaGeral || 0) - (dados?.totalVendas || 0), 0))}
            </span>
            <span className="card-sub">para bater a meta</span>
          </div>
        </div>

        <div className="vendas-card card-ticket">
          <div className="card-icon">🏷️</div>
          <div className="card-content">
            <span className="card-label">Ticket Médio</span>
            <span className="card-value">{formatCurrency(dados?.ticketMedio || 0)}</span>
            <span className="card-sub">por venda</span>
          </div>
        </div>

        <div className="vendas-card card-lucro">
          <div className="card-icon">📈</div>
          <div className="card-content">
            <span className="card-label">Lucro Total</span>
            <span className="card-value">{formatCurrency(dados?.lucroTotal || 0)}</span>
            <span className="card-sub">Margem: {formatPercent(dados?.margemLucroGeral || 0)}</span>
          </div>
        </div>
      </div>

      {/* Gráfico de Evolução */}
      <div className="vendas-section">
        <h2>Evolução Diária vs Meta</h2>
        <div className="grafico-container">
          <div className="grafico-evolucao">
            {dados?.evolucaoAcumulada && dados.evolucaoAcumulada.length > 0 ? (
              <div className="grafico-barras">
                {dados.evolucaoAcumulada.map((dia, idx) => {
                  const maxVal = Math.max(metas?.metaGeral || 0, dados.totalVendas);
                  const alturaReal = maxVal > 0 ? (dia.valor / maxVal) * 100 : 0;
                  const metaDiaria = getMetaDiaria() * (idx + 1);
                  const alturaMeta = maxVal > 0 ? (metaDiaria / maxVal) * 100 : 0;
                  
                  return (
                    <div key={dia.dia} className="grafico-dia" title={`${dia.dia}: ${formatCurrency(dia.valor)}`}>
                      <div className="barra-container">
                        <div className="barra-meta" style={{ height: `${Math.min(alturaMeta, 100)}%` }}></div>
                        <div 
                          className={`barra-real ${dia.valor >= metaDiaria ? 'acima' : 'abaixo'}`}
                          style={{ height: `${Math.min(alturaReal, 100)}%` }}
                        ></div>
                      </div>
                      <span className="dia-label">{dia.dia.split('/')[0]}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="no-data">Sem dados de evolução disponíveis</p>
            )}
          </div>
          <div className="grafico-legenda">
            <span className="legenda-item"><span className="legenda-cor real"></span> Realizado</span>
            <span className="legenda-item"><span className="legenda-cor meta"></span> Meta Projetada</span>
          </div>
        </div>
      </div>

      {/* Tabela de Vendedores */}
      <div className="vendas-section">
        <h2>Performance por Vendedor</h2>
        <div className="vendedores-table-container">
          <table className="vendedores-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Total Vendas</th>
                <th>Meta Individual</th>
                <th>Faltante</th>
                <th>% Meta</th>
                <th>Custo</th>
                <th>Lucro</th>
                <th>Margem %</th>
                <th>Qtd</th>
                <th>Ticket Médio</th>
              </tr>
            </thead>
            <tbody>
              {dados?.vendedores.map(v => {
                const metaIndividual = metas?.metasPorVendedor?.[v.nome] || 0;
                const faltante = Math.max(metaIndividual - v.totalVendas, 0);
                const percMeta = metaIndividual > 0 ? (v.totalVendas / metaIndividual) * 100 : 0;
                
                return (
                  <tr key={v.nome}>
                    <td className="vendedor-nome">{v.nome}</td>
                    <td className="valor-positivo">{formatCurrency(v.totalVendas)}</td>
                    <td>{formatCurrency(metaIndividual)}</td>
                    <td className={faltante > 0 ? 'valor-negativo' : 'valor-positivo'}>
                      {faltante > 0 ? formatCurrency(faltante) : '✅ Batida!'}
                    </td>
                    <td>
                      <div className="mini-progress">
                        <div className="mini-progress-fill" style={{ width: `${Math.min(percMeta, 100)}%` }}></div>
                        <span>{formatPercent(percMeta)}</span>
                      </div>
                    </td>
                    <td>{formatCurrency(v.totalCusto)}</td>
                    <td className="valor-positivo">{formatCurrency(v.lucro)}</td>
                    <td className={v.margemLucro >= 30 ? 'valor-positivo' : 'valor-alerta'}>
                      {formatPercent(v.margemLucro)}
                    </td>
                    <td>{v.qtdVendas}</td>
                    <td>{formatCurrency(v.ticketMedio)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
