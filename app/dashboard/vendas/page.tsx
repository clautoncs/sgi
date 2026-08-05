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

  // Total de dias no mês selecionado
  const getDiasNoMes = () => {
    const [ano, mes] = mesSelecionado.split('-').map(Number);
    return new Date(ano, mes, 0).getDate();
  };

  const getProgressoMeta = () => {
    if (!dados || !metas?.metaGeral) return 0;
    return (dados.totalVendas / metas.metaGeral) * 100;
  };

  // Gerar dados para o gráfico de linhas
  const getChartData = () => {
    const diasNoMes = getDiasNoMes();
    const metaGeral = metas?.metaGeral || 0;
    
    // Linha de referência: do dia 1 ao último dia, de 0 até a meta
    // Cada dia tem um valor proporcional
    const refPoints: { dia: number; valor: number }[] = [];
    for (let d = 1; d <= diasNoMes; d++) {
      refPoints.push({ dia: d, valor: (metaGeral / diasNoMes) * d });
    }

    // Linha real: acumulado por dia (baseado nos dados reais)
    const realPoints: { dia: number; valor: number }[] = [];
    if (dados?.evolucaoAcumulada) {
      dados.evolucaoAcumulada.forEach((item) => {
        const diaNum = parseInt(item.dia.split('/')[0]);
        realPoints.push({ dia: diaNum, valor: item.valor });
      });
    }

    return { refPoints, realPoints, diasNoMes, metaGeral };
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

  const chartData = getChartData();
  const { refPoints, realPoints, diasNoMes, metaGeral } = chartData;

  // SVG chart dimensions
  const chartWidth = 800;
  const chartHeight = 280;
  const paddingLeft = 80;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  // Scale functions
  const xScale = (dia: number) => paddingLeft + ((dia - 1) / (diasNoMes - 1)) * plotWidth;
  const yScale = (valor: number) => paddingTop + plotHeight - (valor / metaGeral) * plotHeight;

  // Gerar path da linha de referência (laranja tracejada)
  const refPath = refPoints.map((p, i) => {
    const x = xScale(p.dia);
    const y = yScale(p.valor);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  // Gerar path da linha real (sólida)
  const realPath = realPoints.length > 0
    ? realPoints.map((p, i) => {
        const x = xScale(p.dia);
        const y = yScale(p.valor);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ')
    : '';

  // Gerar path do preenchimento (area fill)
  const realFillPath = realPoints.length > 0
    ? `${realPoints.map((p, i) => {
        const x = xScale(p.dia);
        const y = yScale(p.valor);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ')} L ${xScale(realPoints[realPoints.length - 1].dia)} ${yScale(0)} L ${xScale(realPoints[0].dia)} ${yScale(0)} Z`
    : '';

  // Y-axis labels
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    value: metaGeral * f,
    y: yScale(metaGeral * f),
  }));

  // X-axis labels (a cada 5 dias)
  const xLabels: { dia: number; x: number }[] = [];
  for (let d = 1; d <= diasNoMes; d += 5) {
    xLabels.push({ dia: d, x: xScale(d) });
  }
  if (xLabels[xLabels.length - 1]?.dia !== diasNoMes) {
    xLabels.push({ dia: diasNoMes, x: xScale(diasNoMes) });
  }

  // Dia atual (para marcador)
  const hoje = new Date().getDate();
  const diaAtualNoGrafico = Math.min(hoje, diasNoMes);

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

      {/* Gráfico de Evolução - SVG Line Chart */}
      <div className="vendas-section">
        <h2>Evolução Diária vs Meta</h2>
        <div className="grafico-container">
          {metaGeral > 0 ? (
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="chart-svg" preserveAspectRatio="xMidYMid meet">
              {/* Grid lines horizontais */}
              {yLabels.map((label, i) => (
                <g key={i}>
                  <line
                    x1={paddingLeft}
                    y1={label.y}
                    x2={chartWidth - paddingRight}
                    y2={label.y}
                    stroke="#334155"
                    strokeWidth="0.5"
                    strokeDasharray={i === yLabels.length - 1 ? "none" : "4 4"}
                  />
                  <text
                    x={paddingLeft - 10}
                    y={label.y + 4}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="11"
                    fontFamily="monospace"
                  >
                    {label.value >= 1000 ? `${(label.value / 1000).toFixed(0)}k` : label.value.toFixed(0)}
                  </text>
                </g>
              ))}

              {/* X-axis labels */}
              {xLabels.map((label, i) => (
                <text
                  key={i}
                  x={label.x}
                  y={chartHeight - 10}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  {String(label.dia).padStart(2, '0')}
                </text>
              ))}

              {/* Linha vertical do dia atual */}
              <line
                x1={xScale(diaAtualNoGrafico)}
                y1={paddingTop}
                x2={xScale(diaAtualNoGrafico)}
                y2={paddingTop + plotHeight}
                stroke="#475569"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <text
                x={xScale(diaAtualNoGrafico)}
                y={paddingTop - 6}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="10"
                fontFamily="monospace"
              >
                HOJE
              </text>

              {/* Linha de referência (laranja tracejada) - onde deveríamos estar */}
              <path
                d={refPath}
                fill="none"
                stroke="#f97316"
                strokeWidth="2.5"
                strokeDasharray="8 5"
                strokeLinecap="round"
              />

              {/* Pontos na linha de referência - tooltip no hover */}
              {refPoints.filter((_, i) => i % 5 === 4 || i === 0 || i === refPoints.length - 1).map((p, i) => (
                <g key={`ref-${i}`} className="chart-point-group chart-point-ref">
                  <circle
                    cx={xScale(p.dia)}
                    cy={yScale(p.valor)}
                    r="14"
                    fill="transparent"
                    className="chart-point-hover-area"
                  />
                  <circle
                    cx={xScale(p.dia)}
                    cy={yScale(p.valor)}
                    r="4"
                    fill="#f97316"
                    stroke="#0f172a"
                    strokeWidth="2"
                    className="chart-point-dot-ref"
                  />
                  <g className="chart-point-tooltip">
                    <rect
                      x={xScale(p.dia) - 44}
                      y={yScale(p.valor) - 32}
                      width="88"
                      height="22"
                      rx="4"
                      fill="#1e293b"
                      stroke="#f97316"
                      strokeWidth="1"
                    />
                    <text
                      x={xScale(p.dia)}
                      y={yScale(p.valor) - 17}
                      textAnchor="middle"
                      fill="#f97316"
                      fontSize="11"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {formatCurrency(p.valor)}
                    </text>
                  </g>
                </g>
              ))}

              {/* Preenchimento da área real (gradiente) */}
              {realFillPath && (
                <>
                  <defs>
                    <linearGradient id="realGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
                    </linearGradient>
                  </defs>
                  <path
                    d={realFillPath}
                    fill="url(#realGradient)"
                  />
                </>
              )}

              {/* Linha real (sólida verde) - onde estamos */}
              {realPath && (
                <path
                  d={realPath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Pontos nos dados reais - tooltip aparece no hover */}
              {realPoints.map((p, i) => (
                <g key={i} className="chart-point-group">
                  {/* Área de hover maior (invisível) */}
                  <circle
                    cx={xScale(p.dia)}
                    cy={yScale(p.valor)}
                    r="14"
                    fill="transparent"
                    className="chart-point-hover-area"
                  />
                  {/* Ponto visível */}
                  <circle
                    cx={xScale(p.dia)}
                    cy={yScale(p.valor)}
                    r="5"
                    fill="#10b981"
                    stroke="#0f172a"
                    strokeWidth="2"
                    className="chart-point-dot"
                  />
                  {/* Tooltip - aparece no hover */}
                  <g className="chart-point-tooltip">
                    <rect
                      x={xScale(p.dia) - 40}
                      y={yScale(p.valor) - 32}
                      width="80"
                      height="22"
                      rx="4"
                      fill="#1e293b"
                      stroke="#475569"
                      strokeWidth="1"
                    />
                    <text
                      x={xScale(p.dia)}
                      y={yScale(p.valor) - 17}
                      textAnchor="middle"
                      fill="#e2e8f0"
                      fontSize="11"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {formatCurrency(p.valor)}
                    </text>
                  </g>
                </g>
              ))}

              {/* Label meta no final */}
              <text
                x={chartWidth - paddingRight + 5}
                y={yScale(metaGeral) + 4}
                textAnchor="start"
                fill="#f97316"
                fontSize="10"
                fontWeight="bold"
                fontFamily="monospace"
              >
                META
              </text>

              {/* Eixo Y label */}
              <text
                x={12}
                y={chartHeight / 2}
                textAnchor="middle"
                fill="#64748b"
                fontSize="10"
                fontFamily="monospace"
                transform={`rotate(-90, 12, ${chartHeight / 2})`}
              >
                VALOR (R$)
              </text>
            </svg>
          ) : (
            <p className="no-data">Configure a meta do mês para visualizar o gráfico de evolução</p>
          )}
          <div className="grafico-legenda">
            <span className="legenda-item">
              <span className="legenda-cor legenda-real-line"></span> Posição Atual (realizado)
            </span>
            <span className="legenda-item">
              <span className="legenda-cor legenda-ref-line"></span> Referência (onde deveríamos estar)
            </span>
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
