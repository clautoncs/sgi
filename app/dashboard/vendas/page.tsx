'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, Legend
} from 'recharts';
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

interface UltimaVenda {
  data: string;
  hora: string;
  vendedor: string;
  produto: string;
  valor: number;
  cliente: string;
  origem: string;
  pagamento: string;
  custo: number;
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
  ultimasVendas: UltimaVenda[];
  diasNoMes: number;
}

interface Metas {
  metaGeral: number;
  metasPorVendedor: Record<string, number>;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatPercent = (value: number) => {
  return `${value.toFixed(1)}%`;
};

// Custom Tooltip do gráfico
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="chart-custom-tooltip">
        <p className="tooltip-label">Dia {label}</p>
        {payload.map((entry: any, idx: number) => {
          if (entry.value === undefined || entry.value === null) return null;
          const labelText = entry.dataKey === 'metaAcumulada'
            ? 'Meta acumulada'
            : 'Vendas acumuladas';
          return (
            <p key={idx} className="tooltip-value" style={{ color: entry.color }}>
              <span className="tooltip-dot" style={{ background: entry.color }}></span>
              {labelText}: {formatCurrency(entry.value)}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

// Animação dos cards
const cardVariants: any = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.1, duration: 0.4, ease: 'easeOut' }
  }),
  hover: { scale: 1.03, y: -4, transition: { duration: 0.2 } }
};

const sectionVariants: any = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
};

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [vendaSelecionada, setVendaSelecionada] = useState<number | null>(null);

  const fetchDados = useCallback(async (silent = false) => {
    try {
      if (silent) setIsRefreshing(true);
      const [vendasRes, metasRes] = await Promise.all([
        fetch(`/api/sheets?month=${mesSelecionado}`),
        fetch(`/api/metas?month=${mesSelecionado}`),
      ]);
      
      if (vendasRes.ok) {
        const vendasData = await vendasRes.json();
        setDados(vendasData);
        setError('');
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
      setIsRefreshing(false);
    }
  }, [mesSelecionado]);

  useEffect(() => {
    setLoading(true);
    fetchDados();
    const interval = setInterval(() => fetchDados(true), 120000);
    return () => clearInterval(interval);
  }, [fetchDados]);

  // Gerar opções de meses
  const mesesDisponiveis = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(2026, 7 - i, 1);
    mesesDisponiveis.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    });
  }

  const getDiasNoMes = () => {
    const [ano, mes] = mesSelecionado.split('-').map(Number);
    return new Date(ano, mes, 0).getDate();
  };

  const getProgressoMeta = () => {
    if (!dados || !metas?.metaGeral) return 0;
    return (dados.totalVendas / metas.metaGeral) * 100;
  };

  // Gerar dados para o gráfico Recharts
  const getChartData = () => {
    const diasNoMes = getDiasNoMes();
    const metaGeral = metas?.metaGeral || 0;
    const metaDiaria = metaGeral / diasNoMes; // meta proporcional por dia

    // Criar array com todos os dias do mês
    const chartData = [];
    const realAcumMap: Record<number, number> = {}; // valor acumulado real
    
    if (dados?.evolucaoAcumulada) {
      dados.evolucaoAcumulada.forEach((item) => {
        const diaNum = parseInt(item.dia.split('/')[0]);
        realAcumMap[diaNum] = item.valor;
      });
    }

    const hoje = new Date().getDate();
    let lastRealAcum: number | null = null;

    for (let d = 1; d <= diasNoMes; d++) {
      // Meta acumulada: (meta total / dias no mês) * dia
      // Reta de 0 até metaGeral no último dia
      const metaAcumulada = Math.round(metaDiaria * d * 100) / 100;

      // Vendas acumuladas reais até o dia
      let vendasAcumuladas: number | undefined = undefined;

      if (d <= hoje) {
        if (realAcumMap[d] !== undefined) {
          lastRealAcum = realAcumMap[d];
          vendasAcumuladas = realAcumMap[d];
        } else if (lastRealAcum !== null) {
          // Dia sem venda: mantém o acumulado anterior
          vendasAcumuladas = lastRealAcum;
        } else {
          vendasAcumuladas = 0;
        }
      }

      chartData.push({
        dia: String(d).padStart(2, '0'),
        metaAcumulada,
        vendasAcumuladas: vendasAcumuladas !== undefined ? Math.round(vendasAcumuladas * 100) / 100 : undefined,
      });
    }

    return chartData;
  };

  if (loading) {
    return (
      <div className="vendas-loading">
        <motion.div
          className="spinner"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        />
        <p>Carregando dados de vendas...</p>
      </div>
    );
  }

  if (error && !dados) {
    return (
      <div className="vendas-error">
        <h3>Erro ao carregar dados</h3>
        <p>{error}</p>
        <button onClick={() => fetchDados()}>Tentar novamente</button>
      </div>
    );
  }

  const chartData = getChartData();
  const metaGeral = metas?.metaGeral || 0;

  // Calcular vendas do dia
  const hoje = new Date();
  const diaHoje = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const vendasHoje = dados?.ultimasVendas?.filter(v => v.data === diaHoje) || [];
  const totalVendasDia = vendasHoje.reduce((acc, v) => acc + v.valor, 0);

  const cards = [
    {
      key: 'vendas-dia',
      className: 'card-dia',
      icon: '☀️',
      label: 'Total Vendas Dia',
      value: formatCurrency(totalVendasDia),
      sub: `${vendasHoje.length} vendas hoje`,
    },
    {
      key: 'total',
      className: 'card-total',
      icon: '💰',
      label: 'Total Vendas',
      value: formatCurrency(dados?.totalVendas || 0),
      sub: `${dados?.qtdVendas || 0} vendas realizadas`,
    },
    {
      key: 'meta',
      className: 'card-meta',
      icon: '🎯',
      label: 'Meta do Mês',
      value: formatCurrency(metaGeral),
      sub: `${formatPercent(getProgressoMeta())} atingido`,
      progress: getProgressoMeta(),
    },
    {
      key: 'faltante',
      className: 'card-faltante',
      icon: '📊',
      label: 'Meta Faltante',
      value: formatCurrency(Math.max(metaGeral - (dados?.totalVendas || 0), 0)),
      sub: 'para bater a meta',
    },
    {
      key: 'ticket',
      className: 'card-ticket',
      icon: '🏷️',
      label: 'Ticket Médio',
      value: formatCurrency(dados?.ticketMedio || 0),
      sub: 'por venda',
    },
    {
      key: 'lucro',
      className: 'card-lucro',
      icon: '📈',
      label: 'Lucro Total',
      value: formatCurrency(dados?.lucroTotal || 0),
      sub: `Margem: ${formatPercent(dados?.margemLucroGeral || 0)}`,
    },
  ];

  return (
    <div className="vendas-dashboard">
      {/* Header */}
      <motion.div
        className="vendas-header"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="vendas-header-left">
          <h1>Dashboard de Vendas</h1>
          <span className="vendas-update-time">
            Atualizado: {ultimaAtualizacao?.toLocaleTimeString('pt-BR')}
            {isRefreshing && <span className="refresh-pulse"></span>}
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
          <button className="btn-refresh" onClick={() => fetchDados(true)} title="Atualizar agora">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" className={isRefreshing ? 'spinning' : ''}>
              <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>
      </motion.div>

      {/* Cards Principais */}
      <div className="vendas-cards-grid">
        {cards.map((card, i) => (
          <motion.div
            key={card.key}
            className={`vendas-card ${card.className}`}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            whileHover="hover"
            custom={i}
          >
            <div className="card-icon">{card.icon}</div>
            <div className="card-content">
              <span className="card-label">{card.label}</span>
              <span className="card-value">{card.value}</span>
              <span className="card-sub">{card.sub}</span>
            </div>
            {card.progress !== undefined && (
              <div className="progress-bar">
                <motion.div
                  className="progress-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(card.progress, 100)}%` }}
                  transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
                />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Vendas do Dia */}
      <motion.div
        className="vendas-section"
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="section-header">
          <h2>Vendas do Dia</h2>
          <span className="badge badge-green">
            {(() => {
              const hoje = new Date();
              const diaHoje = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}`;
              return dados?.ultimasVendas?.filter(v => v.data === diaHoje).length || 0;
            })()} negociações hoje
          </span>
        </div>
        <div className="ultimas-vendas-container">
          <AnimatePresence>
            {(() => {
              const hoje = new Date();
              const diaHoje = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}`;
              const vendasDoDia = dados?.ultimasVendas?.filter(v => v.data === diaHoje) || [];
              if (vendasDoDia.length === 0) {
                return <p className="no-data">Nenhuma venda registrada hoje</p>;
              }
              return vendasDoDia.map((venda, idx) => (
                <motion.div
                  key={`${venda.data}-${venda.produto}-${idx}`}
                  className={`venda-card ${vendaSelecionada === idx ? 'venda-card-expanded' : ''}`}
                  initial={{ opacity: 0, x: -50, scale: 0.8 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ delay: idx * 0.05, duration: 0.3 }}
                  whileHover={{ scale: 1.1, zIndex: 10 }}
                  onClick={() => setVendaSelecionada(vendaSelecionada === idx ? null : idx)}
                  layout
                >
                  <span className="venda-data-hora">{venda.data} • {venda.hora || 'Hoje'}</span>
                  <div className="venda-card-content">
                    <span className="venda-produto">{venda.produto || 'Produto'}</span>
                    <span className="venda-valor">{formatCurrency(venda.valor)}</span>
                  </div>
                  {vendaSelecionada === idx && (
                    <motion.div
                      className="venda-detalhes"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="detalhe-row"><span>Vendedor:</span><span>{venda.vendedor}</span></div>
                      <div className="detalhe-row"><span>Cliente:</span><span>{venda.cliente || '—'}</span></div>
                      <div className="detalhe-row"><span>Origem:</span><span>{venda.origem || '—'}</span></div>
                      <div className="detalhe-row"><span>Pagamento:</span><span>{venda.pagamento || '—'}</span></div>
                      <div className="detalhe-row"><span>Custo:</span><span>{formatCurrency(venda.custo)}</span></div>
                      <div className="detalhe-row lucro"><span>Lucro:</span><span>{formatCurrency(venda.valor - venda.custo)}</span></div>
                    </motion.div>
                  )}
                </motion.div>
              ));
            })()}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Gráfico de Evolução - Recharts */}
      <motion.div
        className="vendas-section"
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="section-header">
          <h2>Evolução Diária vs Meta</h2>
          <div className="section-badges">
            <span className="badge badge-green">Vendas Acumuladas</span>
            <span className="badge badge-orange">Meta Acumulada</span>
          </div>
        </div>
        {metaGeral > 0 ? (
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                <defs>
                  <linearGradient id="gradientReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="dia"
                  stroke="#475569"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={{ stroke: '#334155' }}
                />
                <YAxis
                  stroke="#475569"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={{ stroke: '#334155' }}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                  domain={[0, metaGeral]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="vendasAcumuladas"
                  stroke="#10b981"
                  strokeWidth={3}
                  fill="url(#gradientReal)"
                  dot={false}
                  activeDot={{ r: 7, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                  name="Vendas Acumuladas"
                  animationDuration={2000}
                  animationEasing="ease-in-out"
                  connectNulls={false}
                />
                <Line
                  type="linear"
                  dataKey="metaAcumulada"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  strokeDasharray="8 4"
                  dot={false}
                  activeDot={{ r: 6, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }}
                  name="Meta Acumulada"
                  animationDuration={1500}
                  animationEasing="ease-in-out"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="no-data">Configure a meta do mês para visualizar o gráfico de evolução</p>
        )}
      </motion.div>

      {/* Tabela de Vendedores */}
      <motion.div
        className="vendas-section"
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.2 }}
      >
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
              {dados?.vendedores.map((v, idx) => {
                const metaIndividual = metas?.metasPorVendedor?.[v.nome] || 0;
                const faltante = Math.max(metaIndividual - v.totalVendas, 0);
                const percMeta = metaIndividual > 0 ? (v.totalVendas / metaIndividual) * 100 : 0;
                
                return (
                  <motion.tr
                    key={v.nome}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + idx * 0.1, duration: 0.3 }}
                    whileHover={{ backgroundColor: 'rgba(77, 159, 255, 0.05)' }}
                  >
                    <td className="vendedor-nome">{v.nome}</td>
                    <td className="valor-positivo">{formatCurrency(v.totalVendas)}</td>
                    <td>{formatCurrency(metaIndividual)}</td>
                    <td className={faltante > 0 ? 'valor-negativo' : 'valor-positivo'}>
                      {faltante > 0 ? formatCurrency(faltante) : '✅ Batida!'}
                    </td>
                    <td>
                      <div className="mini-progress">
                        <div className="mini-progress-bar">
                          <motion.div
                            className="mini-progress-fill"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(percMeta, 100)}%` }}
                            transition={{ duration: 1, delay: 0.5 + idx * 0.1 }}
                          />
                        </div>
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
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
